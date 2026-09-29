# Decisions

One line each: what, why.

- Repo root is `/srv/md0/robotics/command` with no wrapper folder; `src/` and `registry/` sit at the root as the spec requires.
- `pg` (node-postgres) as the Drizzle driver: mature, supports dedicated connections needed for advisory locks.
- TypeScript pinned to 5.9 and ESLint to 9: best-supported by Next 16 and eslint-config-next; newer majors are not needed.
- `arctic` is marked deprecated on npm but the spec locks it; used as specified, isolated in `src/lib/auth/google.ts` so it is easy to swap.
- Vitest 3 rather than 5: stable with the current Vite toolchain.
- `nodemailer` 7: matches `@types/nodemailer` 7.
- shadcn/ui components are hand-written in `src/components/ui` (Radix + cva) instead of running the interactive CLI, so the repo stays reproducible offline.
- Full data model (spec section 5) is created in the first migration so later phases only add columns.
- Extra tables beyond the spec: `auth_tokens` (email verify, password reset), `rate_limits`, `in_app_notifications` (spec asks for in-app notices).
- Migrations run in `instrumentation.ts` guarded by a Postgres advisory lock.
- Docker healthcheck hits `/api/health` (DB round trip, no team data).

## Legal documents (standing rule from the owner)

- Terms of Service and Privacy Policy live in `src/lib/legal/terms.ts` and `privacy.ts`, served publicly at `/terms` and `/privacy`, and linked from sign-in, sign-up, setup and Me.
- They must be updated in the same commit as any change to data collected/stored/shared, third-party services, notification channels, retention, registry payload, or license behaviour. Bump `updated` each time. Review both at the end of every phase.
- They are written to match the app's real behaviour, but they are not legal advice: a lawyer must review them (with LICENSE) before the owner relies on them, especially for minors (COPPA/FERPA/GDPR-K).
- `.gitignore` is also kept current each phase (secrets, env files, build output, runtime data, generated manifest).

## Phase 1

- Setup wizard saves each step immediately (admin, then team settings); only the last step sets `setup_completed_at`. Closing the browser mid-way is safe: the admin signs back in from the wizard. The setup token lives in an httpOnly cookie and is re-checked on every setup action.
- Setup token is regenerated at every boot until setup finishes (printed to logs); `SETUP_TOKEN` env overrides it. Only the hash is stored.
- Pending users can sign in and see `/waiting`; denied/deactivated users cannot sign in and see a plain explanation (the denial reason for password sign-in, and via a 60 s flash cookie for Google).
- Password sign-up with an unverified email on an allowed domain creates no access request until the email link is confirmed (spec 4.3). Every other sign-up creates one immediately; admins see whether the email was confirmed.
- Email confirmation and password reset links open a page with a button (POST), so mail scanners that prefetch URLs can't burn single-use tokens.
- Parent accounts are `active` immediately (any domain, no email verification) because access is gated by admin approval of the parent link, not by the address.
- Admin "Reset password": with SMTP it emails a reset link (falls back to a temporary password if sending fails); without SMTP it shows a one-time temporary password and forces a change at next sign-in.
- Client IP for rate limits is the first `X-Forwarded-For` hop (or `X-Real-IP`). Behind a reverse proxy this is right; if the app is exposed directly it can be spoofed, so per-account limits are the real guard.
- CSP: scripts are nonce-only with `strict-dynamic`; `style-src` allows `'unsafe-inline'` because React emits style attributes.
- Logos: PNG/JPEG/WebP only (magic-byte check, max 512 KB, no SVG), stored under `DATA_DIR/logos` (a Docker volume) and served from `/api/logo`.
- Integration tests use a throwaway Postgres database per test file; set `TEST_DATABASE_URL` to run them (they are skipped, not faked, when it is unset). CI must set it.
- Playwright e2e runs against `next build` output on port 3100 with a fresh `cmd_e2e` database and `SETUP_TOKEN=e2e-setup-token-1234`.
- `nodemailer` 7 is used (matches `@types/nodemailer` 7).

## Phase 2

- Multi-day events show on the calendar on the day they start. Events are capped at 3 days.
- An event's season is the season whose date range contains its start date (current season as fallback).
- Event change notifications go to every active member (member, lead, admin) and to parents with an approved, non-revoked link to an active student; deduped per change.
- Parents see the team calendar read-only once at least one student link is approved (event data is team-wide, not personal).
- The "no response" list includes active members, leads and admins (not parents, pending or deactivated users).
- Only `admin` can edit the current season (build range, workdays); leads manage events.
- Google Calendar pushes go through the `src/lib/gcal-sync.ts` seam (no-op until the Google Calendar phase).

## Phase 3

- Open clock-in is only available inside the season's build date range, once per local day (DB unique index), and closes at the auto clock-out time (default 9 PM team time). After that a lead adds the time.
- A member can be clocked in to an open session and an event at once; hours use the union of intervals so nothing is double counted.
- Clock-out after the cutoff (before the sweep has run) closes the session at the cutoff and flags it, exactly as the sweep would.
- Event check-in opens 30 min before start and closes at the event end; event clock-out is allowed until end + grace, after which the sweep closes it.
- Code-verified events cannot be checked in offline (a queued code would be stale by the time it syncs). One-tap events and all clock-outs can be queued.
- Offline queue lives in IndexedDB (`src/lib/offline-queue.ts`) and syncs on `online`, on returning to the foreground, and on load. Background Sync from the service worker is added in the PWA phase. Each tap carries a client-generated action id; the server (`client_actions`) answers retries with the original result.
- Auto clock-out and event auto-close run in a recurring `attendance.sweep` job (every 60 s). It is idempotent: it only updates rows still `open`, and the member notice is deduped per session.
- Wrong check-in codes are rate limited per member and event (10 per 5 minutes).
- Backfill: events must have ended; open-session days must be past build-season days; no overlap with existing non-rejected time; max 16 hours; the member must have joined before the season ended. Approval-off entries count immediately and carry `self_reported`.
- Lead/admin edits mark an entry `edited` + `approved`. The "Who's here" list and force clock-out UI arrive with the admin dashboard phase; the underlying functions and audit logging are done and tested.
- Parents see a student's sessions and totals through `src/lib/parent-data.ts`, which always goes through `requireStudent` (reviewer notes are stripped).
- The check-in display shows a message instead of a code for one-tap events, and keeps the screen awake where supported.

## Phase 4

- `sharp` is added as an explicit dependency (Next already bundles it) to generate PWA icons from the team logo, or a font-free default clock glyph on the accent colour, at `/icons/*.png` (192, 512, maskable 512, apple-touch 180).
- The service worker (`public/sw.js`) caches only hashed build assets and icons (cache first) and a short allow-list of page navigations (`/`, calendar, my hours, parent home/calendar) with network first. It never caches `/api/*`. It is registered in production builds only, and cached pages are wiped when the browser reaches `/login`.
- Push permission is reported by the browser to `/api/push/state`, so the admin page can tell "permission denied" from "never enabled". A browser that is subscribed but unknown to the server re-registers itself.
- A push endpoint moves to whoever registered it last (shared devices), and a 404/410 disables the subscription instead of deleting it (so status can show "subscription expired").
- Reminders run from the `reminders.tick` job (every 60 s). Daily clock-in reminder window: from the reminder time for 2 hours (never after the auto clock-out). Event check-in prompt window: 20 minutes from start. Event reminders and prompts follow the event, so they are not restricted to build workdays; the daily and clock-out reminders are.
- Clock-out reminder targets open build-season clock-ins only (event sessions have their own end-of-event prompt) and ignores `member_days` (being clocked in already shows they came).
- Reminder types never write an in-app inbox row (they would only be noise there). Event changes, requests and decisions do.
- VAPID subject is `APP_URL`.
- iOS: notification permission is only requested from the Home Screen install; in a Safari tab the panel and banner show the Add to Home Screen steps.

## Phase 5

- Leads get Overview, Needs review (attendance), Who's here and Roster (with add time, edit times, force clock-out). Admins additionally get People, Season, Notifications, Exports, Audit log and Settings. Emails are shown to admins only (the roster and member page hide them from leads).
- CSV exports: hours per member, attendance per session, RSVPs per event, audit log (admin only, each download audited as `export.*`), plus `my-hours` for the signed-in member. Files start with a UTF-8 BOM and use CRLF; text cells starting with `= + - @ TAB CR` get a leading apostrophe. Exports are rate limited (30 per 10 minutes).
- Audit entries scrub keys that look like credentials (`password`, `token`, `secret`, `hash`, `key`), and a settings save that changes nothing writes no entry.
- Settings validate reminder order: clock-in reminder < clock-out reminder < automatic clock-out.
- Auto clock-out time and reminder times are edited on separate forms so each save validates against the saved value of the other.
- "Who's here" and the overview refresh themselves (30 s / 60 s) while the tab is visible.
