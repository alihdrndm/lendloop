import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getViewer, isAdminEmail, NotSignedIn, requireAdmin } from "./lib/auth";

/** Called by the client right after sign-in. Creates or refreshes the user row. */
export const store = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new NotSignedIn();

    const name = identity.name ?? identity.nickname ?? "Neighbour";
    const email = identity.email ?? "";
    const role = isAdminEmail(email) ? "admin" : "user";

    const existing = await getViewer(ctx);
    if (existing) {
      if (existing.name !== name || existing.email !== email || existing.role !== role) {
        await ctx.db.patch(existing._id, { name, email, role });
      }
      return existing._id;
    }
    return await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      name,
      email,
      role,
      trustedLender: false,
    });
  },
});

/** The signed-in user, or null. Only returns what the UI needs. */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer) return null;
    return {
      _id: viewer._id,
      name: viewer.name,
      role: viewer.role,
      trustedLender: viewer.trustedLender,
    };
  },
});

/** Admin: list members so a lender can be marked as trusted. */
export const listForAdmin = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").collect();
    return users.map((u) => ({
      _id: u._id,
      name: u.name,
      email: u.email,
      role: u.role,
      trustedLender: u.trustedLender,
    }));
  },
});

export const setTrustedLender = mutation({
  args: { userId: v.id("users"), trusted: v.boolean() },
  handler: async (ctx, { userId, trusted }) => {
    await requireAdmin(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");
    await ctx.db.patch(userId, { trustedLender: trusted });
  },
});
