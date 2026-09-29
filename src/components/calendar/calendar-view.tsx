import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CalendarDays } from "lucide-react";
import type { EventRow, RsvpResponse } from "@/lib/events";
import { RSVP_LABEL } from "@/lib/events";
import { calendarRange, VIEWS } from "@/lib/calendar-view";
import { addDaysLocal, formatInTz, inBuildSeason, isBuildWorkday, localDateOf, startOfWeekLocal, todayLocal, type SeasonDays } from "@/lib/time";
import { cn } from "@/lib/utils";

type Props = {
  events: EventRow[];
  range: ReturnType<typeof calendarRange>;
  tz: string;
  season: SeasonDays;
  basePath: string;
  mine?: Map<string, RsvpResponse>;
};

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function EventPill({ e, tz, basePath, mine, compact }: { e: EventRow; tz: string; basePath: string; mine?: RsvpResponse; compact?: boolean }) {
  const cancelled = Boolean(e.cancelledAt);
  return (
    <Link
      href={`${basePath}/${e.id}`}
      className={cn(
        "block truncate rounded-[6px] border bg-background px-1.5 py-0.5 text-[12px] leading-tight transition-colors duration-150 hover:bg-surface",
        cancelled && "text-muted line-through",
        mine === "going" && !cancelled && "border-accent",
      )}
      title={`${e.title} · ${formatInTz(e.startsAt, tz, "h:mm a")}${cancelled ? " (cancelled)" : ""}`}
    >
      <span className="font-mono text-[11px] text-muted">{formatInTz(e.startsAt, tz, "h:mma").toLowerCase()}</span> {compact ? "" : e.title}
      {compact ? e.title : null}
    </Link>
  );
}

function Nav({ range, basePath, tz }: { range: Props["range"]; basePath: string; tz: string }) {
  const q = (view: string, date?: string) => `${basePath}?view=${view}${date ? `&date=${date}` : ""}`;
  const heading =
    range.view === "month"
      ? formatInTz(new Date(`${range.date}T12:00:00Z`), "UTC", "MMMM yyyy")
      : range.view === "week"
        ? `Week of ${formatInTz(new Date(`${range.gridStart}T12:00:00Z`), "UTC", "MMM d")}`
        : "Upcoming";
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        {range.view !== "agenda" ? (
          <>
            <Button asChild variant="secondary" size="icon" aria-label="Previous"><Link href={q(range.view, range.prev)}><ChevronLeft /></Link></Button>
            <Button asChild variant="secondary" size="icon" aria-label="Next"><Link href={q(range.view, range.next)}><ChevronRight /></Link></Button>
            <Button asChild variant="secondary"><Link href={q(range.view, todayLocal(tz))}>Today</Link></Button>
          </>
        ) : null}
        <h2 className="ml-1 text-lg font-semibold">{heading}</h2>
      </div>
      <div role="tablist" aria-label="Calendar view" className="inline-flex rounded-[8px] border p-0.5">
        {VIEWS.map((v) => (
          <Link
            key={v}
            role="tab"
            aria-selected={range.view === v}
            href={q(v, range.view === v ? range.date : todayLocal(tz))}
            className={cn("inline-flex min-h-[36px] items-center rounded-[6px] px-3 text-[13px] capitalize transition-colors duration-150", range.view === v ? "bg-surface font-medium" : "text-muted hover:text-foreground")}
          >
            {v}
          </Link>
        ))}
      </div>
    </div>
  );
}

export function CalendarView({ events, range, tz, season, basePath, mine }: Props) {
  const today = todayLocal(tz);
  const byDay = new Map<string, EventRow[]>();
  for (const e of events) {
    const d = localDateOf(e.startsAt, tz);
    byDay.set(d, [...(byDay.get(d) ?? []), e]);
  }

  return (
    <div>
      <Nav range={range} basePath={basePath} tz={tz} />
      <p className="mb-3 text-[12px] text-muted">
        Times are shown in your team&apos;s timezone ({tz}).
        {season.buildStart ? (
          <>
            {" "}
            <span className="inline-flex items-center gap-1"><span aria-hidden className="inline-block size-2.5 rounded-sm bg-accent-subtle ring-1 ring-accent/40" /> Build season workday</span>{" "}
            <span className="inline-flex items-center gap-1"><span aria-hidden className="inline-block size-2.5 rounded-sm border border-dashed" /> Build season, no workday</span>
          </>
        ) : null}
      </p>

      {range.view === "month" ? (
        <div className="overflow-hidden rounded-[8px] border">
          <div className="grid grid-cols-7 border-b bg-surface text-center text-[12px] text-muted">
            {DOW.map((d) => (
              <div key={d} className="py-2">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {Array.from({ length: 42 }, (_, i) => {
              const d = addDaysLocal(range.gridStart, i);
              const inMonth = d.slice(0, 7) === range.date.slice(0, 7);
              const list = byDay.get(d) ?? [];
              const workday = isBuildWorkday(d, season);
              const inSeason = inBuildSeason(d, season);
              return (
                <div
                  key={d}
                  className={cn(
                    "min-h-[84px] border-b border-r p-1 text-[12px] [&:nth-child(7n)]:border-r-0",
                    !inMonth && "opacity-45",
                    workday && "bg-accent-subtle/60",
                    inSeason && !workday && "border-dashed bg-surface/40",
                  )}
                >
                  <Link
                    href={`${basePath}?view=week&date=${d}`}
                    aria-label={formatInTz(new Date(`${d}T12:00:00Z`), "UTC", "EEEE, MMMM d")}
                    className={cn("mb-1 inline-flex size-6 items-center justify-center rounded-full font-mono text-[12px]", d === today ? "bg-accent text-accent-fg" : "text-muted hover:bg-surface")}
                  >
                    {Number(d.slice(8))}
                  </Link>
                  <div className="space-y-0.5">
                    {list.slice(0, 3).map((e) => (
                      <EventPill key={e.id} e={e} tz={tz} basePath={basePath} mine={mine?.get(e.id)} compact />
                    ))}
                    {list.length > 3 ? (
                      <Link href={`${basePath}?view=week&date=${d}`} className="block px-1 text-[11px] text-muted underline-offset-2 hover:underline">
                        +{list.length - 3} more
                      </Link>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {range.view === "week" ? (
        <div className="grid gap-2 md:grid-cols-7">
          {Array.from({ length: 7 }, (_, i) => {
            const d = addDaysLocal(startOfWeekLocal(range.gridStart), i);
            const list = byDay.get(d) ?? [];
            const workday = isBuildWorkday(d, season);
            return (
              <section key={d} aria-label={d} className={cn("rounded-[8px] border p-2", workday && "bg-accent-subtle/60", d === today && "ring-1 ring-accent")}>
                <h3 className="mb-2 flex items-baseline justify-between text-[12px]">
                  <span className="font-medium">{DOW[i]}</span>
                  <span className={cn("font-mono", d === today ? "text-accent" : "text-muted")}>{formatInTz(new Date(`${d}T12:00:00Z`), "UTC", "MMM d")}</span>
                </h3>
                <div className="space-y-1">
                  {list.length === 0 ? <p className="text-[12px] text-muted">No events</p> : list.map((e) => <EventPill key={e.id} e={e} tz={tz} basePath={basePath} mine={mine?.get(e.id)} />)}
                </div>
              </section>
            );
          })}
        </div>
      ) : null}

      {range.view === "agenda" ? (
        events.length === 0 ? (
          <EmptyState icon={<CalendarDays />} title="Nothing coming up">When events are added, they&apos;ll show up here in order.</EmptyState>
        ) : (
          <ol className="space-y-5">
            {[...byDay.entries()].map(([d, list]) => (
              <li key={d}>
                <h3 className="mb-2 text-[13px] font-medium text-muted">{d === today ? "Today · " : ""}{formatInTz(new Date(`${d}T12:00:00Z`), "UTC", "EEEE, MMMM d")}</h3>
                <ul className="space-y-2">
                  {list.map((e) => {
                    const r = mine?.get(e.id);
                    return (
                      <li key={e.id}>
                        <Link href={`${basePath}/${e.id}`} className="flex items-center justify-between gap-3 rounded-[8px] border p-3 transition-colors duration-150 hover:bg-surface">
                          <div className="min-w-0">
                            <p className={cn("truncate font-medium", e.cancelledAt && "text-muted line-through")}>{e.title}</p>
                            <p className="font-mono text-[12px] text-muted">
                              {formatInTz(e.startsAt, tz, "h:mm a")} – {formatInTz(e.endsAt, tz, "h:mm a")}
                              {e.locationText ? ` · ${e.locationText}` : ""}
                            </p>
                          </div>
                          <div className="flex shrink-0 gap-1.5">
                            {e.cancelledAt ? <Badge tone="error">Cancelled</Badge> : null}
                            {r ? <Badge tone={r === "going" ? "success" : r === "maybe" ? "warning" : "neutral"}>{RSVP_LABEL[r]}</Badge> : null}
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ol>
        )
      ) : null}
    </div>
  );
}
