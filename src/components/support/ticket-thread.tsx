import { Badge, type Tone } from "@components/ui/primitives";
import { formatDateTime } from "@components/ui/format";
import type { TicketMessageView } from "@server/services/support.service";
import type { TicketStatus } from "@shared/support-rules";

export const STATUS_LABEL: Record<TicketStatus, { label: string; tone: Tone }> = {
  OPEN: { label: "Open", tone: "warning" },
  IN_PROGRESS: { label: "In progress", tone: "brand" },
  RESOLVED: { label: "Resolved", tone: "success" },
  CLOSED: { label: "Closed", tone: "neutral" },
};

export function StatusBadge({ status }: { status: TicketStatus }) {
  const s = STATUS_LABEL[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

/** Conversation view. Message text is rendered as plain text (React escapes it). */
export function TicketThread({ messages }: { messages: TicketMessageView[] }) {
  return (
    <ol className="space-y-3">
      {messages.map((m) => (
        <li
          key={m.id}
          className={`rounded-card border px-4 py-3 text-sm ${m.authorKind === "SUPPORT" ? "border-brand-600/25 bg-brand-50" : "border-line bg-surface"}`}
        >
          <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-medium text-ink-900">{m.authorName}</span>
            <time className="text-xs text-ink-500" dateTime={m.createdAt.toISOString()}>{formatDateTime(m.createdAt)}</time>
          </div>
          <p className="whitespace-pre-wrap break-words text-ink-800">{m.body}</p>
        </li>
      ))}
    </ol>
  );
}
