import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

const ADMIN = { name: "Ada Admin", email: "ada@example.com", tokenIdentifier: "t|ada", subject: "ada" };
const LEE = { name: "Lee Lender", email: "lee@example.com", tokenIdentifier: "t|lee", subject: "lee" };
const BO = { name: "Bo Borrower", email: "bo@example.com", tokenIdentifier: "t|bo", subject: "bo" };
const EVE = { name: "Eve Other", email: "eve@example.com", tokenIdentifier: "t|eve", subject: "eve" };

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

async function setup() {
  const t = convexTest(schema, modules);
  const admin = t.withIdentity(ADMIN);
  const lee = t.withIdentity(LEE);
  const bo = t.withIdentity(BO);
  const eve = t.withIdentity(EVE);
  for (const u of [admin, lee, bo, eve]) await u.mutation(api.users.store, {});
  const drill = await lee.mutation(api.tools.create, {
    name: "Cordless drill",
    category: "power_tools",
    condition: "good",
    description: "Two batteries included",
  });
  return { t, admin, lee, bo, eve, drill };
}

beforeEach(() => {
  vi.stubEnv("ADMIN_EMAILS", "ada@example.com");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("roles", () => {
  test("admin role comes from ADMIN_EMAILS, not the client", async () => {
    const { admin, bo } = await setup();
    expect((await admin.query(api.users.me, {}))?.role).toBe("admin");
    expect((await bo.query(api.users.me, {}))?.role).toBe("user");
  });

  test("admin-only functions reject normal users", async () => {
    const { bo } = await setup();
    await expect(bo.query(api.loans.allForAdmin, {})).rejects.toThrow(/Only admins/);
    await expect(bo.query(api.users.listForAdmin, {})).rejects.toThrow(/Only admins/);
  });

  test("signed-out callers can't use member functions", async () => {
    const { t } = await setup();
    await expect(t.query(api.tools.list, {})).rejects.toThrow(/sign in/);
  });
});

describe("listings", () => {
  test("public list leaks only name and category", async () => {
    const { t } = await setup();
    const rows = await t.query(api.tools.listPublic, {});
    expect(rows).toEqual([{ name: "Cordless drill", category: "power_tools" }]);
  });

  test("users can't edit or delete someone else's listing", async () => {
    const { eve, drill } = await setup();
    await expect(
      eve.mutation(api.tools.update, {
        toolId: drill,
        name: "Mine now",
        category: "power_tools",
        condition: "good",
        description: "",
      }),
    ).rejects.toThrow(/your own listings/);
    await expect(eve.mutation(api.tools.remove, { toolId: drill })).rejects.toThrow(/your own listings/);
  });

  test("admin can remove any listing", async () => {
    const { t, admin, drill } = await setup();
    await admin.mutation(api.tools.remove, { toolId: drill });
    expect(await t.query(api.tools.listPublic, {})).toEqual([]);
  });
});

describe("loans", () => {
  test("only the lender can approve, and only once", async () => {
    const { lee, bo, eve, drill } = await setup();
    const loan = await bo.mutation(api.loans.request, { toolId: drill, startDate: day(1), endDate: day(3) });
    await expect(eve.mutation(api.loans.decide, { loanId: loan, approve: true })).rejects.toThrow(/owner of this tool/);
    await expect(bo.mutation(api.loans.decide, { loanId: loan, approve: true })).rejects.toThrow(/owner of this tool/);
    await lee.mutation(api.loans.decide, { loanId: loan, approve: true });
    await expect(lee.mutation(api.loans.decide, { loanId: loan, approve: false })).rejects.toThrow(/already been handled/);
  });

  test("you can't borrow your own tool or pick bad dates", async () => {
    const { lee, bo, drill } = await setup();
    await expect(lee.mutation(api.loans.request, { toolId: drill, startDate: day(1), endDate: day(2) })).rejects.toThrow(/your own tool/);
    await expect(bo.mutation(api.loans.request, { toolId: drill, startDate: day(3), endDate: day(1) })).rejects.toThrow(/on or after/);
    await expect(bo.mutation(api.loans.request, { toolId: drill, startDate: day(-2), endDate: day(1) })).rejects.toThrow(/past/);
  });

  test("approved loans block overlapping dates", async () => {
    const { lee, bo, eve, drill } = await setup();
    const first = await bo.mutation(api.loans.request, { toolId: drill, startDate: day(1), endDate: day(5) });
    await lee.mutation(api.loans.decide, { loanId: first, approve: true });
    await expect(eve.mutation(api.loans.request, { toolId: drill, startDate: day(4), endDate: day(6) })).rejects.toThrow(/clash/);
  });

  test("strangers can't mark a loan returned", async () => {
    const { lee, bo, eve, drill } = await setup();
    const loan = await bo.mutation(api.loans.request, { toolId: drill, startDate: day(1), endDate: day(2) });
    await lee.mutation(api.loans.decide, { loanId: loan, approve: true });
    await expect(eve.mutation(api.loans.markReturned, { loanId: loan })).rejects.toThrow(/lender or borrower/);
    await bo.mutation(api.loans.markReturned, { loanId: loan });
    const [row] = await lee.query(api.loans.incoming, {});
    expect(row.status).toBe("returned");
  });
});
