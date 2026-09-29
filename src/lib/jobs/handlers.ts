import { purgeOldRateLimits } from "@/lib/auth/rate-limit";
import { purgeExpiredSessions } from "@/lib/auth/session-cleanup";
import { sweepAutoClose } from "@/lib/attendance";
import { runReminders } from "@/lib/reminders";
import { getEnv } from "@/lib/env";
import { pushEventToGoogle } from "@/lib/gcal/api";
import { runIcsSync } from "@/lib/gcal/ics";
import { readSettings } from "@/lib/settings";
import type { EventChangeKind } from "@/lib/gcal-sync";
import { registerJob } from "./scheduler";

let registered = false;

/** All job handlers. Add new kinds here. Each must be idempotent. */
export function registerAllJobs() {
  if (registered) return;
  registered = true;
  registerJob("attendance.sweep", async (_job, now) => void (await sweepAutoClose(now)), { everySeconds: 60 });
  registerJob("reminders.tick", async (_job, now) => void (await runReminders(now)), { everySeconds: 60 });
  registerJob(
    "gcal.push",
    async (job) => {
      const { eventId, kind } = job.payload as { eventId: string; kind: EventChangeKind };
      await pushEventToGoogle(eventId, kind); // throws on failure, so the scheduler retries with backoff
    },
  );
  registerJob(
    "gcal.ics",
    async (_job, now) => {
      const env = getEnv();
      if (env.GOOGLE_CALENDAR_MODE !== "ics") return;
      const settings = await readSettings();
      await runIcsSync(settings.googleIcsUrl ?? env.GOOGLE_CALENDAR_ICS_URL, now);
    },
    { everySeconds: 600 },
  );
  registerJob(
    "maintenance",
    async () => {
      await purgeOldRateLimits();
      await purgeExpiredSessions();
    },
    { everySeconds: 3600 },
  );
}
