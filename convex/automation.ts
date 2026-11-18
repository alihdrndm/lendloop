import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, query } from "./_generated/server";
import { requireAdmin } from "./lib/auth";
import { todayUtc, vAutomationKind, vAutomationStatus, vLoanStatus } from "./lib/domain";
import { signBody, SIGNATURE_HEADER, TIMESTAMP_HEADER } from "./lib/hmac";

// Convex -> n8n: every loan status change is pushed to the n8n
// "request-notification" webhook. Delivery runs in an action (it does network
// I/O) and retries with exponential backoff through the scheduler.

const MAX_ATTEMPTS = 4;
const BACKOFF_MS = [0, 5_000, 30_000, 120_000];

/** Only the fields n8n needs to write one notification. No ids of people, no descriptions. */
export const notificationPayload = internalQuery({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const loan = await ctx.db.get(loanId);
    if (!loan) return null;
    const [tool, lender, borrower] = await Promise.all([
      ctx.db.get(loan.toolId),
      ctx.db.get(loan.lenderId),
      ctx.db.get(loan.borrowerId),
    ]);
    if (!tool || !lender || !borrower) return null;
    // A new request concerns the lender; every later change concerns the borrower.
    const recipient = loan.status === "requested" ? lender : borrower;
    const other = loan.status === "requested" ? borrower : lender;
    return {
      loanId: loan._id,
      status: loan.status,
      toolName: tool.name,
      startDate: loan.startDate,
      endDate: loan.endDate,
      recipient: { firstName: recipient.name.split(" ")[0], email: recipient.email },
      otherPartyFirstName: other.name.split(" ")[0],
    };
  },
});

export const deliverNotification = internalAction({
  args: { loanId: v.id("loans"), status: vLoanStatus, eventId: v.string(), attempt: v.number() },
  handler: async (ctx, args) => {
    const url = process.env.N8N_REQUEST_WEBHOOK_URL;
    const secret = process.env.N8N_INBOUND_SECRET;
    if (!url || !secret) {
      // Automations are optional for local UI work; say so instead of failing quietly.
      console.warn("n8n is not configured (N8N_REQUEST_WEBHOOK_URL / N8N_INBOUND_SECRET); skipping", args.eventId);
      return;
    }

    const data = await ctx.runQuery(internal.automation.notificationPayload, { loanId: args.loanId });
    if (!data) return;
    // The status may have moved on since this was scheduled; send what the event was about.
    const payload = JSON.stringify({ eventId: args.eventId, ...data, status: args.status });
    const { timestamp, signature } = await signBody(secret, payload);

    let error: string | null = null;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [TIMESTAMP_HEADER]: timestamp,
          [SIGNATURE_HEADER]: signature,
        },
        // n8n verifies the signature over this exact string, so it travels as a string.
        body: JSON.stringify({ payload }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) error = `n8n answered ${res.status}`;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    if (!error) return;

    const next = args.attempt + 1;
    if (next < MAX_ATTEMPTS) {
      await ctx.scheduler.runAfter(BACKOFF_MS[next], internal.automation.deliverNotification, {
        ...args,
        attempt: next,
      });
      return;
    }
    await ctx.runMutation(internal.automation.recordFailure, {
      source: "convex",
      workflow: "request-notification",
      message: `Gave up after ${MAX_ATTEMPTS} attempts: ${error}`,
      loanId: args.loanId,
      idempotencyKey: `deliver:${args.eventId}`,
    });
    await ctx.runMutation(internal.automation.recordEvent, {
      loanId: args.loanId,
      kind: "request_notification",
      status: "failed",
      idempotencyKey: args.eventId,
      detail: "Delivery to n8n failed",
    });
  },
});

/**
 * Idempotent write: the same idempotencyKey always maps to one row, so n8n can
 * retry a write-back as often as it likes without creating duplicates.
 */
export const recordEvent = internalMutation({
  args: {
    loanId: v.id("loans"),
    kind: vAutomationKind,
    status: vAutomationStatus,
    idempotencyKey: v.string(),
    channel: v.optional(v.string()),
    detail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("automationEvents")
      .withIndex("by_idempotency_key", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .unique();
    if (existing) {
      // Upgrade a failure to success if a later retry got through; never downgrade.
      if (existing.status === "failed" && args.status === "sent") {
        await ctx.db.patch(existing._id, { status: "sent", channel: args.channel, detail: args.detail });
      }
      return { id: existing._id, duplicate: true };
    }
    const id = await ctx.db.insert("automationEvents", args);
    return { id, duplicate: false };
  },
});

export const recordFailure = internalMutation({
  args: {
    source: v.union(v.literal("convex"), v.literal("n8n")),
    workflow: v.string(),
    message: v.string(),
    loanId: v.optional(v.id("loans")),
    executionId: v.optional(v.string()),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("automationFailures")
      .withIndex("by_idempotency_key", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .unique();
    if (existing) return { id: existing._id, duplicate: true };
    const id = await ctx.db.insert("automationFailures", { ...args, message: args.message.slice(0, 500) });
    return { id, duplicate: false };
  },
});

/** n8n's daily job: approved loans past their end date, with only what a reminder needs. */
export const overdueLoans = internalQuery({
  args: {},
  handler: async (ctx) => {
    const today = todayUtc();
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_status_endDate", (q) => q.eq("status", "approved").lt("endDate", today))
      .collect();
    const rows = [];
    for (const loan of loans) {
      const [tool, borrower] = await Promise.all([ctx.db.get(loan.toolId), ctx.db.get(loan.borrowerId)]);
      if (!tool || !borrower) continue;
      rows.push({
        loanId: loan._id as Id<"loans">,
        toolName: tool.name,
        endDate: loan.endDate,
        borrower: { firstName: borrower.name.split(" ")[0], email: borrower.email },
      });
    }
    return { today, loans: rows };
  },
});

/** Admin: recent automation failures, so problems are visible in the app. */
export const recentFailures = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("automationFailures").order("desc").take(20);
    return rows.map((f) => ({
      _id: f._id,
      at: f._creationTime,
      source: f.source,
      workflow: f.workflow,
      message: f.message,
    }));
  },
});
