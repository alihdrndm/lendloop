import { v } from "convex/values";
import { internalQuery } from "./_generated/server";

/** Validates an untrusted id string from an HTTP body; returns null if it isn't a loan id. */
export const normalizeLoanId = internalQuery({
  args: { id: v.string() },
  handler: async (ctx, { id }) => ctx.db.normalizeId("loans", id),
});
