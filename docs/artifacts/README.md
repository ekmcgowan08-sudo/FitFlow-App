# FitFlow Artifact Archive

This tree preserves every FitFlow design/spec/code artifact recovered so far, exactly
as received, before any reconciliation work happens. Nothing here has been modified
except being renamed out of upload-export naming (`README (2).md`, `Fitflow Suite.md`,
etc.) into a descriptive path. Byte-for-byte duplicates across the original uploads
were collapsed to a single copy; every distinct document was kept.

## Layout

- `product/` — PRD, ERD, hybrid brief, and the two build-pack revisions (v2 scope
  additions, and the fuller "technical build pack").
- `database/` — the real migration history: `migrations/V001`–`V010` (core identity
  through constraints/seeds/views), a flattened `fitflow-schema.sql`, and migration
  notes for V006–V010.
- `prisma/` — **three schemas that do not agree with each other** (see
  "Known conflicts" below):
  - `product-schema.prisma` — the broad, `Member`-centric model matching the SQL
    migrations (nutrition, training, calendar, gym billing, gamification, dashboard).
  - `security-module-schema.prisma` — a narrow `User`/roles/refresh-token identity
    slice from the security audit's nested project.
  - The repository-pattern package (`repository-pattern/`) implies a *third* shape
    (`User`/`UserProfile`/`Goal`/`WorkoutSet`/`Streak`) in its TypeScript and docs,
    but ships no `.prisma` file of its own.
- `openapi/` — two independent specs, not duplicates:
  - `product-api.yaml` — OpenAPI 3.1 spec for the full product surface (members,
    goals, nutrition, meal plans, workouts, gym check-ins, achievements, wearables).
  - `security-module-api.yaml` — OpenAPI 3.0.3 spec scoped to the 13 auth/RBAC/
    workout-session routes implemented in the security module.
- `security-module/fitflow-api-security/` — the full nested Express/Prisma project
  from the security audit: JWT auth, RBAC guards/decorator, refresh-token rotation,
  rate limiting, before/after routes, Dockerfile/Compose, GitHub Actions CI, one
  committed Prisma migration, and 5 Jest test files (51 declared test cases, not
  re-run in this environment yet).
- `repository-pattern/` — the generic base repository, member/workout repositories,
  Zod v4 global error map, sync/async validation middleware, profile/workout Zod
  schemas, domain errors, a Prisma client singleton, and illustrative example routes.
- `docs/` — standalone copies of the security audit report, RBAC module guide,
  refresh-token/rate-limit guide, and curl examples (also embedded in
  `security-module/fitflow-api-security/docs/` and `SECURITY_AUDIT_REPORT.md`).
- `route-examples/` — early Prisma-starter route/middleware sketches that predate
  the repository-pattern package: one set built directly against the broad schema
  (`routes-broad-schema-example.ts`), one built against the validation middleware
  (`routes-validated-example.ts`), plus their READMEs.
- `seed/` — seed data (JSON) and seed/client scripts for the broad schema.
- `prototypes/` — HTML/PPTX pitch and demo assets (`fitflow-pro.html`,
  `fitflow-suite.html`, `fitflow-suite-pitch.html/.pptx`). These are design/demo
  artifacts, not a production mobile/watch implementation.

## Known conflicts (must be resolved before this is one app)

1. **Three incompatible identity/workout-log models.** The broad schema uses
   `Member`, `MemberPreference`, `MemberHealthProfile`, `MemberStreak`, and
   plan-template `WorkoutSession` rows. The repository-pattern package expects
   `User`, `UserProfile`, `Goal`, `WorkoutSet`, `Streak`, and user-owned workout
   sessions. The security module ships a third, narrower `User`/roles/refresh-token
   schema slice. None of these are drop-in compatible today.
2. **Two OpenAPI specs cover non-overlapping surfaces** and will need to be merged
   once the schema is unified.
3. **The repository-pattern example routes are illustrative, not finished:**
   workout-log pagination doesn't advance a cursor, an omitted `memberId` becomes an
   empty-string lookup, and the route creates only a session rather than the full
   exercise/sets log its own validation contract implies.
4. **Runtime claims are unverified in this archive.** The security module declares
   51 passing Jest tests and a working `npm ci` / Prisma migrate / Docker Compose
   flow, but those haven't been re-run here yet — treat them as historical until
   reproduced.

See task tracking in this repository for the plan to reconcile these into one
canonical schema and a single running backend.
