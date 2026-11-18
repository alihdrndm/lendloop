# ADR 0002: HMAC-signed, idempotent traffic between Convex and n8n

## Status

Accepted

## Context

Convex calls an n8n webhook when a loan changes, and n8n calls Convex to fetch overdue loans and to record what it did. Both endpoints are reachable over the network, n8n retries failed HTTP calls, and Convex retries failed deliveries. Without care, anyone who finds a URL could fake events, and a retry could send two reminders.

## Decision

- **Signatures.** Every request carries `x-lendloop-timestamp` (unix seconds) and `x-lendloop-signature = hex(HMAC_SHA256(secret, timestamp + "." + body))`. The receiver rejects missing, stale (more than 5 minutes) or mismatched signatures, with a constant-time compare.
- **One secret per direction.** `N8N_INBOUND_SECRET` (Convex to n8n) and `CONVEX_INBOUND_SECRET` (n8n to Convex). A leak of one doesn't let an attacker forge the other direction.
- **Exact bytes.** Convex sends `{"payload": "<json string>"}` and signs the inner string, so n8n verifies exactly what was signed even after its webhook parses the JSON. For GET requests the signed string is `GET <path>`, so a signature can't be reused on another endpoint.
- **Idempotency keys.** Each write-back carries a key that is the same on every retry (`req:<loanId>:<status>`, `overdue:<loanId>:<day>`, `n8n:<executionId>`). Convex stores one row per key and treats repeats as no-ops.
- **Data minimization.** Payloads carry first names, the tool name, dates and, only where a message must be delivered, an email. No descriptions, no internal ids of people.
- **Visible failures.** Convex retries delivery 4 times with backoff and then records an automation failure; n8n HTTP nodes retry 3 times and an error workflow reports any failed run to Convex. Admins see both.

## Consequences

- Retrying is always safe, so retries are switched on everywhere.
- Secrets live only in the Convex environment and the n8n container environment; the exported workflow JSON can be committed.
- Clock skew over 5 minutes between the two systems would cause rejections; both run on NTP-synced hosts.
