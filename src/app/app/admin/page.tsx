"use client";

import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { LoanCard } from "@/components/loan-card";
import { Badge, Button, Card, EmptyState, ErrorNote, Loading, PageHeader } from "@/components/ui";
import { useRowAction } from "@/components/use-action";
import { CATEGORY_LABELS, timeAgo } from "@/lib/labels";

export default function AdminPage() {
  const me = useQuery(api.users.me);
  const isAdmin = me?.role === "admin";
  // The server rejects these for non-admins anyway; skipping avoids a noisy error.
  const loans = useQuery(api.loans.allForAdmin, isAdmin ? {} : "skip");
  const tools = useQuery(api.tools.listForAdmin, isAdmin ? {} : "skip");
  const users = useQuery(api.users.listForAdmin, isAdmin ? {} : "skip");
  const failures = useQuery(api.automation.recentFailures, isAdmin ? {} : "skip");
  const removeTool = useMutation(api.tools.remove);
  const setTrusted = useMutation(api.users.setTrustedLender);
  const { busy, error, run } = useRowAction<string>();

  if (me === undefined) return <Loading />;
  if (!isAdmin) return <EmptyState title="Admins only" hint="This page is for LendLoop admins." />;

  return (
    <>
      <PageHeader title="Admin" subtitle="Keep the board healthy." />
      {failures && failures.length > 0 && (
        <section aria-labelledby="automation-problems" className="mb-8">
          <h2 id="automation-problems" className="mb-3 text-sm font-semibold uppercase tracking-wide text-red-700">
            Automation problems
          </h2>
          <Card className="divide-y divide-line p-0">
            {failures.map((f) => (
              <div key={f._id} className="px-4 py-3 text-sm">
                <p className="font-medium">
                  {f.workflow} <span className="font-normal text-muted">· {f.source} · {timeAgo(f.at)}</span>
                </p>
                <p className="mt-0.5 text-muted">{f.message}</p>
              </div>
            ))}
          </Card>
        </section>
      )}
      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Members</h2>
          {users === undefined ? (
            <Loading />
          ) : (
            <Card className="divide-y divide-line p-0">
              {users.map((u) => (
                <div key={u._id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {u.name} {u.role === "admin" && <Badge>Admin</Badge>}
                    </p>
                    <p className="truncate text-xs text-muted">{u.email}</p>
                  </div>
                  <Button
                    variant={u.trustedLender ? "secondary" : "primary"}
                    disabled={busy === u._id}
                    onClick={() => run(u._id, () => setTrusted({ userId: u._id, trusted: !u.trustedLender }))}
                  >
                    {u.trustedLender ? "Remove Trusted Lender" : "Mark Trusted Lender"}
                  </Button>
                </div>
              ))}
            </Card>
          )}

          <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-muted">Listings</h2>
          {tools === undefined ? (
            <Loading />
          ) : tools.length === 0 ? (
            <EmptyState title="No listings" />
          ) : (
            <Card className="divide-y divide-line p-0">
              {tools.map((t) => (
                <div key={t._id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{t.name}</p>
                      <p className="text-xs text-muted">
                        {CATEGORY_LABELS[t.category]} · {t.ownerName}
                      </p>
                    </div>
                    <Button
                      variant="danger"
                      disabled={busy === t._id}
                      onClick={() => run(t._id, () => removeTool({ toolId: t._id }))}
                    >
                      Remove
                    </Button>
                  </div>
                  {error?.key === t._id && (
                    <div className="mt-2">
                      <ErrorNote message={error.message} />
                    </div>
                  )}
                </div>
              ))}
            </Card>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">All loans</h2>
          {loans === undefined ? (
            <Loading />
          ) : loans.length === 0 ? (
            <EmptyState title="No loans yet" />
          ) : (
            <ul className="space-y-3">
              {loans.map((loan) => (
                <li key={loan._id}>
                  <LoanCard loan={loan} counterpart={`${loan.lenderName} to ${loan.borrowerName}`} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
