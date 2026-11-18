"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { LoanCard } from "@/components/loan-card";
import { Button, EmptyState, ErrorNote, Loading, PageHeader } from "@/components/ui";
import { useRowAction } from "@/components/use-action";

export default function IncomingPage() {
  const loans = useQuery(api.loans.incoming);
  const decide = useMutation(api.loans.decide);
  const markReturned = useMutation(api.loans.markReturned);
  const { busy, error, run } = useRowAction<string>();

  const pending = loans?.filter((l) => l.status === "requested") ?? [];
  const rest = loans?.filter((l) => l.status !== "requested") ?? [];

  return (
    <>
      <PageHeader title="Incoming requests" subtitle="Neighbours asking to borrow your tools." />
      {loans === undefined ? (
        <Loading label="Loading incoming requests" />
      ) : loans.length === 0 ? (
        <EmptyState title="No requests yet" hint="When someone asks to borrow one of your tools, it shows up here." />
      ) : (
        <div className="space-y-8">
          {[
            { title: "Waiting for you", items: pending },
            { title: "History", items: rest },
          ]
            .filter((group) => group.items.length > 0)
            .map((group) => (
              <section key={group.title}>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{group.title}</h2>
                <ul className="space-y-3">
                  {group.items.map((loan) => (
                    <li key={loan._id}>
                      <LoanCard
                        loan={loan}
                        counterpart={`for ${loan.borrowerName}`}
                        actions={
                          <>
                            {loan.status === "requested" && (
                              <>
                                <Button
                                  disabled={busy === loan._id}
                                  onClick={() => run(loan._id, () => decide({ loanId: loan._id, approve: true }))}
                                >
                                  Approve
                                </Button>
                                <Button
                                  variant="secondary"
                                  disabled={busy === loan._id}
                                  onClick={() => run(loan._id, () => decide({ loanId: loan._id, approve: false }))}
                                >
                                  Decline
                                </Button>
                              </>
                            )}
                            {loan.status === "approved" && (
                              <Button
                                variant="secondary"
                                disabled={busy === loan._id}
                                onClick={() => run(loan._id, () => markReturned({ loanId: loan._id }))}
                              >
                                Mark returned
                              </Button>
                            )}
                            {error?.key === loan._id && <ErrorNote message={error.message} />}
                          </>
                        }
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
        </div>
      )}
    </>
  );
}
