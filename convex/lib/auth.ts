import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

// Every authorization decision in LendLoop happens here, on the server.
// The UI hides buttons for convenience only; these checks are the real gate.

type Ctx = QueryCtx | MutationCtx;

export class Forbidden extends ConvexError<{ code: "FORBIDDEN"; message: string }> {
  constructor(message = "You are not allowed to do that.") {
    super({ code: "FORBIDDEN", message });
  }
}

export class NotSignedIn extends ConvexError<{ code: "UNAUTHENTICATED"; message: string }> {
  constructor() {
    super({ code: "UNAUTHENTICATED", message: "Please sign in first." });
  }
}

export async function getViewer(ctx: Ctx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
}

export async function requireUser(ctx: Ctx): Promise<Doc<"users">> {
  const viewer = await getViewer(ctx);
  if (!viewer) throw new NotSignedIn();
  return viewer;
}

export async function requireAdmin(ctx: Ctx): Promise<Doc<"users">> {
  const viewer = await requireUser(ctx);
  if (viewer.role !== "admin") throw new Forbidden("Only admins can do that.");
  return viewer;
}

export async function getActiveTool(ctx: Ctx, toolId: Id<"tools">): Promise<Doc<"tools">> {
  const tool = await ctx.db.get(toolId);
  if (!tool || tool.removedAt !== undefined) {
    throw new ConvexError({ code: "NOT_FOUND", message: "That tool no longer exists." });
  }
  return tool;
}

export function assertOwnsTool(viewer: Doc<"users">, tool: Doc<"tools">): void {
  if (tool.ownerId !== viewer._id) throw new Forbidden("You can only change your own listings.");
}

export function isPartyToLoan(viewer: Doc<"users">, loan: Doc<"loans">): boolean {
  return loan.borrowerId === viewer._id || loan.lenderId === viewer._id;
}

// Admins are configured by email in the Convex environment, never through the app.
export function isAdminEmail(email: string): boolean {
  const list = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.trim().toLowerCase());
}
