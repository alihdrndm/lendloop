# ADR 0001: Convex functions are the authorization boundary

## Status

Accepted

## Context

LendLoop has two roles (admin, user) and ownership rules: you can only edit your own listings and only act on loans you are part of. The brief asks for these rules to be enforced in Convex functions, not only in the UI.

The Next.js app, the Convex client and the n8n workflows can all reach the backend, and the browser can call any public Convex function directly. A rule that only lives in a React component is not a rule.

## Decision

- Every public query and mutation starts with `requireUser` or `requireAdmin` from `convex/lib/auth.ts`, then checks ownership against the loaded document (`assertOwnsTool`, lender or borrower on the loan).
- Roles are derived on the server from the `ADMIN_EMAILS` environment variable each time a member signs in (`users.store`). The client never sends a role.
- Loan status changes go through one state machine in `convex/loans.ts`; anything not explicitly allowed is rejected.
- The Next.js `proxy.ts` only redirects signed-out visitors away from `/app`. It is a convenience, not a gate.
- n8n never calls public functions. It talks to dedicated HTTP actions (`convex/http.ts`) that require a signed request and call internal functions.

## Consequences

- The UI can hide buttons freely; a forged request still gets `FORBIDDEN`.
- The rules are unit-testable without a browser (`convex/rbac.test.ts`).
- Adding a role means changing one helper and the tests, not every page.
