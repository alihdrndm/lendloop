import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { LoanStatus } from "./domain";

/**
 * Hook called inside every loan state change. The n8n integration plugs in
 * here (see convex/automation.ts); keeping it in one function means no
 * mutation can change a loan without the notification being scheduled.
 */
export async function onLoanChanged(
  _ctx: MutationCtx,
  _loanId: Id<"loans">,
  _status: LoanStatus,
): Promise<void> {
  // Wired to the n8n request-notification workflow in the automation step.
}
