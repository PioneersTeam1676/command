"use client";
import { useState } from "react";
import { useFormState } from "@/components/form";
import { SelectField, TextField } from "@/components/form-fields";

/** A past event someone can add time for. `inTime`/`outTime` are the event's own times (`HH:mm`), used as defaults. */
export type ManualEvent = { id: string; label: string; dayLabel: string; inTime: string; outTime: string };

/** In/Out as times only. The day comes from the chosen event or a separate Day field. */
export function TimeRangeFields({ tz, inDefault, outDefault, dayHint }: { tz: string; inDefault?: string; outDefault?: string; dayHint?: string }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField name="inTime" label="In" type="time" defaultValue={inDefault} required help={dayHint ? `${dayHint}, in ${tz}` : `In ${tz}`} />
      <TextField name="outTime" label="Out" type="time" defaultValue={outDefault} required />
    </div>
  );
}

/** Event picker whose In/Out defaults follow the selected event. */
export function EventTimeFields({ events, tz }: { events: ManualEvent[]; tz: string }) {
  const kept = useFormState().values?.eventId;
  const [eventId, setEventId] = useState(kept && events.some((e) => e.id === kept) ? kept : events[0]?.id);
  const event = events.find((e) => e.id === eventId) ?? events[0];
  return (
    <>
      <SelectField
        name="eventId"
        label="Event"
        defaultValue={eventId}
        onChange={(e) => setEventId(e.currentTarget.value)}
        options={events.map((e) => ({ value: e.id, label: e.label }))}
      />
      {/* Remount on change so the time defaults switch to the newly picked event. */}
      <TimeRangeFields key={event?.id} tz={tz} inDefault={event?.inTime} outDefault={event?.outTime} dayHint={event ? `On ${event.dayLabel}` : undefined} />
    </>
  );
}

/** Lead/admin "Add time": either an event, or (checkbox) a build season day with its own date. */
export function AdminTimeFields({ events, tz }: { events: ManualEvent[]; tz: string }) {
  const kept = useFormState().values;
  const [buildSeason, setBuildSeason] = useState(kept?.buildSeason !== undefined ? kept.buildSeason === "on" : events.length === 0);
  return (
    <>
      <div className="grid items-end gap-4 sm:grid-cols-2">
        <label className="flex min-h-9 items-center gap-2 text-sm font-medium">
          <input type="checkbox" name="buildSeason" checked={buildSeason} onChange={(e) => setBuildSeason(e.currentTarget.checked)} className="size-4 accent-foreground" />
          Build season (not an event)
        </label>
        {buildSeason ? <TextField name="date" label="Date" type="date" required /> : null}
      </div>
      {buildSeason ? (
        <TimeRangeFields tz={tz} />
      ) : events.length > 0 ? (
        <EventTimeFields events={events} tz={tz} />
      ) : (
        <p className="text-sm md:text-[13px] text-muted">No past events this season are missing their time. Tick build season to add a day instead.</p>
      )}
    </>
  );
}
