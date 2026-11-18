import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  vAutomationKind,
  vAutomationStatus,
  vCategory,
  vCondition,
  vLoanStatus,
  vRole,
} from "./lib/domain";

export default defineSchema({
  // One row per Clerk identity. Role is decided on the server (ADMIN_EMAILS),
  // never by the client.
  users: defineTable({
    tokenIdentifier: v.string(),
    name: v.string(),
    email: v.string(),
    role: vRole,
    trustedLender: v.boolean(),
  }).index("by_token", ["tokenIdentifier"]),

  tools: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    category: vCategory,
    condition: vCondition,
    description: v.string(),
    // Soft delete so past loans keep their history.
    removedAt: v.optional(v.number()),
  })
    .index("by_owner", ["ownerId"])
    .index("by_category", ["category"]),

  loans: defineTable({
    toolId: v.id("tools"),
    lenderId: v.id("users"),
    borrowerId: v.id("users"),
    startDate: v.string(),
    endDate: v.string(),
    status: vLoanStatus,
    decidedAt: v.optional(v.number()),
    returnedAt: v.optional(v.number()),
  })
    .index("by_borrower", ["borrowerId"])
    .index("by_lender", ["lenderId"])
    .index("by_tool_status", ["toolId", "status"])
    .index("by_status_endDate", ["status", "endDate"]),

  // Everything the automations did for a loan: the mock notification record,
  // the reminder log and failures. idempotencyKey makes write-backs safe to retry.
  automationEvents: defineTable({
    loanId: v.id("loans"),
    kind: vAutomationKind,
    status: vAutomationStatus,
    idempotencyKey: v.string(),
    channel: v.optional(v.string()),
    detail: v.optional(v.string()),
  })
    .index("by_idempotency_key", ["idempotencyKey"])
    .index("by_loan", ["loanId"]),
});
