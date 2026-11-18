"use client";

import { useState } from "react";
import { friendlyError } from "@/lib/errors";

/** Runs one mutation at a time per key and keeps the last error per key. */
export function useRowAction<K extends string>() {
  const [busy, setBusy] = useState<K | null>(null);
  const [error, setError] = useState<{ key: K; message: string } | null>(null);

  async function run(key: K, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError({ key, message: friendlyError(err) });
    } finally {
      setBusy(null);
    }
  }

  return { busy, error, run };
}
