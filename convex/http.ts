import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { httpAction, type ActionCtx } from "./_generated/server";
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, verifyBody } from "./lib/hmac";

// n8n -> Convex. Every endpoint requires a valid HMAC signature made with
// CONVEX_INBOUND_SECRET (a different secret from the Convex -> n8n direction).
// For POST the signed string is the raw body; for GET it is "GET <path>", so a
// signature can't be reused against another endpoint.

const http = httpRouter();

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function authorize(req: Request, signedBody: string): Promise<Response | null> {
  const result = await verifyBody(process.env.CONVEX_INBOUND_SECRET ?? "", {
    body: signedBody,
    timestamp: req.headers.get(TIMESTAMP_HEADER),
    signature: req.headers.get(SIGNATURE_HEADER),
  });
  if (result.ok) return null;
  console.warn(`Rejected n8n call to ${new URL(req.url).pathname}: ${result.reason}`);
  return json(401, { error: "invalid signature" });
}

function parse(body: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(body);
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

const str = (value: unknown, max = 200) =>
  typeof value === "string" && value.length > 0 && value.length <= max ? value : null;

async function asLoanId(ctx: ActionCtx, value: unknown): Promise<Id<"loans"> | null> {
  const raw = str(value, 64);
  if (!raw) return null;
  return await ctx.runQuery(internal.httpHelpers.normalizeLoanId, { id: raw });
}

http.route({
  path: "/overdue-loans",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const denied = await authorize(req, "GET /overdue-loans");
    if (denied) return denied;
    return json(200, await ctx.runQuery(internal.automation.overdueLoans, {}));
  }),
});

http.route({
  path: "/automation-events",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const body = await req.text();
    const denied = await authorize(req, body);
    if (denied) return denied;

    const data = parse(body);
    const loanId = await asLoanId(ctx, data?.loanId);
    const kind = data?.kind;
    const status = data?.status;
    const idempotencyKey = str(data?.idempotencyKey);
    if (
      !loanId ||
      !idempotencyKey ||
      (kind !== "request_notification" && kind !== "overdue_reminder") ||
      (status !== "sent" && status !== "failed")
    ) {
      return json(400, { error: "loanId, kind, status and idempotencyKey are required" });
    }

    const result = await ctx.runMutation(internal.automation.recordEvent, {
      loanId,
      kind,
      status,
      idempotencyKey,
      channel: str(data?.channel, 20) ?? undefined,
      detail: str(data?.detail, 200) ?? undefined,
    });
    return json(result.duplicate ? 200 : 201, result);
  }),
});

http.route({
  path: "/automation-failures",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const body = await req.text();
    const denied = await authorize(req, body);
    if (denied) return denied;

    const data = parse(body);
    const workflow = str(data?.workflow, 100);
    const message = str(data?.message, 2000);
    const idempotencyKey = str(data?.idempotencyKey);
    if (!workflow || !message || !idempotencyKey) {
      return json(400, { error: "workflow, message and idempotencyKey are required" });
    }
    const result = await ctx.runMutation(internal.automation.recordFailure, {
      source: "n8n",
      workflow,
      message,
      executionId: str(data?.executionId, 100) ?? undefined,
      loanId: (await asLoanId(ctx, data?.loanId)) ?? undefined,
      idempotencyKey,
    });
    return json(result.duplicate ? 200 : 201, result);
  }),
});

export default http;
