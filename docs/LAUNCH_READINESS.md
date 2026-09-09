# Launch readiness

A snapshot for whoever picks this project up next: what's built, how to
stand it up, and what's been deliberately left for a human decision
rather than fixed unilaterally. Not a replacement for the root
`README.md` / `web/README.md` (how to run things) or
`docs/architecture/canonical-schema-decisions.md` (why the data model
looks the way it does) — this is the "what's the state of things"
summary those don't give you.

## What's built

- **API**: Express 5 + Prisma 6 + PostgreSQL 16, JWT access tokens +
  rotating opaque refresh tokens with reuse detection, Zod-validated
  request bodies throughout, a repository pattern separating routes from
  Prisma calls. 54 documented paths (`openapi/openapi.yaml`, kept
  synced and `swagger-cli`-validated on every change) covering identity,
  member/coach profiles, training (exercise catalog, workout plans,
  ad-hoc logs, a live workout-session flow), nutrition (meal/grocery
  plans, nutrition logs), coaching relationships, gyms/check-ins,
  streaks, and gamification (badges/achievements).
- **Dashboard** (`web/`): React 18 + TypeScript + Vite, the
  admin/coach-facing management UI — member directory and role
  management, gym and exercise catalog CRUD, a coach's client roster
  and public profile, every member's own goals/streaks overview and
  read-only workout/nutrition log history. Day-to-day log *entry* is
  intentionally left to a (not-yet-built) mobile client — see
  `web/README.md` for why.
- **Tests**: 287 Jest unit/integration tests (mocked Prisma) on the API,
  8 Playwright E2E specs on the dashboard run against a real
  Postgres + API + built dashboard (`web/e2e/`). CI (`.github/workflows/ci.yml`)
  runs both, plus a real `prisma migrate deploy` against a throwaway
  Postgres to prove the migration history applies cleanly, on every
  push/PR.
- **Docker**: multi-stage `Dockerfile`s for both projects, wired
  together with Postgres in `docker-compose.yml` (`docker compose up
  --build` brings up all three).

## Before a real production deploy

None of this has been exercised against a real cloud environment
(managed Postgres, a real domain, TLS) — only local Docker and CI's
ephemeral Postgres service. Concretely still needed:

1. **Secrets**: generate real values for `JWT_ACCESS_SECRET` and
   `REFRESH_TOKEN_PEPPER` (`openssl rand -base64 48` each, per
   `.env.example`) — the app refuses to start without them, and CI's
   values are throwaway placeholders. Rotate them separately from any
   value that's ever touched a repo, CI log, or this session.
2. **CORS**: set `CORS_ALLOWED_ORIGINS` to the dashboard's real deployed
   origin(s) — the dev default (`http://localhost:5173`) obviously
   doesn't cover production.
3. **`VITE_API_BASE_URL`**: baked into the dashboard's JS bundle at
   *build* time (`web/README.md` covers this), not a runtime env var —
   confirm the Docker build arg is set to the real API's public URL
   before building the image that ships.
4. **Database**: point `DATABASE_URL` at real managed Postgres, run
   `prisma migrate deploy` (not `migrate dev`) against it, and decide on
   a backup/restore policy — nothing here does that for you.
5. **TLS/reverse proxy**: neither the API nor the dashboard's nginx
   config terminates TLS itself; both expect to sit behind a
   load balancer/reverse proxy that does.
6. **Rate limiting**: `src/rbac/rate-limit.middleware.ts` uses
   `express-rate-limit`'s default in-memory store — fine for a single
   API instance, but resets on every restart/deploy and doesn't
   coordinate across replicas. Move to a shared store (Redis) before
   running more than one API instance behind a load balancer.

## Known, deliberately deferred items

Each of these was found and consciously left rather than missed:

- **Gym check-in "verified" bonus is unverifiable in practice**
  (`src/routes/gym.routes.ts` — see the comment above
  `POINTS_PER_VERIFIED_CHECKIN`). The check-in `source` field is
  entirely self-reported by the client; there's no real QR-code or
  geofence infrastructure behind it yet. Awarding streak/points credit
  for it is a product decision this API implements but can't itself
  make trustworthy — needs real verification infra before it's launched
  as a trust-bearing feature rather than an honor-system one.
- **`WorkoutSessionExercise.sortOrder` isn't uniqueness-enforced**
  (`src/routes/workout-session.routes.ts`). Two exercises added to the
  same in-progress session in genuinely concurrent requests could tie
  for a display position. Accepted as a cosmetic edge case rather than
  adding transactional locking for a field that's purely a display
  hint, not an invariant.
- **`vite`/`esbuild` moderate/high `npm audit` finding** (a dev-server
  request-forwarding/path-traversal issue) — doesn't affect the built
  production bundle (a static file tree served by nginx), only `npm run
  dev` on a contributor's own machine. Real, but the fix is a Vite 5→8
  major-version bump with its own breaking changes (already true of the
  `react-router-dom` v6→v7 bump this project went through — see its
  commit for the verification approach that migration deserves too);
  do it as its own dedicated change with real regression testing rather
  than a drive-by version bump.

## Test coverage gaps, by design

`web/e2e/README.md` tracks this precisely — currently only the member
detail page (admin view of a single member) has no dedicated spec,
since it shares patterns (profile/goal rendering, role pills) already
exercised by other specs. Add one if it starts shipping real bugs the
shared pattern doesn't already catch.

## Where to look next

- `README.md` / `web/README.md` — how to run each project locally and
  in Docker.
- `docs/architecture/canonical-schema-decisions.md` — why the Prisma
  schema reconciles the way it does (this project's data model went
  through three incompatible drafts before landing here).
- `docs/artifacts/` — every original design/spec artifact this backend
  was consolidated from, preserved verbatim for reference.
- `openapi/openapi.yaml` — the full API contract.
