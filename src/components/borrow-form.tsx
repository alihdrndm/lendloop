"use client";

import { useMutation } from "convex/react";
import { useState, type FormEvent } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { friendlyError } from "@/lib/errors";
import { Button, ErrorNote, inputClass } from "./ui";

const today = () => new Date().toISOString().slice(0, 10);

export function BorrowForm({
  toolId,
  onSent,
  onCancel,
}: {
  toolId: Id<"tools">;
  onSent: () => void;
  onCancel: () => void;
}) {
  const request = useMutation(api.loans.request);
  const [startDate, setStart] = useState(today());
  const [endDate, setEnd] = useState(today());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await request({ toolId, startDate, endDate });
      onSent();
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-3 border-t border-line pt-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-muted">
          From
          <input
            type="date"
            required
            min={today()}
            value={startDate}
            onChange={(e) => setStart(e.target.value)}
            className={`${inputClass} mt-1`}
          />
        </label>
        <label className="text-xs text-muted">
          Until
          <input
            type="date"
            required
            min={startDate}
            value={endDate}
            onChange={(e) => setEnd(e.target.value)}
            className={`${inputClass} mt-1`}
          />
        </label>
      </div>
      <ErrorNote message={error} />
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Sending…" : "Send request"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
