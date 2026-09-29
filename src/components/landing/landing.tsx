import Link from "next/link";
import { CalendarDays, Clock, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GridBackground } from "@/components/ui/grid-background";

/**
 * Public home page for signed-out visitors (no sign-in needed to read it). It states what Command is for,
 * how it uses Google, and links to the Privacy Policy and Terms, as the Google OAuth consent screen requires.
 */
export function Landing() {
  return (
    <GridBackground className="min-h-dvh">
      <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-10 px-5 py-16">
        <div className="space-y-4">
          <h1 className="text-5xl font-semibold tracking-tight">Command</h1>
          <p className="text-lg">
            Command is team management software for FIRST Robotics teams. Teams use it to run their calendar, track attendance and
            build-season hours, and keep members and parents informed.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button asChild size="lg"><Link href="/login">Sign in</Link></Button>
            <Button asChild size="lg" variant="secondary"><Link href="/signup">Join your team</Link></Button>
          </div>
        </div>

        <ul className="grid gap-4 sm:grid-cols-3">
          {[
            { Icon: Clock, title: "Attendance & hours", body: "Members clock in and out, and leads approve time." },
            { Icon: CalendarDays, title: "Events & RSVPs", body: "A shared calendar with reminders and check-in." },
            { Icon: Users, title: "Members & parents", body: "Rosters, approvals and updates for families." },
          ].map(({ Icon, title, body }) => (
            <li key={title} className="rounded-[10px] border bg-background p-4">
              <Icon className="mb-2 size-5 text-muted" aria-hidden />
              <p className="font-medium">{title}</p>
              <p className="mt-1 text-sm text-muted">{body}</p>
            </li>
          ))}
        </ul>

        <section className="space-y-2 text-sm text-muted">
          <h2 className="text-base font-semibold text-foreground">How Command uses Google</h2>
          <p>
            Members can choose &ldquo;Continue with Google&rdquo; to sign in. Command then receives only their verified email address and
            Google account ID. If a team connects Google Calendar, Command reads and writes that team&apos;s own calendar events so
            the team calendar stays in sync. Command does not access email, contacts, Drive or other Google data, and does not share
            or sell it.
          </p>
        </section>

        <p className="text-sm text-muted">
          <Link href="/privacy" className="underline underline-offset-4">Privacy Policy</Link>
          {" · "}
          <Link href="/terms" className="underline underline-offset-4">Terms of Service</Link>
        </p>
      </main>
    </GridBackground>
  );
}
