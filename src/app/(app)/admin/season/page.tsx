import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/form";
import { TextField } from "@/components/form-fields";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/current-user";
import { getCurrentSeason } from "@/lib/seasons";
import { saveSeasonAction } from "./actions";

export const metadata: Metadata = { title: "Season" };
export const dynamic = "force-dynamic";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function SeasonPage() {
  await requireUser({ min: "admin" });
  const season = await getCurrentSeason();
  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Current season</CardTitle>
        <CardDescription>
          During build season, members can clock in any day without an event, and daily reminders go out on your workdays.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ActionForm action={saveSeasonAction} className="space-y-4">
          <TextField name="name" label="Season name" defaultValue={season.name} required maxLength={80} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField name="buildStart" label="Build season starts" type="date" defaultValue={season.buildStart ?? ""} help="Leave both dates empty if you're not in build season." />
            <TextField name="buildEnd" label="Build season ends" type="date" defaultValue={season.buildEnd ?? ""} />
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Workdays</legend>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d, i) => (
                <label key={d} className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-[8px] border px-3 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-subtle">
                  <input type="checkbox" name="workdays" value={i} defaultChecked={season.workdays.includes(i)} className="size-4 accent-[var(--accent)]" />
                  {d}
                </label>
              ))}
            </div>
            <p className="mt-2 text-[13px] text-muted">Reminders only go out on these days. Members can still clock in on other days inside build season.</p>
          </fieldset>
          <SubmitButton pendingText="Saving…">Save season</SubmitButton>
        </ActionForm>
      </CardContent>
    </Card>
  );
}
