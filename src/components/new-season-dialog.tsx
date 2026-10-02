"use client";
import { ActionForm, SubmitButton } from "@/components/form";
import { TextField } from "@/components/form-fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import type { FormState } from "@/lib/form";

export function NewSeasonDialog({ action, currentName, today, splitDate, upcomingCount }: { action: (prev: FormState, fd: FormData) => Promise<FormState>; currentName: string; today: string; splitDate: string; upcomingCount: number }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary">Start a new season…</Button>
      </DialogTrigger>
      <DialogContent title="Start a new season" description={`This closes “${currentName}” and starts fresh.`} className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <div className="mb-4 space-y-2 rounded-lg border bg-surface p-3 text-sm md:text-[13px]">
          <p className="font-medium">Here&apos;s what happens</p>
          <ul className="list-disc space-y-1 pl-5 text-muted">
            <li><strong className="text-foreground">{currentName}</strong> is archived. Its hours, attendance and leaderboard stay viewable and downloadable. Nothing is deleted.</li>
            <li>The leaderboard and everyone&apos;s season hours start at zero for the new season.</li>
            <li>{upcomingCount > 0 ? `${upcomingCount} event${upcomingCount === 1 ? "" : "s"} already scheduled from ${splitDate} on move into the new season.` : `Events already scheduled from ${splitDate} on move into the new season.`}</li>
            <li>Anyone clocked in right now keeps that time in the old season.</li>
            <li>You can&apos;t undo this, but you can edit the new season&apos;s dates afterwards.</li>
          </ul>
        </div>
        <ActionForm action={action} className="space-y-4">
          <TextField name="name" label="New season name" required maxLength={80} placeholder="2027 Season" />
          <TextField name="startDate" label="Starts on" type="date" defaultValue={today} max={today} required help="Today or earlier. The old season ends the day before." />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField name="buildStart" label="Build season starts (optional)" type="date" />
            <TextField name="buildEnd" label="Build season ends (optional)" type="date" />
          </div>
          <label className="flex min-h-[44px] items-start gap-3 text-sm">
            <input type="checkbox" name="confirm" className="mt-1 size-4 accent-foreground" required />
            <span>I understand the current season will be archived.</span>
          </label>
          <div className="flex justify-end gap-2">
            <DialogClose asChild><Button type="button" variant="ghost">Cancel</Button></DialogClose>
            <SubmitButton pendingText="Starting…">Start new season</SubmitButton>
          </div>
        </ActionForm>
      </DialogContent>
    </Dialog>
  );
}
