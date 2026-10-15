import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CalendarDays } from "lucide-react";
import type { EventRow } from "@/lib/events";
import { agendaEntries, calendarRange, VIEWS } from "@/lib/calendar-view";
import { addDaysLocal, daysBetween, formatInTz, inBuildSeason, isBuildWorkday, localDateOf, startOfWeekLocal, todayLocal, type SeasonDays } from "@/lib/time";
import { cn } from "@/lib/utils";

type Props = {
  events: EventRow[];
  range: ReturnType<typeof calendarRange>;
  tz: string;
  season: SeasonDays;
  basePath: string;
  /** Events this person has signed up to attend. */
  mine?: Set<string>;
  /** Per event: shifts this person could take, and shifts they hold. */
  shifts?: Map<string, { open: number; mine: number }>;
};

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function EventPill({ e, tz, basePath, mine, compact }: { e: EventRow; tz: string; basePath: string; mine?: boolean; compact?: boolean }) {
  const cancelled = Boolean(e.cancelledAt);
  return (
    <Link
      href={`${basePath}/${e.id}`}
      className={cn(
        "block truncate rounded-md border bg-background px-1.5 py-0.5 text-[13px] md:text-[12px] leading-tight transition-colors duration-150 hover:bg-surface",
        cancelled && "text-muted line-through",
        mine && !cancelled && "border-accent",
      )}
      title={`${e.title} · ${formatInTz(e.startsAt, tz, "h:mm a")}${cancelled ? " (cancelled)" : ""}`}
    >
      <span className="font-mono text-xs md:text-[11px] text-muted">{formatInTz(e.startsAt, tz, "h:mma").toLowerCase()}</span> {compact ? "" : e.title}
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
        : range.date === todayLocal(tz)
          ? "Upcoming"
          : `From ${formatInTz(new Date(`${range.date}T12:00:00Z`), "UTC", "EEE, MMM d")}`;
  return (
    <div className="mb-4 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-tight">{heading}</h2>
        {range.view === "agenda" && range.date !== todayLocal(tz) ? (
          <Button asChild variant="ghost"><Link href={q("agenda", todayLocal(tz))}>Today</Link></Button>
        ) : null}
        {range.view !== "agenda" ? (
          <div className="flex items-center gap-1">
            <Button asChild variant="ghost"><Link href={q(range.view, todayLocal(tz))}>Today</Link></Button>
            <Button asChild variant="secondary" size="icon" aria-label="Previous"><Link href={q(range.view, range.prev)}><ChevronLeft /></Link></Button>
            <Button asChild variant="secondary" size="icon" aria-label="Next"><Link href={q(range.view, range.next)}><ChevronRight /></Link></Button>
          </div>
        ) : null}
      </div>
      <nav aria-label="Calendar view" className="grid grid-cols-3 rounded-lg bg-surface p-1 md:inline-flex md:self-start">
        {VIEWS.map((v) => (
          <Link
            key={v}
            aria-current={range.view === v ? "page" : undefined}
            href={q(v, range.view === v ? range.date : todayLocal(tz))}
            className={cn("inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm capitalize transition-colors duration-150 md:min-h-9 md:text-[13px]", range.view === v ? "bg-background font-medium ring-1 ring-inset ring-border" : "text-muted hover:text-foreground")}
          >
            {v}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function CalendarView({ events, range, tz, season, basePath, mine, shifts }: Props) {
  const today = todayLocal(tz);
  const byDay = new Map<string, EventRow[]>();
  for (const e of events) {
    const d = localDateOf(e.startsAt, tz);
    byDay.set(d, [...(byDay.get(d) ?? []), e]);
  }
  const monthDays = daysBetween(range.gridStart, localDateOf(range.to, tz));
  const monthEntries = [...byDay.entries()].filter(([d]) => d.slice(0, 7) === range.date.slice(0, 7));
  const showsSeason = range.view !== "agenda" && season.buildStart && season.buildEnd
    && season.buildStart < localDateOf(range.to, tz) && season.buildEnd >= range.gridStart;

  return (
    <div>
      <Nav range={range} basePath={basePath} tz={tz} />

      {range.view === "month" ? (
        <div className="overflow-hidden md:rounded-lg md:border">
          <div className="grid grid-cols-7 text-center text-xs text-muted md:border-b md:bg-surface">
            {DOW.map((d) => (
              <div key={d} className="py-2">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1 md:gap-0">
            {Array.from({ length: monthDays }, (_, i) => {
              const d = addDaysLocal(range.gridStart, i);
              const inMonth = d.slice(0, 7) === range.date.slice(0, 7);
              const list = byDay.get(d) ?? [];
              const workday = isBuildWorkday(d, season);
              const inSeason = inBuildSeason(d, season);
              return (
                <div
                  key={d}
                  className={cn(
                    "min-w-0 rounded-md md:min-h-24 md:rounded-none md:border-b md:border-r md:p-1 md:text-xs md:[&:nth-child(7n)]:border-r-0 md:[&:nth-last-child(-n+7)]:border-b-0",
                    !inMonth && "md:bg-surface/70",
                    workday && "bg-accent-subtle/60",
                    inSeason && !workday && "border border-dashed bg-surface/40",
                  )}
                >
                  <Link
                    href={`${basePath}?view=agenda&date=${d}`}
                    aria-label={`${formatInTz(new Date(`${d}T12:00:00Z`), "UTC", "EEEE, MMMM d")}${list.length ? `, ${list.length} ${list.length === 1 ? "event" : "events"}` : ""}${inSeason ? workday ? ", build workday" : ", build season, no workday" : ""}`}
                    aria-current={d === today ? "date" : undefined}
                    className="flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-md transition-colors hover:bg-surface md:mb-1 md:inline-flex md:min-h-0"
                  >
                    <span className={cn("inline-flex size-8 items-center justify-center rounded-full text-sm tabular-nums md:size-6 md:text-xs", d === today ? "bg-accent font-semibold text-accent-fg" : inMonth ? "text-foreground" : "text-muted")}>
                      {Number(d.slice(8))}
                    </span>
                    <span aria-hidden className="flex h-1.5 items-center justify-center gap-0.5 md:hidden">
                      {list.slice(0, 3).map((e) => <span key={e.id} className={cn("size-1 rounded-full", e.cancelledAt ? "bg-muted" : "bg-accent")} />)}
                    </span>
                  </Link>
                  <div className="hidden space-y-0.5 md:block">
                    {list.slice(0, 3).map((e) => (
                      <EventPill key={e.id} e={e} tz={tz} basePath={basePath} mine={mine?.has(e.id)} compact />
                    ))}
                    {list.length > 3 ? (
                      <Link href={`${basePath}?view=agenda&date=${d}`} className="block px-1 text-xs md:text-[11px] text-muted underline-offset-2 hover:underline">
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

      {showsSeason ? (
        <div className="mb-3 mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted" aria-label="Build season legend">
          <span className="inline-flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-sm bg-accent-subtle ring-1 ring-accent/40" />Build workday</span>
          <span className="inline-flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-sm border border-dashed" />Season day off</span>
        </div>
      ) : null}

      {range.view === "month" ? (
        <section aria-label="This month's events" className="mt-6 border-t pt-5 md:hidden">
          <h3 className="mb-4 text-sm font-semibold">This month</h3>
          {monthEntries.length ? (
            <EventList entries={monthEntries} today={today} tz={tz} basePath={basePath} mine={mine} shifts={shifts} />
          ) : (
            <div className="py-2">
              <p className="text-sm font-medium">No events this month</p>
              <p className="mt-1 text-sm text-muted">Try another month or switch to Agenda.</p>
            </div>
          )}
        </section>
      ) : null}

      {range.view === "week" ? (
        <div className="grid gap-2 md:grid-cols-7">
          {Array.from({ length: 7 }, (_, i) => {
            const d = addDaysLocal(startOfWeekLocal(range.gridStart), i);
            const list = byDay.get(d) ?? [];
            const workday = isBuildWorkday(d, season);
            return (
              <section key={d} aria-label={d} className={cn("min-w-0 rounded-lg border p-2", workday && "bg-accent-subtle/60", d === today && "ring-1 ring-accent")}>
                <h3 className="mb-2 flex items-baseline justify-between text-[13px] md:text-[12px]">
                  <span className="font-medium">{DOW[i]}</span>
                  <span className={cn("font-mono", d === today ? "text-accent" : "text-muted")}>{formatInTz(new Date(`${d}T12:00:00Z`), "UTC", "MMM d")}</span>
                </h3>
                <div className="space-y-1">
                  {list.length === 0 ? <p className="text-[13px] md:text-[12px] text-muted">No events</p> : list.map((e) => <EventPill key={e.id} e={e} tz={tz} basePath={basePath} mine={mine?.has(e.id)} />)}
                </div>
              </section>
            );
          })}
        </div>
      ) : null}

      {range.view === "agenda" ? (
        (() => {
          const entries = agendaEntries(byDay, range.date, today, events, tz);
          return entries.length === 0 ? (
            <EmptyState icon={<CalendarDays />} title="Nothing coming up">When events are added, they&apos;ll show up here in order.</EmptyState>
          ) : (
            <EventList entries={entries} today={today} tz={tz} basePath={basePath} mine={mine} shifts={shifts} />
          );
        })()
      ) : null}
    </div>
  );
}

function EventList({ entries, today, tz, basePath, mine, shifts }: Pick<Props, "tz" | "basePath" | "mine" | "shifts"> & { entries: [string, EventRow[]][]; today: string }) {
  return (
    <ol className="space-y-5">
      {entries.map(([d, list]) => (
        <li key={d}>
          <h3 className="mb-2 text-sm md:text-[13px] font-medium text-muted">{d === today ? "Today · " : ""}{formatInTz(new Date(`${d}T12:00:00Z`), "UTC", "EEEE, MMMM d")}</h3>
          {list.length === 0 ? <p className="rounded-lg border border-dashed p-3 text-sm text-muted">Nothing scheduled.</p> : null}
          <ul className="space-y-2">
            {list.map((e) => {
              const r = mine?.has(e.id);
              const sh = e.cancelledAt ? undefined : shifts?.get(e.id);
              return (
                <li key={e.id}>
                  <Link href={`${basePath}/${e.id}`} className="flex flex-col gap-2 rounded-lg border p-3 transition-colors duration-150 hover:bg-surface md:flex-row md:items-center md:justify-between md:gap-3">
                    <div className="min-w-0">
                      <p className={cn("break-words font-medium", e.cancelledAt && "text-muted line-through")}>{e.title}</p>
                      <p className="mt-1 break-words text-[13px] text-muted md:text-xs">
                        {formatInTz(e.startsAt, tz, "h:mm a")} – {formatInTz(e.endsAt, tz, "h:mm a")}
                        {e.locationText ? ` · ${e.locationText}` : ""}
                      </p>
                    </div>
                    {e.cancelledAt || r || sh?.open || sh?.mine ? <div className="flex shrink-0 flex-wrap gap-1.5">
                      {e.cancelledAt ? <Badge tone="error">Cancelled</Badge> : null}
                      {sh?.mine ? <Badge tone="success">{sh.mine === 1 ? "Your shift" : `${sh.mine} shifts`}</Badge> : null}
                      {sh?.open ? <Badge tone="info">{sh.open} {sh.open === 1 ? "shift" : "shifts"} open</Badge> : null}
                      {r ? <Badge tone="success">Going</Badge> : null}
                    </div> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ol>
  );
}
