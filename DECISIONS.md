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
