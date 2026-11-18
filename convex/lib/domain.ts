import { v, type Infer } from "convex/values";

// Shared domain vocabulary (see GLOSSARY.md). One place so the schema, the
// functions and the UI agree on the same values.

export const vCategory = v.union(
  v.literal("power_tools"),
  v.literal("hand_tools"),
  v.literal("garden"),
  v.literal("kitchen"),
  v.literal("camping"),
  v.literal("cleaning"),
  v.literal("other"),
);

export const vCondition = v.union(
  v.literal("new"),
  v.literal("good"),
  v.literal("fair"),
  v.literal("worn"),
);

export const vLoanStatus = v.union(
  v.literal("requested"),
  v.literal("approved"),
  v.literal("declined"),
  v.literal("cancelled"),
  v.literal("returned"),
);

export const vRole = v.union(v.literal("admin"), v.literal("user"));

export const vAutomationKind = v.union(
  v.literal("request_notification"),
  v.literal("overdue_reminder"),
  v.literal("failure"),
);

export const vAutomationStatus = v.union(v.literal("sent"), v.literal("failed"));

export type Category = Infer<typeof vCategory>;
export type Condition = Infer<typeof vCondition>;
export type LoanStatus = Infer<typeof vLoanStatus>;
export type Role = Infer<typeof vRole>;

// Dates are plain calendar days ("YYYY-MM-DD"). A loan is overdue once today
// is past its endDate while it is still approved.
export const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function todayUtc(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function isValidDay(day: string): boolean {
  if (!ISO_DAY.test(day)) return false;
  const parsed = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day;
}
