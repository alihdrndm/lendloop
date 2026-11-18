"use client";

import { Show, SignInButton } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "../../convex/_generated/api";
import { Badge, Button, EmptyState, Loading } from "@/components/ui";
import { CATEGORY_LABELS } from "@/lib/labels";

export default function Home() {
  const tools = useQuery(api.tools.listPublic);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-12 sm:py-16">
      <header className="mb-12">
        <p className="text-sm font-semibold tracking-wide text-brand">LendLoop</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">
          Borrow what you need.
          <br />
          Lend what you don&apos;t.
        </h1>
        <p className="mt-4 max-w-xl text-muted">
          A tool-lending board for your street. List the drill you use twice a year, borrow a ladder for the
          weekend, and get a friendly reminder when it&apos;s time to bring it back.
        </p>
        <div className="mt-6">
          <Show when="signed-out">
            <SignInButton mode="modal" forceRedirectUrl="/app">
              <Button>Sign in to lend or borrow</Button>
            </SignInButton>
          </Show>
          <Show when="signed-in">
            <Link href="/app">
              <Button>Open your board</Button>
            </Link>
          </Show>
        </div>
      </header>

      <section aria-labelledby="available">
        <h2 id="available" className="mb-4 text-lg font-semibold">
          Available right now
        </h2>
        {tools === undefined ? (
          <Loading label="Loading tools" />
        ) : tools.length === 0 ? (
          <EmptyState title="Nothing listed yet" hint="Be the first to lend something to your neighbours." />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {tools.map((tool, i) => (
              <li
                key={`${tool.name}-${i}`}
                className="flex items-center justify-between rounded-xl border border-line bg-card px-4 py-3"
              >
                <span className="font-medium">{tool.name}</span>
                <Badge>{CATEGORY_LABELS[tool.category]}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
