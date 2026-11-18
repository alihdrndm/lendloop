# Running LendLoop in production

LendLoop is built to run the same way in production as it does locally, but a few things would change before real neighbours use it.

## Infrastructure

- **Convex cloud deployment** instead of the local backend, with separate dev, preview and prod deployments. Secrets set per deployment with `npx convex env set`.
- **Clerk production instance** with its own domain, bot protection on sign-up, and email verification on. Session token claims (`email`, `name`) configured the same way as in dev.
- **n8n in queue mode** (main + workers + Redis + Postgres) instead of the single SQLite container, so a slow run can't block webhooks and workers can scale. Pin the image and upgrade on purpose.
- **Next.js on Vercel** (or any Node host), with the Convex and Clerk keys as environment variables.

## Security

- **Secret rotation.** Accept two secrets per direction for a short overlap, so `N8N_INBOUND_SECRET` and `CONVEX_INBOUND_SECRET` can be rotated without downtime. Store them in a secret manager, not in `.env` files.
- **Lock n8n down.** Only the webhook path is public; the editor sits behind SSO or a VPN. Restrict the Convex HTTP endpoints to n8n's egress IPs as a second layer on top of the signatures.
- **Rate limits** on borrow requests and listing creation per member, and on the public tool list, to stop spam and scraping.
- **Audit log** of admin actions (removing listings, Trusted Lender changes), written in the same mutation as the change.
- **Content moderation** for listing names and descriptions, or at least a report button.

## Reliability

- **Outbox table** for notifications instead of scheduler retries alone: the mutation writes an outbox row, a worker delivers it, and an admin can replay failed rows. This also gives one place to see the delivery backlog.
- **Dead-letter handling.** Failed automation runs already land in `automationFailures`; in production they would page someone (Slack or PagerDuty) and offer a "retry" button.
- **Backups and retention.** Convex snapshot exports on a schedule; n8n execution data pruned after 14 days so personal data doesn't pile up in logs.

## Notifications

- A real email provider (Postmark, Resend or SES) with templates, unsubscribe links and per-member notification preferences, instead of the log and optional Discord channel used here.
- Time zones: reminders in each member's local morning instead of 09:00 UTC.

## Observability

- **Sentry** for the Next.js app and Convex functions (errors with the loan id, never personal data).
- **Datadog or Grafana** for n8n: run duration, failure rate per workflow, webhook latency, and an alert when the daily reminder job doesn't run.
- Structured logs that carry the idempotency key, so a single loan's notifications can be traced across Convex and n8n.

## Privacy

- A data-retention policy: delete or anonymize loans and automation events after a set period, and remove a member's data when they delete their account (a Clerk `user.deleted` webhook into Convex).
- A short privacy notice explaining what is shared with other members (first name, listings) and what isn't (email).
