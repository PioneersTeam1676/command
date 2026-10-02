"use client";
import { useActionState } from "react";
import { CalendarPlus } from "lucide-react";
import { CopyField } from "@/components/copy-field";
import { FormMessage, SubmitButton } from "@/components/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { FormState } from "@/lib/form";

type Action = () => Promise<FormState>;
const start: FormState = {};

/**
 * Subscribe to your shifts from a phone or computer calendar. The address holds a secret, so it is shown
 * once when made, then only "reset" (a new secret; the old one stops working) or "turn off" remain.
 */
export function FeedCard({ exists, lastUsedLabel, reset, revoke }: { exists: boolean; lastUsedLabel: string | null; reset: Action; revoke: Action }) {
  const [made, makeAction] = useActionState(async () => reset(), start);
  const [off, offAction] = useActionState(async () => revoke(), start);
  const url = made.data?.url;
  const on = (exists || Boolean(url)) && !off.success;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><CalendarPlus className="size-4" aria-hidden />Put my shifts in my calendar</CardTitle>
        <CardDescription>Get a private link that keeps your shifts up to date in Google Calendar, Apple Calendar or Outlook, including changes and cancellations.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {url ? (
          <div className="space-y-3">
            <CopyField value={url} label="Your private calendar link" />
            <ol className="list-decimal space-y-1 pl-5 text-sm md:text-[13px] text-muted">
              <li>Copy the link above.</li>
              <li>Google Calendar: <em>Other calendars</em>, then <em>From URL</em>, then paste. Apple Calendar: <em>File</em>, <em>New Calendar Subscription</em>. Outlook: <em>Add calendar</em>, <em>Subscribe from web</em>.</li>
              <li>Your calendar app refreshes it on its own, usually every few hours.</li>
            </ol>
          </div>
        ) : null}
        <p className="rounded-lg border bg-surface p-3 text-sm md:text-[13px] text-muted">
          Anyone with this link can see your shift times and where they are, so don&apos;t share it. If it gets out, make a new one and the old one stops working.
        </p>
        {on && !url ? <p className="text-sm md:text-[13px] text-muted">Your link is on{lastUsedLabel ? `. Last used ${lastUsedLabel}` : ", and hasn't been used yet"}. We can&apos;t show it again, but you can make a new one.</p> : null}
        <div className="flex flex-wrap gap-2">
          <form action={makeAction}>
            <SubmitButton variant={on ? "secondary" : "primary"} pendingText="Working…">{on ? "Make a new link" : "Make my calendar link"}</SubmitButton>
          </form>
          {on ? (
            <form action={offAction}>
              <SubmitButton variant="ghost" pendingText="Working…">Turn off</SubmitButton>
            </form>
          ) : null}
        </div>
        <FormMessage state={off.success ? off : made.error ? made : {}} />
      </CardContent>
    </Card>
  );
}
