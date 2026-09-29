import { Badge } from "@/components/ui/badge";
import { formatDuration, msByLocalDate, totalMs } from "@/lib/hours";
import { countsTowardHours } from "@/lib/hours";
import { formatInTz } from "@/lib/time";

export type SessionRowData = {
  id: string;
  kind: string;
  eventTitle: string | null;
  clockInAt: Date;
  clockOutAt: Date | null;
  status: string;
  reviewState: string;
  origin: string;
  selfReported: boolean;
  note: string | null;
};

export function SessionBadges({ s }: { s: SessionRowData }) {
  return (
    <span className="flex flex-wrap gap-1">
      {s.status === "open" ? <Badge tone="info">In progress</Badge> : null}
      {s.reviewState === "pending_approval" ? <Badge tone="warning">Waiting for approval</Badge> : null}
      {s.reviewState === "needs_review" ? <Badge tone="warning">Auto clocked out, under review</Badge> : null}
      {s.reviewState === "rejected" ? <Badge tone="error">Not counted</Badge> : null}
      {s.status === "edited" ? <Badge>Edited</Badge> : null}
      {s.selfReported ? <Badge>Self-reported</Badge> : null}
      {s.origin === "offline_synced" ? <Badge>Saved offline</Badge> : null}
      {s.origin === "backfill" && !s.selfReported && s.reviewState !== "pending_approval" && s.reviewState !== "rejected" ? <Badge>Added later</Badge> : null}
    </span>
  );
}

export function SessionList({ sessions, tz }: { sessions: SessionRowData[]; tz: string }) {
  return (
    <ul className="divide-y rounded-[8px] border">
      {sessions.map((s) => {
        const ms = s.clockOutAt ? s.clockOutAt.getTime() - s.clockInAt.getTime() : 0;
        const counts = countsTowardHours({ clockInAt: s.clockInAt, clockOutAt: s.clockOutAt, status: s.status, reviewState: s.reviewState });
        return (
          <li key={s.id} className="flex flex-col gap-1.5 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{s.kind === "event" ? (s.eventTitle ?? "Event") : "Build season clock-in"}</p>
              <p className="font-mono text-[12px] text-muted">
                {formatInTz(s.clockInAt, tz, "EEE MMM d, h:mm a")}
                {s.clockOutAt ? ` – ${formatInTz(s.clockOutAt, tz, "h:mm a")}` : " – now"}
              </p>
              {s.note ? <p className="mt-0.5 text-[12px] text-muted">“{s.note}”</p> : null}
            </div>
            <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:gap-1">
              <span className={`font-mono text-sm ${counts ? "" : "text-muted line-through"}`}>{s.clockOutAt ? formatDuration(ms) : "…"}</span>
              <SessionBadges s={s} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function HoursSummary({ sessions, tz, seasonLabel }: { sessions: SessionRowData[]; tz: string; seasonLabel: string }) {
  const hs = sessions.map((s) => ({ clockInAt: s.clockInAt, clockOutAt: s.clockOutAt, status: s.status, reviewState: s.reviewState }));
  const total = totalMs(hs);
  const days = msByLocalDate(hs, tz).size;
  return (
    <dl className="grid grid-cols-2 gap-3">
      <div className="rounded-[8px] border p-4">
        <dt className="text-[13px] text-muted">Hours in {seasonLabel}</dt>
        <dd className="mt-1 font-mono text-[28px] font-medium">{(total / 3_600_000).toFixed(1)}</dd>
      </div>
      <div className="rounded-[8px] border p-4">
        <dt className="text-[13px] text-muted">Days with time</dt>
        <dd className="mt-1 font-mono text-[28px] font-medium">{days}</dd>
      </div>
    </dl>
  );
}
