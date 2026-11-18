"use client";

import { useState, type FormEvent } from "react";
import type { Category, Condition } from "../../convex/lib/domain";
import { CATEGORIES, CATEGORY_LABELS, CONDITIONS, CONDITION_LABELS } from "@/lib/labels";
import { Button, ErrorNote, inputClass } from "./ui";

export type ToolDraft = { name: string; category: Category; condition: Condition; description: string };

const EMPTY: ToolDraft = { name: "", category: "power_tools", condition: "good", description: "" };

export function ToolForm({
  initial = EMPTY,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: ToolDraft;
  submitLabel: string;
  onSubmit: (draft: ToolDraft) => Promise<void>;
  onCancel?: () => void;
}) {
  const [draft, setDraft] = useState<ToolDraft>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit(draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block text-sm font-medium">
        Name
        <input
          required
          maxLength={80}
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="e.g. Cordless drill"
          className={`${inputClass} mt-1`}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm font-medium">
          Category
          <select
            value={draft.category}
            onChange={(e) => setDraft({ ...draft, category: e.target.value as Category })}
            className={`${inputClass} mt-1`}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium">
          Condition
          <select
            value={draft.condition}
            onChange={(e) => setDraft({ ...draft, condition: e.target.value as Condition })}
            className={`${inputClass} mt-1`}
          >
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {CONDITION_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-sm font-medium">
        Short description
        <textarea
          maxLength={500}
          rows={3}
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          placeholder="Anything a borrower should know"
          className={`${inputClass} mt-1`}
        />
      </label>
      <ErrorNote message={error} />
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
