import type { FunctionReturnType } from "convex/server";
import type { ReactNode } from "react";
import type { api } from "../../convex/_generated/api";
import { formatDay, STATUS_LABELS, timeAgo } from "@/lib/labels";
import { Badge, Card } from "./ui";

export type LoanView = FunctionReturnType<typeof api.loans.myRequests>[number];

const STATUS_TONE = {
  requested: "blue",
  approved: "green",
  declined: "neutral",
  cancelled: "neutral",
  returned: "neutral",
} as const;

function activityLabel(item: LoanView["activity"][number]): string {
  const when = timeAgo(item.at);
  if (item.kind === "overdue_reminder") return item.status === "sent" ? `Reminder sent ${when}` : `Reminder failed ${when}`;
  if (item.kind === "failure") return `Automation failed ${when}, the team was alerted`;
  return item.status === "sent" ? `Notification sent ${when}` : `Notification failed ${when}`;
}

export function LoanCard({
  loan,
  counterpart,
  actions,
}: {
  loan: LoanView;
  counterpart: string;
  actions?: ReactNode;
}) {
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-medium">
            {loan.toolName}
            {loan.toolRemoved && <span className="ml-2 text-xs font-normal text-muted">(listing removed)</span>}
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            {formatDay(loan.startDate)} to {formatDay(loan.endDate)} · {counterpart}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {loan.overdue && <Badge tone="red">Overdue</Badge>}
          <Badge tone={STATUS_TONE[loan.status]}>{STATUS_LABELS[loan.status]}</Badge>
        </div>
      </div>

      {loan.activity.length > 0 && (
        <ul aria-label="Automation activity" className="mt-3 space-y-1 border-t border-line pt-3 text-xs text-muted">
          {loan.activity.map((item, i) => (
            <li key={i}>{activityLabel(item)}</li>
          ))}
        </ul>
      )}

      {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
    </Card>
  );
}
