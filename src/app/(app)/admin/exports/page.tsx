import type { Metadata } from "next";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireUser } from "@/lib/auth/current-user";
import { getCurrentSeason, listSeasons } from "@/lib/seasons";

export const metadata: Metadata = { title: "Exports" };
export const dynamic = "force-dynamic";

const ITEMS = [
  { kind: "hours", title: "Hours per member", text: "One row per member with their total hours, days and events for the season." },
  { kind: "attendance", title: "Attendance per event", text: "Every clock-in and check-in, one row each, with who, when, and whether it counted." },
  { kind: "rsvps", title: "RSVPs per event", text: "Who said Going, Maybe or Can't go for each event, and why." },
  { kind: "signups", title: "Shift sign-ups", text: "Every shift on every event with who holds a place or is on the waitlist, and whether they signed up or a lead placed them." },
] as const;

export default async function ExportsPage() {
  await requireUser({ min: "admin" });
  const [seasons, current] = await Promise.all([listSeasons(), getCurrentSeason()]);
  return (
    <div className="max-w-2xl space-y-6">
      <p className="text-sm text-muted">Downloads open in Excel, Google Sheets or Numbers. Every download is recorded in the audit log.</p>
      <form method="get" className="space-y-6">
        <div className="space-y-1.5">
          <Label htmlFor="season">Season</Label>
          <Select id="season" name="season" defaultValue={current.id} className="max-w-xs">
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>{s.name}{s.isCurrent ? " (current)" : ""}</option>
            ))}
          </Select>
          <p className="text-sm md:text-[13px] text-muted">Pick the season, then use a download button below.</p>
        </div>
        <div className="space-y-3">
          {ITEMS.map((i) => (
            <Card key={i.kind}>
              <CardHeader>
                <CardTitle>{i.title}</CardTitle>
                <CardDescription>{i.text}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button type="submit" formAction={`/api/export/${i.kind}`} variant="secondary"><Download aria-hidden />Download CSV</Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </form>
      <Card>
        <CardHeader>
          <CardTitle>Audit log</CardTitle>
          <CardDescription>Everything admins and leads have changed. Optionally limit by date.</CardDescription>
        </CardHeader>
        <CardContent>
          <form method="get" action="/api/export/audit" className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5"><Label htmlFor="from">From</Label><input id="from" name="from" type="date" className="h-10 min-h-[44px] rounded-[8px] border bg-background px-3 text-sm md:min-h-10" /></div>
            <div className="space-y-1.5"><Label htmlFor="to">To</Label><input id="to" name="to" type="date" className="h-10 min-h-[44px] rounded-[8px] border bg-background px-3 text-sm md:min-h-10" /></div>
            <Button type="submit" variant="secondary"><Download aria-hidden />Download CSV</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
