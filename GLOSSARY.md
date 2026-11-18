# Glossary

The words LendLoop uses, in code, UI and docs.

| Term | Meaning |
|---|---|
| **Member** | A signed-in person. Every member is a `user` or an `admin`. |
| **Admin** | A member whose email is listed in the Convex `ADMIN_EMAILS` variable. Can remove any listing, see every loan and mark Trusted Lenders. There is no way to become an admin from the app. |
| **Tool** | Something a member is willing to lend: name, category, condition and a short description. |
| **Listing** | A tool as it appears on the board. Deleting a listing soft-deletes the tool so past loans keep their history. |
| **Lender** | The owner of the tool in a loan. |
| **Borrower** | The member who asked to borrow the tool. |
| **Loan** | One borrowing of one tool for a date range. Also called a request while it waits for the lender. |
| **Loan status** | `requested` → `approved` or `declined` (lender), or `cancelled` (borrower); `approved` → `returned` (either party). Nothing else is allowed. |
| **On loan** | A tool with an approved loan that hasn't been returned. |
| **Overdue** | An approved loan whose end date has passed. |
| **Trusted Lender** | A badge an admin gives a member who lends reliably. Shown next to their tools. |
| **Automation event** | A record that n8n did something for a loan: a request notification or an overdue reminder, with its channel (`log` or `discord`). Shown on the loan as its activity. |
| **Automation failure** | A run that failed for good, from Convex's delivery retries or n8n's error workflow. Shown to admins. |
| **Idempotency key** | The id that makes a write-back safe to retry: `req:<loanId>:<status>` for notifications, `overdue:<loanId>:<day>` for reminders, `n8n:<executionId>` for failures. |
| **Signed request** | A call between Convex and n8n carrying `x-lendloop-timestamp` and `x-lendloop-signature`, an HMAC-SHA256 of `timestamp.body` with the secret for that direction. |
