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
- `src/routes/` — the HTTP surface: auth, member profiles, workout logs,
  workout sessions, and RBAC-guarded example routes.
- `docs/artifacts/` — every original design/spec/code artifact, preserved
  verbatim, that this backend was consolidated from.

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
