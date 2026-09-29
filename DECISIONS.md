# Decisions

One line each: what, why.

- Repo root is `/srv/md0/robotics/command` with no wrapper folder; `src/` and `registry/` sit at the root as the spec requires.
- `pg` (node-postgres) as the Drizzle driver: mature, supports dedicated connections needed for advisory locks.
- TypeScript pinned to 5.9 and ESLint to 9: best-supported by Next 16 and eslint-config-next; newer majors are not needed.
- `arctic` is marked deprecated on npm but the spec locks it; used as specified, isolated in `src/lib/auth/google.ts` so it is easy to swap.
- Vitest 3 rather than 5: stable with the current Vite toolchain.
- `nodemailer` 7 (10 is not published as a stable line for the types package).
- shadcn/ui components are hand-written in `src/components/ui` (Radix + cva) instead of running the interactive CLI, so the repo stays reproducible offline.
- Full data model (spec section 5) is created in the first migration so later phases only add columns.
- Extra tables beyond the spec: `auth_tokens` (email verify, password reset), `rate_limits`, `in_app_notifications` (spec asks for in-app notices).
- Migrations run in `instrumentation.ts` guarded by a Postgres advisory lock.
- Docker healthcheck hits `/api/health` (DB round trip, no team data).
