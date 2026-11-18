"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { LoanCard } from "@/components/loan-card";
import { Button, EmptyState, ErrorNote, Loading, PageHeader } from "@/components/ui";
import { useRowAction } from "@/components/use-action";

export default function MyRequestsPage() {
  const loans = useQuery(api.loans.myRequests);
  const cancel = useMutation(api.loans.cancel);
  const markReturned = useMutation(api.loans.markReturned);
  const { busy, error, run } = useRowAction<string>();

  return (
    <>
      <PageHeader title="My requests" subtitle="Things you asked to borrow." />
      {loans === undefined ? (
        <Loading label="Loading your requests" />
      ) : loans.length === 0 ? (
        <EmptyState title="No requests yet" hint="Find something on Browse and ask to borrow it." />
      ) : (
        <ul className="space-y-3">
          {loans.map((loan) => (
            <li key={loan._id}>
              <LoanCard
                loan={loan}
                counterpart={`from ${loan.lenderName}`}
                actions={
                  <>
                    {loan.status === "requested" && (
                      <Button
                        variant="secondary"
                        disabled={busy === loan._id}
                        onClick={() => run(loan._id, () => cancel({ loanId: loan._id }))}
                      >
                        Cancel request
                      </Button>
                    )}
                    {loan.status === "approved" && (
                      <Button
                        variant="secondary"
                        disabled={busy === loan._id}
                        onClick={() => run(loan._id, () => markReturned({ loanId: loan._id }))}
                      >
                        I&apos;ve returned it
                      </Button>
                    )}
                    {error?.key === loan._id && <ErrorNote message={error.message} />}
                  </>
                }
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
