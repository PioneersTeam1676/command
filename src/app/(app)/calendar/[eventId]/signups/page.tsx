import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Bell, Download } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/form";
import { SelectField } from "@/components/form-fields";
import { ConfirmAction } from "@/components/confirm-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser, roleAtLeast } from "@/lib/auth/current-user";
import { getEvent } from "@/lib/events";
import { listGroups } from "@/lib/groups";
import { eligiblePeople, unsignedPeople } from "@/lib/signup-admin";
import { getSignupView, type RosterEntry } from "@/lib/signups";
import { getSettings } from "@/lib/settings";
import { formatInTz } from "@/lib/time";
import { uuidSchema } from "@/lib/validation";
import { assignGroupAction, assignPeopleAction, nudgeAction, removeEntryAction } from "../../signup-actions";

export const metadata: Metadata = { title: "Manage sign-ups" };
export const dynamic = "force-dynamic";

function Row({ who, slotTitle, eventId, label }: { who: RosterEntry; slotTitle: string; eventId: string; label: string }) {
  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
      <span className="min-w-0 truncate">
        {label} {who.name}
        {who.source === "admin" ? <span className="text-muted"> · placed by a lead</span> : null}
        {who.note ? <span className="text-muted"> · “{who.note}”</span> : null}
      </span>
      {who.entryId ? (
        <ConfirmAction
          label="Remove"
          title={`Take ${who.name} off “${slotTitle}”?`}
          description="They'll get a notification, and the next person on the waitlist (if any) takes the place."
          confirmLabel="Remove"
          action={removeEntryAction}
          fields={{ entryId: who.entryId, eventId }}
          variant="ghost"
        />
      ) : null}
    </li>
  );
}

export default async function ManageSignupsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const user = await requireUser({ min: "lead" });
  const { eventId } = await params;
  if (!uuidSchema.safeParse(eventId).success) notFound();
  const event = await getEvent(eventId);
  if (!event) notFound();
  const [settings, view, groups] = await Promise.all([getSettings(), getSignupView(eventId, { id: user.id, role: user.role }), listGroups()]);
  if (!view) notFound();
  const tz = settings.timezone;
  const live = view.slots.filter((s) => !s.slot.cancelledAt && s.slot.kind !== "attend");
  const [unsigned, pools] = await Promise.all([unsignedPeople(view.sheet.id), Promise.all(live.map(async (v) => [v.slot.id, await eligiblePeople(v.slot.id)] as const))]);
  const pool = new Map(pools);
  const places = live.reduce((n, v) => n + v.slot.capacity, 0);
  const filled = live.reduce((n, v) => n + v.filled, 0);

  return (
    <div className="space-y-6">
      <Link href={`/calendar/${event.id}`} className="text-sm md:text-[13px] text-muted underline-offset-4 hover:underline">← {event.title}</Link>
      <h1 className="text-2xl font-semibold tracking-tight">Manage sign-ups</h1>

      <Card>
        <CardHeader>
          <CardTitle>Where things stand</CardTitle>
          <CardDescription>{filled} of {places} places filled across {live.length} {live.length === 1 ? "shift" : "shifts"}.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">
            <Badge tone={unsigned.length > 0 ? "warning" : "success"}>{unsigned.length}</Badge>{" "}
            {unsigned.length === 0 ? "Everyone who can sign up has, or nothing is open right now." : `${unsigned.length === 1 ? "person hasn't" : "people haven't"} signed up for a shift they could take.`}
          </p>
          {unsigned.length > 0 ? (
            <details>
              <summary className="cursor-pointer text-sm text-muted hover:text-foreground">Who</summary>
              <p className="mt-2 text-sm md:text-[13px] text-muted">{unsigned.map((p) => p.name).join(", ")}</p>
            </details>
          ) : null}
          <div className="flex flex-wrap items-start gap-3">
            <ActionForm action={nudgeAction} className="space-y-2">
              <input type="hidden" name="sheetId" value={view.sheet.id} />
              <input type="hidden" name="eventId" value={event.id} />
              <SubmitButton variant="secondary" pendingText="Sending…" disabled={unsigned.length === 0}><Bell aria-hidden />Remind people who haven&apos;t signed up</SubmitButton>
            </ActionForm>
            {roleAtLeast(user.role, "admin") ? (
              <Button asChild variant="ghost"><Link href="/admin/exports"><Download aria-hidden />Download all sign-ups (CSV)</Link></Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {live.length === 0 ? (
        <EmptyState title="No shifts yet">Add shifts from the event page, then come back here to place people.</EmptyState>
      ) : (
        live.map((v) => {
          const { slot } = v;
          const people = pool.get(slot.id) ?? [];
          return (
            <Card key={slot.id}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle>{slot.title}</CardTitle>
                  <Badge tone={v.filled >= slot.capacity ? "warning" : "success"}>{v.filled} of {slot.capacity}{v.filled > slot.capacity ? " · over" : ""}</Badge>
                </div>
                <CardDescription>{formatInTz(slot.startsAt, tz, "EEE MMM d, h:mm a")} – {formatInTz(slot.endsAt, tz, "h:mm a")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {v.roster && v.roster.length > 0 ? (
                  <ul className="divide-y rounded-lg border" aria-label={`On ${slot.title}`}>
                    {v.roster.map((r) => <Row key={r.userId} who={r} slotTitle={slot.title} eventId={event.id} label="" />)}
                  </ul>
                ) : (
                  <p className="text-sm md:text-[13px] text-muted">Nobody yet.</p>
                )}
                {v.queue && v.queue.length > 0 ? (
                  <div className="space-y-1.5">
                    <h3 className="text-sm font-medium">Waitlist</h3>
                    <ul className="divide-y rounded-lg border" aria-label={`Waitlist for ${slot.title}`}>
                      {v.queue.map((r, i) => <Row key={r.userId} who={r} slotTitle={slot.title} eventId={event.id} label={`${i + 1}.`} />)}
                    </ul>
                  </div>
                ) : null}

                {people.length > 0 ? (
                  <details>
                    <summary className="cursor-pointer text-sm font-medium">Add people</summary>
                    <ActionForm action={assignPeopleAction} className="mt-3 space-y-3">
                      <input type="hidden" name="slotId" value={slot.id} />
                      <input type="hidden" name="eventId" value={event.id} />
                      <fieldset className="max-h-56 space-y-1 overflow-y-auto rounded-lg border p-3">
                        <legend className="sr-only">People to add to {slot.title}</legend>
                        {people.map((p) => (
                          <label key={p.id} className="flex items-center gap-2 py-1 text-sm">
                            <input type="checkbox" name="userIds" value={p.id} className="size-4 accent-foreground" />
                            {p.name} <span className="text-muted capitalize">· {p.role}</span>
                          </label>
                        ))}
                      </fieldset>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="overbook" className="size-4 accent-foreground" />
                        Place them even if it&apos;s over the number needed
                      </label>
                      <SubmitButton variant="secondary" pendingText="Adding…">Add selected</SubmitButton>
                    </ActionForm>
                  </details>
                ) : null}

                {groups.length > 0 ? (
                  <details>
                    <summary className="cursor-pointer text-sm font-medium">Add a whole group</summary>
                    <ActionForm action={assignGroupAction} className="mt-3 space-y-3">
                      <input type="hidden" name="slotId" value={slot.id} />
                      <input type="hidden" name="eventId" value={event.id} />
                      <SelectField name="groupId" label="Group" options={groups.map((g) => ({ value: g.id, label: `${g.name} (${g.memberCount})` }))} />
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="overbook" className="size-4 accent-foreground" />
                        Place them even if it&apos;s over the number needed
                      </label>
                      <SubmitButton variant="secondary" pendingText="Adding…">Add the group</SubmitButton>
                    </ActionForm>
                  </details>
                ) : null}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
