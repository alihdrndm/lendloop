"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { ToolForm, type ToolDraft } from "@/components/tool-form";
import { Badge, Button, Card, EmptyState, ErrorNote, Loading, PageHeader } from "@/components/ui";
import { friendlyError } from "@/lib/errors";
import { CATEGORY_LABELS, CONDITION_LABELS } from "@/lib/labels";

export default function ListingsPage() {
  const listings = useQuery(api.tools.myListings);
  const create = useMutation(api.tools.create);
  const update = useMutation(api.tools.update);
  const remove = useMutation(api.tools.remove);

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Id<"tools"> | null>(null);
  const [rowError, setRowError] = useState<{ id: Id<"tools">; message: string } | null>(null);
  const [confirming, setConfirming] = useState<Id<"tools"> | null>(null);

  const wrap = (fn: () => Promise<unknown>) => async () => {
    try {
      await fn();
    } catch (err) {
      throw new Error(friendlyError(err));
    }
  };

  return (
    <>
      <PageHeader
        title="My listings"
        subtitle="Tools you are happy to lend."
        action={!adding && <Button onClick={() => setAdding(true)}>List a tool</Button>}
      />

      {adding && (
        <Card className="mb-6">
          <h2 className="mb-3 font-medium">List a new tool</h2>
          <ToolForm
            submitLabel="Add listing"
            onCancel={() => setAdding(false)}
            onSubmit={async (draft: ToolDraft) => {
              await wrap(() => create(draft))();
              setAdding(false);
            }}
          />
        </Card>
      )}

      {listings === undefined ? (
        <Loading label="Loading your listings" />
      ) : listings.length === 0 ? (
        !adding && <EmptyState title="You haven't listed anything yet" hint="What's sitting in your shed?" />
      ) : (
        <ul className="space-y-3">
          {listings.map((tool) => (
            <li key={tool._id}>
              <Card>
                {editing === tool._id ? (
                  <ToolForm
                    initial={{
                      name: tool.name,
                      category: tool.category,
                      condition: tool.condition,
                      description: tool.description,
                    }}
                    submitLabel="Save changes"
                    onCancel={() => setEditing(null)}
                    onSubmit={async (draft) => {
                      await wrap(() => update({ toolId: tool._id, ...draft }))();
                      setEditing(null);
                    }}
                  />
                ) : (
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="font-medium">{tool.name}</h2>
                      <p className="mt-0.5 text-xs text-muted">
                        {CATEGORY_LABELS[tool.category]} · {CONDITION_LABELS[tool.condition]}
                      </p>
                      {tool.description && <p className="mt-2 text-sm text-stone-600">{tool.description}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      {tool.onLoan ? <Badge tone="amber">On loan</Badge> : <Badge tone="green">Available</Badge>}
                      <Button variant="secondary" onClick={() => setEditing(tool._id)}>
                        Edit
                      </Button>
                      {confirming === tool._id ? (
                        <>
                          <Button
                            variant="danger"
                            onClick={async () => {
                              setRowError(null);
                              try {
                                await remove({ toolId: tool._id });
                              } catch (err) {
                                setRowError({ id: tool._id, message: friendlyError(err) });
                              } finally {
                                setConfirming(null);
                              }
                            }}
                          >
                            Yes, delete
                          </Button>
                          <Button variant="ghost" onClick={() => setConfirming(null)}>
                            Keep
                          </Button>
                        </>
                      ) : (
                        <Button variant="danger" onClick={() => setConfirming(tool._id)}>
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>
                )}
                {rowError?.id === tool._id && (
                  <div className="mt-3">
                    <ErrorNote message={rowError.message} />
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
