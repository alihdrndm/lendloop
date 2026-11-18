import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { signBody, SIGNATURE_HEADER, TIMESTAMP_HEADER } from "./lib/hmac";
import schema from "./schema";
import { modules } from "./test.setup";

const SECRET = "inbound-test-secret";
const LEE = { name: "Lee Lender", email: "lee@example.com", tokenIdentifier: "t|lee", subject: "lee" };
const BO = { name: "Bo Borrower", email: "bo@example.com", tokenIdentifier: "t|bo", subject: "bo" };
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

beforeEach(() => vi.stubEnv("CONVEX_INBOUND_SECRET", SECRET));
afterEach(() => vi.unstubAllEnvs());

async function withApprovedLoan() {
  const t = convexTest(schema, modules);
  const lee = t.withIdentity(LEE);
  const bo = t.withIdentity(BO);
  await lee.mutation(api.users.store, {});
  await bo.mutation(api.users.store, {});
  const toolId = await lee.mutation(api.tools.create, {
    name: "Ladder",
    category: "hand_tools",
    condition: "good",
    description: "",
  });
  const loanId = await bo.mutation(api.loans.request, { toolId, startDate: day(1), endDate: day(2) });
  await lee.mutation(api.loans.decide, { loanId, approve: true });
  return { t, lee, bo, loanId };
}

async function signedPost(t: ReturnType<typeof convexTest>, path: string, payload: unknown, secret = SECRET) {
  const body = JSON.stringify(payload);
  const { timestamp, signature } = await signBody(secret, body);
  return t.fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", [TIMESTAMP_HEADER]: timestamp, [SIGNATURE_HEADER]: signature },
    body,
  });
}

describe("n8n -> Convex endpoints", () => {
  test("unsigned and wrongly signed calls are rejected", async () => {
    const { t, loanId } = await withApprovedLoan();
    const unsigned = await t.fetch("/automation-events", { method: "POST", body: JSON.stringify({ loanId }) });
    expect(unsigned.status).toBe(401);
    const wrong = await signedPost(t, "/automation-events", { loanId }, "not-the-secret");
    expect(wrong.status).toBe(401);
    const get = await t.fetch("/overdue-loans", { method: "GET" });
    expect(get.status).toBe(401);
  });

  test("write-backs are idempotent: a retry never creates a second record", async () => {
    const { t, bo, loanId } = await withApprovedLoan();
    const event = {
      loanId,
      kind: "overdue_reminder",
      status: "sent",
      channel: "log",
      idempotencyKey: `overdue:${loanId}:2026-11-20`,
    };
    const first = await signedPost(t, "/automation-events", event);
    const retry = await signedPost(t, "/automation-events", event);
    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);

    const [loan] = await bo.query(api.loans.myRequests, {});
    expect(loan.activity.filter((a) => a.kind === "overdue_reminder")).toHaveLength(1);
  });

  test("bad payloads get a 400, not a crash", async () => {
    const { t } = await withApprovedLoan();
    const res = await signedPost(t, "/automation-events", { loanId: "not-a-loan", kind: "x" });
    expect(res.status).toBe(400);
  });

  test("overdue list only contains what a reminder needs", async () => {
    const { t, loanId } = await withApprovedLoan();
    await t.run(async (ctx) => ctx.db.patch(loanId, { startDate: day(-5), endDate: day(-2) }));

    const { timestamp, signature } = await signBody(SECRET, "GET /overdue-loans");
    const res = await t.fetch("/overdue-loans", {
      method: "GET",
      headers: { [TIMESTAMP_HEADER]: timestamp, [SIGNATURE_HEADER]: signature },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.loans).toHaveLength(1);
    expect(Object.keys(body.loans[0]).sort()).toEqual(["borrower", "endDate", "loanId", "toolName"]);
    expect(Object.keys(body.loans[0].borrower).sort()).toEqual(["email", "firstName"]);
  });
});
