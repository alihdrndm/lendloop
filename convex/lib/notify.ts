import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { LoanStatus } from "./domain";

/**
 * Called inside every loan state change, in the same transaction. Scheduling
 * here means a status can't change without the n8n notification being queued,
 * and if the mutation fails, nothing is sent.
 *
 * Each status happens at most once per loan, so `req:<loanId>:<status>` is a
 * stable event id that n8n uses as its idempotency key.
 */
export async function onLoanChanged(ctx: MutationCtx, loanId: Id<"loans">, status: LoanStatus): Promise<void> {
  await ctx.scheduler.runAfter(0, internal.automation.deliverNotification, {
    loanId,
    status,
    eventId: `req:${loanId}:${status}`,
    attempt: 0,
  });
}
