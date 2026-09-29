import { purgeOldRateLimits } from "@/lib/auth/rate-limit";
import { purgeExpiredSessions } from "@/lib/auth/session-cleanup";
import { sweepAutoClose } from "@/lib/attendance";
import { runReminders } from "@/lib/reminders";
import { registerJob } from "./scheduler";

let registered = false;

/** All job handlers. Add new kinds here. Each must be idempotent. */
export function registerAllJobs() {
  if (registered) return;
  registered = true;
  registerJob("attendance.sweep", async (_job, now) => void (await sweepAutoClose(now)), { everySeconds: 60 });
  registerJob("reminders.tick", async (_job, now) => void (await runReminders(now)), { everySeconds: 60 });
  registerJob(
    "maintenance",
    async () => {
      await purgeOldRateLimits();
      await purgeExpiredSessions();
    },
    { everySeconds: 3600 },
  );
}
