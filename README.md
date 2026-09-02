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
- `src/routes/` — the HTTP surface: auth, member profiles, workout logs
  and sessions, goals, streaks, nutrition logs, coach assignments, gyms
  and check-ins, admin user management, and RBAC-guarded example routes.
- `openapi/openapi.yaml` — the spec for everything above, validated with
  `@apidevtools/swagger-parser`.
- `docs/artifacts/` — every original design/spec/code artifact, preserved
  verbatim, that this backend was consolidated from.

Every list/create/update/delete endpoint scoped to a member (goals,
nutrition logs, workout logs, gym check-ins) follows the same rule: a
plain user can only ever act on their own rows; ADMIN can act on anyone's;
COACH can act on their own and, where it makes product sense (viewing
logs, listing clients), on their clients'. A resource id that exists but
isn't the caller's returns 404, never 403 — existence is never disclosed
to a caller with no relationship to it.

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

### Running the full stack (API + Postgres) in Docker

```bash
docker compose up --build
```

### Tests

```bash
npm test
```
