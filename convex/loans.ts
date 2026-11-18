import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { Forbidden, getActiveTool, requireAdmin, requireUser } from "./lib/auth";
import { isValidDay, todayUtc, type LoanStatus } from "./lib/domain";
import { onLoanChanged } from "./lib/notify";

// Loan state machine. Anything not listed here is rejected on the server.
//   requested -> approved | declined  (lender)
//   requested -> cancelled            (borrower)
//   approved  -> returned             (lender or borrower)

const MAX_LOAN_DAYS = 60;

function invalid(message: string): never {
  throw new ConvexError({ code: "INVALID", message });
}

function daysBetween(start: string, end: string): number {
  return (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000;
}

const overlaps = (a: { startDate: string; endDate: string }, b: { startDate: string; endDate: string }) =>
  a.startDate <= b.endDate && b.startDate <= a.endDate;

async function assertNoApprovedOverlap(
  ctx: QueryCtx,
  toolId: Id<"tools">,
  range: { startDate: string; endDate: string },
  ignore?: Id<"loans">,
) {
  const approved = await ctx.db
    .query("loans")
    .withIndex("by_tool_status", (q) => q.eq("toolId", toolId).eq("status", "approved"))
    .collect();
  if (approved.some((loan) => loan._id !== ignore && overlaps(loan, range))) {
    throw new ConvexError({
      code: "CONFLICT",
      message: "Those dates clash with a loan that is already approved.",
    });
  }
}

async function getLoan(ctx: QueryCtx, loanId: Id<"loans">) {
  const loan = await ctx.db.get(loanId);
  if (!loan) throw new ConvexError({ code: "NOT_FOUND", message: "That request no longer exists." });
  return loan;
}

async function transition(ctx: MutationCtx, loan: Doc<"loans">, to: LoanStatus, patch: Partial<Doc<"loans">> = {}) {
  await ctx.db.patch(loan._id, { status: to, ...patch });
  await onLoanChanged(ctx, loan._id, to);
}

export const request = mutation({
  args: { toolId: v.id("tools"), startDate: v.string(), endDate: v.string() },
  handler: async (ctx, { toolId, startDate, endDate }) => {
    const viewer = await requireUser(ctx);
    const tool = await getActiveTool(ctx, toolId);
    if (tool.ownerId === viewer._id) invalid("You can't borrow your own tool.");

    if (!isValidDay(startDate) || !isValidDay(endDate)) invalid("Please pick valid dates.");
    if (startDate < todayUtc()) invalid("The start date can't be in the past.");
    if (endDate < startDate) invalid("The end date must be on or after the start date.");
    if (daysBetween(startDate, endDate) > MAX_LOAN_DAYS) invalid(`Loans can be at most ${MAX_LOAN_DAYS} days.`);

    await assertNoApprovedOverlap(ctx, toolId, { startDate, endDate });

    const mine = await ctx.db
      .query("loans")
      .withIndex("by_borrower", (q) => q.eq("borrowerId", viewer._id))
      .collect();
    if (mine.some((l) => l.toolId === toolId && l.status === "requested")) {
      invalid("You already have a pending request for this tool.");
    }

    const loanId = await ctx.db.insert("loans", {
      toolId,
      lenderId: tool.ownerId,
      borrowerId: viewer._id,
      startDate,
      endDate,
      status: "requested",
    });
    await onLoanChanged(ctx, loanId, "requested");
    return loanId;
  },
});

/** Lender approves or declines a pending request on their own tool. */
export const decide = mutation({
  args: { loanId: v.id("loans"), approve: v.boolean() },
  handler: async (ctx, { loanId, approve }) => {
    const viewer = await requireUser(ctx);
    const loan = await getLoan(ctx, loanId);
    if (loan.lenderId !== viewer._id) throw new Forbidden("Only the owner of this tool can decide.");
    if (loan.status !== "requested") invalid("This request has already been handled.");

    if (approve) {
      await getActiveTool(ctx, loan.toolId);
      await assertNoApprovedOverlap(ctx, loan.toolId, loan, loan._id);
      await transition(ctx, loan, "approved", { decidedAt: Date.now() });
    } else {
      await transition(ctx, loan, "declined", { decidedAt: Date.now() });
    }
  },
});

export const cancel = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const viewer = await requireUser(ctx);
    const loan = await getLoan(ctx, loanId);
    if (loan.borrowerId !== viewer._id) throw new Forbidden("Only the borrower can cancel this request.");
    if (loan.status !== "requested") invalid("Only pending requests can be cancelled.");
    await transition(ctx, loan, "cancelled");
  },
});

export const markReturned = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, { loanId }) => {
    const viewer = await requireUser(ctx);
    const loan = await getLoan(ctx, loanId);
    if (loan.lenderId !== viewer._id && loan.borrowerId !== viewer._id) {
      throw new Forbidden("Only the lender or borrower can mark this returned.");
    }
    if (loan.status !== "approved") invalid("Only approved loans can be marked returned.");
    await transition(ctx, loan, "returned", { returnedAt: Date.now() });
  },
});

// ---------- read models ----------

async function present(ctx: QueryCtx, loan: Doc<"loans">) {
  const [tool, lender, borrower] = await Promise.all([
    ctx.db.get(loan.toolId),
    ctx.db.get(loan.lenderId),
    ctx.db.get(loan.borrowerId),
  ]);
  const activity = await ctx.db
    .query("automationEvents")
    .withIndex("by_loan", (q) => q.eq("loanId", loan._id))
    .order("desc")
    .take(5);
  return {
    _id: loan._id,
    toolName: tool?.name ?? "Removed tool",
    toolRemoved: !tool || tool.removedAt !== undefined,
    lenderName: lender?.name ?? "",
    borrowerName: borrower?.name ?? "",
    startDate: loan.startDate,
    endDate: loan.endDate,
    status: loan.status,
    overdue: loan.status === "approved" && loan.endDate < todayUtc(),
    activity: activity.map((e) => ({
      kind: e.kind,
      status: e.status,
      channel: e.channel ?? null,
      at: e._creationTime,
    })),
  };
}

export const myRequests = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireUser(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_borrower", (q) => q.eq("borrowerId", viewer._id))
      .order("desc")
      .collect();
    return Promise.all(loans.map((l) => present(ctx, l)));
  },
});

export const incoming = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireUser(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_lender", (q) => q.eq("lenderId", viewer._id))
      .order("desc")
      .collect();
    return Promise.all(loans.map((l) => present(ctx, l)));
  },
});

export const allForAdmin = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const loans = await ctx.db.query("loans").order("desc").take(200);
    return Promise.all(loans.map((l) => present(ctx, l)));
  },
});
