import { internalMutation } from "./_generated/server";

// Demo data for reviewers. Internal functions can only be run from the Convex
// CLI or dashboard (`npx convex run dev:seedDemo`), never from the browser.

const daysFromNow = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/**
 * Needs two signed-up users. Creates a few tools for the first one and an
 * approved loan to the second one that ended two days ago, so the overdue
 * reminder workflow has something to do.
 */
export const seedDemo = internalMutation({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").take(2);
    if (users.length < 2) {
      throw new Error("Sign up two users in the app first, then run the seed again.");
    }
    const [lender, borrower] = users;

    const ladder = await ctx.db.insert("tools", {
      ownerId: lender._id,
      name: "Extension ladder",
      category: "hand_tools",
      condition: "good",
      description: "3.5 m, aluminium. Fits in a hatchback with the seats down.",
    });
    await ctx.db.insert("tools", {
      ownerId: lender._id,
      name: "Hedge trimmer",
      category: "garden",
      condition: "fair",
      description: "Electric, 20 m extension cable included.",
    });
    await ctx.db.insert("tools", {
      ownerId: borrower._id,
      name: "Two-person tent",
      category: "camping",
      condition: "new",
      description: "Pitched twice. Comes with footprint and pegs.",
    });

    const overdueLoan = await ctx.db.insert("loans", {
      toolId: ladder,
      lenderId: lender._id,
      borrowerId: borrower._id,
      startDate: daysFromNow(-6),
      endDate: daysFromNow(-2),
      status: "approved",
      decidedAt: Date.now() - 6 * 86_400_000,
    });
    return { overdueLoan, lender: lender.name, borrower: borrower.name };
  },
});
