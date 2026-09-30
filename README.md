# Command

A self-hostable team management app for FRC-style robotics teams. Members clock in and out of events and daily build
season sessions, see a calendar, RSVP, and get push notifications on their phones. Admins see who is here, review
attendance and export data. One deployment is one team, and any team can run its own copy on its own server.

> **NOTICE: this is not an open source project.** See [Notice](#notice) and [LICENSE](LICENSE).

- Installable PWA with web push (Android, and iPhone via Home Screen), offline clock-in queue
- Roles: Member, Lead, Admin, and read-only Parent
- Calendar with RSVPs, rotating-code check-in display, backfill with approval, auto clock-out
- Shift sign-ups on any event (see [Sign-ups](#sign-ups)): capacity, waitlist, member-only or parent-only shifts, groups with priority access, reminders, and a private calendar link
- Season-based leaderboard (switch it off with an env var), CSV exports, audit log
- Google sign-in (optional) plus email and password; team-set allowed email domains are auto-approved
- Google Calendar: ICS import, or API push from Command with past-event import

## Quick start

You need Docker with Compose, a domain, and HTTPS (see [HTTPS](#https)); PWA install and push notifications don't
work without it.

```bash
git clone <your copy> command && cd command
cp .env.example .env        # set at least POSTGRES_PASSWORD and APP_URL
docker compose up -d --build
docker compose logs app     # look for the one-time SETUP TOKEN
```

Open `APP_URL/setup`, enter the token from the logs, and follow the wizard (admin account, team details, timezone,
optional allowed email domains, accent colour and logo, optional email test, then the license notice). After it
finishes, `/setup` no longer exists. The token is printed on every start until setup completes, and you can set
your own with `SETUP_TOKEN`.

VAPID keys (push), the session secret and the install ID are generated for you and stored in the database. There
are no key-generation commands to run.

### Configuration

Everything is in `.env` (see `.env.example`, which documents every variable):

| Variable | What it does |
|---|---|
| `DATABASE_URL`, `POSTGRES_PASSWORD` | Set by Docker Compose. Change the password. |
| `APP_URL` | Public URL. Must be `https://` in production. |
| `TZ` | Server timezone (the team timezone is set in the wizard). |
| `LEADERBOARD_ENABLED` | `false` hides the leaderboard everywhere, including navigation. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Enables Google sign-in. |
| `SMTP_*` | Enables email confirmation, password reset links and decision emails. |
| `GOOGLE_CALENDAR_MODE`, `GOOGLE_CALENDAR_ICS_URL`, `GOOGLE_CALENDAR_ID`, `GOOGLE_SERVICE_ACCOUNT_JSON` | Google Calendar (below). |
| `SETUP_TOKEN` | Optional override for the one-time setup token. |
| `ICS_ALLOW_PRIVATE_NETWORKS` | Advanced: let the ICS address point at your LAN. |

### HTTPS

Put a reverse proxy in front of the app. With Caddy (automatic certificates):

```caddyfile
command.example.com {
    encode gzip
    reverse_proxy 127.0.0.1:3000
}
```

Set `APP_URL=https://command.example.com`, and change the compose port mapping to `127.0.0.1:3000:3000` so only the
proxy can reach the app. With Nginx, use `proxy_pass http://127.0.0.1:3000;` and
`proxy_set_header X-Forwarded-For $remote_addr;` (per-IP sign-in limits read that header).

## Google sign-in (optional, recommended)

1. In Google Cloud Console, create an **OAuth client ID** of type *Web application*.
2. Authorized redirect URI: `https://YOUR-APP-URL/auth/google/callback`.
3. Put the client ID and secret in `.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, then `docker compose up -d`.

Only Google accounts with a **verified email** are trusted, and approval is by the email's domain (an exact match
against the allowed domains you set in Settings). People on other domains, and everyone who signs up with a
password when email isn't set up, wait for an admin to approve them.

## Google Calendar

Set `GOOGLE_CALENDAR_MODE` to one of:

**`ics`** (simple, read-only): Command reads your calendar every 10 minutes.
1. In Google Calendar: Settings → your calendar → *Integrate calendar* → **Secret address in iCal format**. Copy it.
2. Admin → Settings → Google Calendar: paste it and use **Test connection**, then **Sync now**.
Recurring events become individual occurrences (from 2 months back to 6 months ahead) and are updated or cancelled
when the calendar changes. Imported events are read-only in Command except for how members check in.

**`api`** (Command is the source of truth): events you create, edit or cancel in Command are pushed to Google Calendar.
1. In Google Cloud Console, enable the **Google Calendar API**, create a **service account**, and download its JSON key.
2. Share your Google Calendar with the service account's email address, with **Make changes to events**.
3. Set `GOOGLE_SERVICE_ACCOUNT_JSON` (the whole key on one line) and `GOOGLE_CALENDAR_ID` in `.env`.
4. Admin → Settings → Google Calendar shows the email to share with, has **Test connection**, and an **Import past
events** tool (choose a date range) so members can add attendance for things that happened before Command.
Changes made directly in Google Calendar after import are not synced back.

## Sign-ups

Any event can have a sign-up sheet of shifts (pit crew, scouting, a booth, snacks). It is for people with accounts:
members, leads, admins and approved parents. There is no public link.

- **Leads and admins** add a sheet from the event page, then add shifts: a name, a time range, how many people are needed, and
  who may sign up (members and parents, members only, or parents only). **Manage sign-ups** on the event places or removes
  people, adds a whole group at once, shows who hasn't signed up and reminds them (once a day).
- **Waitlist**: when a shift is full people can queue. If someone leaves, or a lead adds places, the next person in line gets the
  place and a notification.
- **Groups** (Admin, then Groups) are named sets of people, like "Super scouts". A shift can be reserved for a group for good, or
  give a group first pick until a time you choose, after which it opens to everyone.
- Nobody can hold two overlapping shifts on one sheet. Members can leave a shift until it starts; after that a lead has to.
- **Reminders** go out a day and an hour before a shift, and everyone else is told when a group's priority window ends. Each type can
  be switched off per person under Notifications.
- **My shifts** (under Me, or Parent, then My shifts) lists what you hold and what you could still take, and makes a **private calendar
  link** you can subscribe to from Google, Apple or Outlook calendar. The link is a secret: it is shown once, can be replaced (the old
  one stops working immediately) or turned off, and shows only that person's shifts.
- Admins can download every sign-up as a CSV under Exports.

Sign-up jobs (reminders, "now open" notices) run in the same in-app scheduler as the other reminders, so there is nothing extra to
configure. They pause while the instance is read-only.

## Backups

All data is in Postgres (plus the uploaded logo in the `command_data` volume):

```bash
docker compose exec -T db pg_dump -U command command | gzip > command-$(date +%F).sql.gz
# restore
gunzip -c command-2026-01-01.sql.gz | docker compose exec -T db psql -U command command
```

## Upgrading

```bash
git pull            # or copy the new version over
docker compose up -d --build
```

Database migrations run automatically at start-up. Take a backup first. Read the release notes for any change to
`.env.example`.

## License check and registry

Command is a proprietary, source-available product, and running it is conditional on a **required, disclosed** check-in
with its owner's registry. This is stated in the [LICENSE](LICENSE), shown in the setup wizard, listed in Settings (with
the exact fields), and described here. All of the code for it lives in **`src/lib/registry/`**:

- **What is sent** (when the app is set up, at each start-up, and about every 24 hours): a random install ID, the Command
  version, your team name, team number and region, the number of *active members* (a number), a fingerprint of the
  license-check files, a random one-time code and the time. **Never** names, emails, hours, attendance or member lists.
  The registry keeps a salted one-way hash of your server's IP address for at most 30 days, only to detect misuse.
- **Trust:** responses are signed (Ed25519, keys embedded in `src/lib/registry/config.ts`) and echo a per-request one-time
  code, so forged or replayed responses are never believed.
- **If it can't check in:** after 24 hours without a success, admins are warned (push, in-app and email, with a daily
  reminder and an urgent one with 48 hours left). After **7 days** of failed attempts the instance becomes **read-only**:
  everyone can still view their data, **CSV export always works**, but nobody can clock in or out or change anything. The
  next successful check-in restores normal operation by itself. A registry outage, network errors and clock problems never
  count as tampering and can't stop an instance early.
- **Owner actions:** the owner can revoke an installation. Admins see the owner's message and a countdown (default 7 days),
  then it goes read-only like above (export still works); the owner can restore it any time.
- **Integrity:** a manifest of hashes of the files in `src/lib/registry/` is written at build time. If the files on disk
  differ from it at two start-ups at least an hour apart, or a verified registry response says so, the instance goes
  read-only with a calm notice explaining what was detected. A *missing* manifest (for example a copy that wasn't built as a
  release) is not treated as tampering: admins are told, and it is reported in the next check-in.

Be clear about what this is: a license-compliance mechanism, not copy protection. It cannot make a source-available app
unmodifiable, and the license is the real protection.

The registry server itself is a separate app in its own private repository (`command-registry`) that only the owner runs. It is
not part of this repository or the image teams install.

## Notice

Plain-language summary of [LICENSE](LICENSE) (the license is what counts):

**You can:** read the source; run Command on servers you control for your own team, for free; modify your own copy for your
own team's use, if you keep it private; send issues and pull requests to the official repository.

**You can't** (without written permission from Alex Radu): publish, share, sell or host copies or modified versions
anywhere (including public forks and mirrors); run it for other teams or as a service; copy its design or functionality
into another product; use its name or branding; or remove, disable or bypass the registration and heartbeat, or remove a
license notice.

**What the heartbeat sends:** only what is listed above: an install ID, version, team name, number, region and how many
active members you have. No personal information about individuals.

**This is not an open source project.** Contributions you submit become the property of the owner (LICENSE section 4). To
ask for a commercial license or special permission, contact alex@alexradu.co. Have a lawyer review the license before
relying on it.

The in-app [Terms of Service](src/lib/legal/terms.ts) and [Privacy Policy](src/lib/legal/privacy.ts) are served at `/terms`
and `/privacy`. They describe what the app really does, are updated with any change to data handling, and are not legal advice.

## Development

```bash
npm install
docker run -d --name command-dev-pg -p 54329:5432 -e POSTGRES_USER=command -e POSTGRES_PASSWORD=command -e POSTGRES_DB=command postgres:17-alpine
export TEST_DATABASE_URL=postgres://command:command@localhost:54329/command
export DATABASE_URL=$TEST_DATABASE_URL
npm run dev            # http://localhost:3000 (prints a setup token)
npm run ci             # typecheck, lint, unit + integration tests
npm run build && npm run test:e2e            # Playwright: setup, sign-in, clock in/out, approvals, parents, exports, a11y...
npm run test:e2e:registry                    # owner only: needs a checkout of command-registry next to this folder (or REGISTRY_DIR=...)
```

Without `TEST_DATABASE_URL` the database-backed tests are skipped (not faked). Layout: `src/app` (routes), `src/lib`
(logic, tested), `src/components`, `src/db` (schema; SQL migrations in `drizzle/`), `src/lib/registry` (the license check),
`src/lib/legal` (Terms and Privacy), `src/integrations/scorecard` (deferred), `e2e/`.

Decisions taken where the brief was silent are in `DECISIONS.md`.
