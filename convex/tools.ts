import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import {
  assertOwnsTool,
  getActiveTool,
  requireAdmin,
  requireUser,
} from "./lib/auth";
import { vCategory, vCondition } from "./lib/domain";

const LIMITS = { name: 80, description: 500 } as const;

function cleanText(value: string, field: keyof typeof LIMITS, required: boolean): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (required && trimmed.length === 0) {
    throw new ConvexError({ code: "INVALID", message: `Please add a ${field}.` });
  }
  if (trimmed.length > LIMITS[field]) {
    throw new ConvexError({
      code: "INVALID",
      message: `The ${field} can be at most ${LIMITS[field]} characters.`,
    });
  }
  return trimmed;
}

/** A tool is on loan while it has an approved, not yet returned loan. */
async function isOnLoan(ctx: QueryCtx, tool: Doc<"tools">): Promise<boolean> {
  const active = await ctx.db
    .query("loans")
    .withIndex("by_tool_status", (q) => q.eq("toolId", tool._id).eq("status", "approved"))
    .first();
  return active !== null;
}

async function activeTools(ctx: QueryCtx, category?: Doc<"tools">["category"]) {
  const tools = category
    ? await ctx.db
        .query("tools")
        .withIndex("by_category", (q) => q.eq("category", category))
        .collect()
    : await ctx.db.query("tools").collect();
  return tools.filter((t) => t.removedAt === undefined);
}

/**
 * Public, no sign-in. Data minimization: only the name and category of tools
 * that are free to borrow. No owner, no description, no ids that point at people.
 */
export const listPublic = query({
  args: {},
  handler: async (ctx) => {
    const tools = await activeTools(ctx);
    const result: { name: string; category: Doc<"tools">["category"] }[] = [];
    for (const tool of tools) {
      if (!(await isOnLoan(ctx, tool))) result.push({ name: tool.name, category: tool.category });
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  },
});

/** Signed-in: every tool with its availability, optionally filtered by category. */
export const list = query({
  args: { category: v.optional(vCategory) },
  handler: async (ctx, { category }) => {
    const viewer = await requireUser(ctx);
    const tools = await activeTools(ctx, category);
    const rows = [];
    for (const tool of tools) {
      const owner = await ctx.db.get(tool.ownerId);
      rows.push({
        _id: tool._id,
        name: tool.name,
        category: tool.category,
        condition: tool.condition,
        description: tool.description,
        ownerName: owner?.name ?? "A neighbour",
        ownerTrusted: owner?.trustedLender ?? false,
        isMine: tool.ownerId === viewer._id,
        onLoan: await isOnLoan(ctx, tool),
      });
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const myListings = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireUser(ctx);
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_owner", (q) => q.eq("ownerId", viewer._id))
      .collect();
    const rows = [];
    for (const tool of tools.filter((t) => t.removedAt === undefined)) {
      rows.push({ ...tool, onLoan: await isOnLoan(ctx, tool) });
    }
    return rows.sort((a, b) => b._creationTime - a._creationTime);
  },
});

const toolFields = {
  name: v.string(),
  category: vCategory,
  condition: vCondition,
  description: v.string(),
};

export const create = mutation({
  args: toolFields,
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx);
    return await ctx.db.insert("tools", {
      ownerId: viewer._id,
      name: cleanText(args.name, "name", true),
      category: args.category,
      condition: args.condition,
      description: cleanText(args.description, "description", false),
    });
  },
});

export const update = mutation({
  args: { toolId: v.id("tools"), ...toolFields },
  handler: async (ctx, { toolId, ...args }) => {
    const viewer = await requireUser(ctx);
    const tool = await getActiveTool(ctx, toolId);
    assertOwnsTool(viewer, tool);
    await ctx.db.patch(toolId, {
      name: cleanText(args.name, "name", true),
      category: args.category,
      condition: args.condition,
      description: cleanText(args.description, "description", false),
    });
  },
});

/** Owners delete their own listings; admins can remove any listing. */
export const remove = mutation({
  args: { toolId: v.id("tools") },
  handler: async (ctx, { toolId }) => {
    const viewer = await requireUser(ctx);
    const tool = await getActiveTool(ctx, toolId);
    if (viewer.role !== "admin") assertOwnsTool(viewer, tool);

    const open = await ctx.db
      .query("loans")
      .withIndex("by_tool_status", (q) => q.eq("toolId", toolId).eq("status", "approved"))
      .first();
    if (open) {
      throw new ConvexError({
        code: "CONFLICT",
        message: "This tool is on loan. Mark it returned before removing it.",
      });
    }

    // Close pending requests so borrowers are not left waiting on a removed tool.
    const pending = await ctx.db
      .query("loans")
      .withIndex("by_tool_status", (q) => q.eq("toolId", toolId).eq("status", "requested"))
      .collect();
    for (const loan of pending) {
      await ctx.db.patch(loan._id, { status: "declined", decidedAt: Date.now() });
    }
    await ctx.db.patch(toolId, { removedAt: Date.now() });
  },
});

/** Admin view of every active listing. */
export const listForAdmin = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const tools = await activeTools(ctx);
    const rows = [];
    for (const tool of tools) {
      const owner = await ctx.db.get(tool.ownerId);
      rows.push({ _id: tool._id, name: tool.name, category: tool.category, ownerName: owner?.name ?? "" });
    }
    return rows;
  },
});
