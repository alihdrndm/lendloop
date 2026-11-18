"use client";

import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { Category } from "../../../convex/lib/domain";
import { BorrowForm } from "@/components/borrow-form";
import { Badge, Button, Card, EmptyState, Loading, PageHeader } from "@/components/ui";
import { CATEGORIES, CATEGORY_LABELS, CONDITION_LABELS } from "@/lib/labels";

export default function BrowsePage() {
  const [category, setCategory] = useState<Category | "">("");
  const tools = useQuery(api.tools.list, category ? { category } : {});
  const [borrowing, setBorrowing] = useState<Id<"tools"> | null>(null);
  const [sent, setSent] = useState<Id<"tools"> | null>(null);

  return (
    <>
      <PageHeader title="Browse tools" subtitle="Everything your neighbours are lending." />

      <div role="group" aria-label="Filter by category" className="mb-5 flex flex-wrap gap-2">
        {[{ value: "", label: "All" }, ...CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))].map(
          (option) => (
            <button
              key={option.value || "all"}
              type="button"
              aria-pressed={category === option.value}
              onClick={() => setCategory(option.value as Category | "")}
              className={`rounded-full border px-3 py-1 text-sm ${
                category === option.value ? "border-brand bg-brand text-brand-ink" : "border-line bg-card"
              }`}
            >
              {option.label}
            </button>
          ),
        )}
      </div>

      {tools === undefined ? (
        <Loading label="Loading tools" />
      ) : tools.length === 0 ? (
        <EmptyState
          title={category ? "Nothing in this category yet" : "No tools listed yet"}
          hint="List something from My listings to get the loop going."
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {tools.map((tool) => (
            <li key={tool._id}>
              <Card>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-medium">{tool.name}</h2>
                    <p className="mt-0.5 text-xs text-muted">
                      {CATEGORY_LABELS[tool.category]} · {CONDITION_LABELS[tool.condition]} · lent by{" "}
                      {tool.isMine ? "you" : tool.ownerName}
                      {tool.ownerTrusted && " · Trusted Lender"}
                    </p>
                  </div>
                  {tool.onLoan ? <Badge tone="amber">On loan</Badge> : <Badge tone="green">Available</Badge>}
                </div>
                {tool.description && <p className="mt-2 text-sm text-stone-600">{tool.description}</p>}

                {sent === tool._id && (
                  <p className="mt-3 text-sm text-emerald-700">Request sent. The owner will be notified.</p>
                )}
                {!tool.isMine && borrowing !== tool._id && sent !== tool._id && (
                  <Button variant="secondary" className="mt-3" onClick={() => setBorrowing(tool._id)}>
                    Request to borrow
                  </Button>
                )}
                {borrowing === tool._id && (
                  <BorrowForm
                    toolId={tool._id}
                    onCancel={() => setBorrowing(null)}
                    onSent={() => {
                      setBorrowing(null);
                      setSent(tool._id);
                    }}
                  />
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
