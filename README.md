# FitFlow-App

All-in-one fitness, lifestyle, mobile-phone, and smartwatch app.

## Backend API

A TypeScript/Express/Prisma/PostgreSQL API lives at the repo root:

- `prisma/schema.prisma` — the canonical data model (see
  `docs/architecture/canonical-schema-decisions.md` for how it reconciles
  three previously-incompatible schema drafts).
- `src/auth/`, `src/rbac/` — JWT authentication, role-based access
  control, and refresh-token rotation with reuse detection.
- `src/repositories/`, `src/validation/`, `src/middleware/` — the
  repository pattern and Zod request validation.
- `src/routes/` — the full HTTP surface (see `openapi/openapi.yaml`),
  covering essentially every model in the canonical schema:
  - **Identity & auth**: register/login/refresh/logout, `GET /v1/users/me`
    (the caller's own id/email/roles — roles are never in the JWT itself,
    see token.service.ts), member profile read/update, admin user
    deletion.
  - **Extended profile**: app preferences, health/nutrition targets,
    allergies, medical notes (self/ADMIN only).
  - **Training**: the exercise catalog, coach/AI-authored workout plan
    templates, single-shot ad-hoc workout logging (with a real
    find-or-create Exercise lookup and full session→exercise→set write),
    and a live workout-session flow — start (optionally from a plan
    template), add exercises, log each completed set as you go, then
    complete or cancel — sharing the same WorkoutSession table as the
    ad-hoc log.
  - **Nutrition**: meal plans, grocery plans (with a server-computed
    estimated total), and ad-hoc nutrition logs.
  - **Coaching**: coach↔client assignments, both directions.
  - **Gyms**: the gym catalog and check-ins (verified check-ins earn
    points and advance a streak; unverifiable manual ones don't).
  - **Progress**: streaks, gamification (badges/achievements — always
    system-awarded, never client-authored), and daily wearable sync.
- `openapi/openapi.yaml` — the spec for everything above, validated with
  `@apidevtools/swagger-parser` after every change.
- `docs/artifacts/` — every original design/spec/code artifact, preserved
  verbatim, that this backend was consolidated from.
- `src/lib/cors.ts` — the browser-origin allowlist (`CORS_ALLOWED_ORIGINS`)
  backing the web dashboard below; every non-browser client (mobile apps,
  curl, server-to-server) is unaffected by it either way.

Every list/create/update/delete endpoint scoped to a member follows the
same rule: a plain user can only ever act on their own rows; ADMIN can
act on anyone's; COACH can act on their own and, where it makes product
sense (viewing logs, listing/reading clients' data), on their *actual*
clients' — enforced by checking for an active `CoachAssignment` row
(`src/rbac/member-scope.ts`), not just the COACH role, so a coach with no
assignment to a member has no more access than a stranger. Becoming a
client's coach requires the client's consent, not just the coach's
say-so: `POST /v1/coach/assignments` creates a COACH-initiated
assignment as `pending`, and only the client (or an ADMIN) can PATCH it
to `active` — a coach can never self-activate their own request, or
they could otherwise grant themselves access to any member by simply
naming them. Writes to another member's preferences, health targets, or
wearable data are ADMIN-only even for their coach. A resource id that
exists but isn't the caller's returns 404, never 403 — existence is
never disclosed to a caller with no relationship to it.

Every route above (and the schema/migration/seed/Docker pieces below) has
been exercised against a real running Postgres instance — not just the
mocked Jest suite — including a full fresh-registration walkthrough that
hits every GET endpoint in the API.

### Running locally

```bash
cp .env.example .env   # fill in JWT_ACCESS_SECRET and REFRESH_TOKEN_PEPPER
npm ci
npm run prisma:generate
docker compose up -d postgres
npm run prisma:migrate:dev
npm run seed
npm run dev
```

### Running the full stack (API + Postgres + dashboard) in Docker

```bash
docker compose up --build
```

Brings up Postgres, the API (`http://localhost:3000`), and the web
dashboard (`http://localhost:8080`) together, already pointed at each
other (`CORS_ALLOWED_ORIGINS` / `VITE_API_BASE_URL` in
`docker-compose.yml`).

### Tests

```bash
npm test
```

## Web Dashboard

`web/` is a separate React + TypeScript + Vite app — the admin/coach
management UI for this API (member directory, gym and exercise catalog
management, a coach's client roster and public profile). See
`web/README.md` for what it covers, its auth model, and how to run or
build it; it's a distinct `npm` project with its own dependencies and
CI job, not part of the backend's `npm` workspace. Day-to-day logging
(workouts, meals, etc.) is left to a mobile client — see that README for
why.
