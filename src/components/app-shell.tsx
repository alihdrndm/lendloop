"use client";

import { UserButton } from "@clerk/nextjs";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import { Loading } from "./ui";

const LINKS = [
  { href: "/app", label: "Browse" },
  { href: "/app/listings", label: "My listings" },
  { href: "/app/requests", label: "My requests" },
  { href: "/app/incoming", label: "Incoming requests" },
];

/** Makes sure the signed-in Clerk user has a Convex user row before any page loads. */
function useEnsureUser() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const store = useMutation(api.users.store);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    store({})
      .then(() => !cancelled && setReady(true))
      .catch(() => !cancelled && setReady(false));
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, store]);
  return { ready: isAuthenticated && ready, isLoading };
}

export function AppShell({ children }: { children: ReactNode }) {
  const { ready } = useEnsureUser();
  const me = useQuery(api.users.me, ready ? {} : "skip");
  const pathname = usePathname();
  const links = me?.role === "admin" ? [...LINKS, { href: "/app/admin", label: "Admin" }] : LINKS;

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-4 px-4 py-3">
          <Link href="/" className="font-semibold text-brand">
            LendLoop
          </Link>
          <nav aria-label="Main" className="flex flex-1 gap-1 overflow-x-auto">
            {links.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${
                    active ? "bg-stone-100 font-medium" : "text-muted hover:text-foreground"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
          {me?.trustedLender && (
            <span className="hidden text-xs text-emerald-700 sm:inline">Trusted Lender</span>
          )}
          <UserButton />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {ready ? children : <Loading label="Signing you in" />}
      </main>
    </div>
  );
}
