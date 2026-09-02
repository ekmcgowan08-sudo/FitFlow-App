# FitFlow Suite — API Security Audit & RBAC Module

Deliverables for FitFlow Suite's Express + Prisma + TypeScript backend:

1. **Security audit** of the authentication middleware and a representative API route file — see [`SECURITY_AUDIT_REPORT.md`](./SECURITY_AUDIT_REPORT.md) for all findings and code-level remediations. The audited "before" code lives in [`before/`](./before), the fixed "after" code lives in [`after/`](./after).
2. **RBAC middleware module** — see [`rbac/`](./rbac) for the implementation and [`docs/RBAC_GUIDE.md`](./docs/RBAC_GUIDE.md) for how to apply it to specific endpoints.
3. **OpenAPI 3 spec** for every implemented endpoint — [`openapi/openapi.yaml`](./openapi/openapi.yaml).
4. **Refresh token rotation** built on the `RefreshToken` Prisma model, with reuse detection — [`rbac/token.service.ts`](./rbac/token.service.ts), wired into [`after/auth.routes.ts`](./after/auth.routes.ts).
5. **Rate limiting** on `/auth/login`, `/auth/refresh`, and `/auth/register` — [`rbac/rate-limit.middleware.ts`](./rbac/rate-limit.middleware.ts).
6. **Unit tests** for the token service, auth routes, and the RBAC middleware/decorator (51 tests, Jest + Supertest + a manual Prisma mock) — [`tests/`](./tests).
7. **Docker Compose** setup for local Postgres + the API — [`docker-compose.yml`](./docker-compose.yml), [`Dockerfile`](./Dockerfile).
8. **curl examples** for register/login/refresh/logout, captured from a real live run — [`docs/API_EXAMPLES.md`](./docs/API_EXAMPLES.md).
9. **Real Prisma migrations** (not `db push`) — [`prisma/migrations/`](./prisma/migrations), applied via `prisma migrate deploy`.
10. **CI** on every push/PR: type-check, unit tests, migrations against a real Postgres, and a production build — [`.github/workflows/ci.yml`](./.github/workflows/ci.yml).

## Run it with Docker (fastest path)

```bash
docker compose up --build
```

This starts a `postgres:16-alpine` container, applies every committed
migration under [`prisma/migrations/`](./prisma/migrations) via
`prisma migrate deploy`, and starts the API on
[http://localhost:3000](http://localhost:3000). Try `curl http://localhost:3000/healthz`
once it's up, then walk through [`docs/API_EXAMPLES.md`](./docs/API_EXAMPLES.md).

The compose file ships with development-only secrets for `JWT_ACCESS_SECRET`
and `REFRESH_TOKEN_PEPPER` — replace both before using this outside a local demo.

## Run the tests

```bash
npm install
npx jest
```

All 51 tests run against a manual Prisma mock (`__mocks__/@prisma/client.ts`)
— no real database needed for the test suite. This is exactly what
[`.github/workflows/ci.yml`](./.github/workflows/ci.yml) runs on every
push/PR, plus a real-Postgres check that `prisma migrate deploy` applies
cleanly and a full `tsc`/build pass.

## Making a schema change

Edit [`prisma/schema.prisma`](./prisma/schema.prisma), then generate a new
migration against a local Postgres instance:

```bash
npx prisma migrate dev --name <describe_the_change> --schema prisma/schema.prisma
```

This writes a new folder under `prisma/migrations/` — commit it. Never
edit an already-committed migration's `migration.sql`; add a new migration
instead. `prisma migrate deploy` (used by Docker Compose and CI) only
applies migrations already committed here — it will never generate or
infer schema changes on its own.

## Run it without Docker

```bash
npm install express jsonwebtoken @prisma/client bcryptjs express-rate-limit reflect-metadata
npm install -D prisma typescript @types/express @types/jsonwebtoken @types/bcryptjs jest ts-jest @types/jest supertest @types/supertest
npx prisma generate --schema prisma/schema.prisma
npx prisma migrate deploy --schema prisma/schema.prisma   # applies prisma/migrations/ against your own Postgres
npm run build && npm start                                 # or: npx ts-node server.ts
```

Required environment variables:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/fitflow?schema=public"
JWT_ACCESS_SECRET="<32+ byte random secret>"
REFRESH_TOKEN_PEPPER="<32+ byte random secret, distinct from JWT_ACCESS_SECRET>"
JWT_ISSUER="fitflow-suite"
JWT_AUDIENCE="fitflow-suite-api"
# Optional overrides:
ACCESS_TOKEN_TTL_SECONDS=900
REFRESH_TOKEN_TTL_DAYS=30
```

Wire it up:

```ts
import express from "express";
import { authenticate } from "./after/auth.middleware";
import authRoutes from "./after/auth.routes";
import userRoutes from "./after/user.routes";
import exampleRoutes from "./rbac/example.routes";
import { rbacErrorHandler } from "./rbac/errors";

const app = express();
app.use(express.json());
app.use("/v1", authRoutes); // register/login/refresh/logout — no auth required
app.use("/v1", userRoutes);
app.use("/v1", exampleRoutes);
app.use(rbacErrorHandler); // last
```

The full contract for every route above — including request/response
schemas, required roles (`x-required-roles`), and rate-limit responses —
is in [`openapi/openapi.yaml`](./openapi/openapi.yaml). Preview it with:

```bash
npx @redocly/cli preview-docs openapi/openapi.yaml
```

## Folder map

| Path | Purpose |
|---|---|
| `SECURITY_AUDIT_REPORT.md` | Full audit: 14 findings across JWT handling, Prisma query scoping, HTTP status codes, and TS interface integrity, each with a before/after code snippet |
| `prisma/schema.prisma` | Identity/roles slice of the FitFlow Suite data model the middleware depends on |
| `before/` | Reference implementation showing the audited vulnerabilities |
| `after/` | Remediated versions of the same files |
| `rbac/` | The RBAC module: types, errors, HOF middleware, decorator variant, rate limiters, token rotation service, worked examples |
| `after/auth.routes.ts` | Register/login/refresh/logout, using the rotation service and rate limiters |
| `openapi/openapi.yaml` | OpenAPI 3 spec for every implemented endpoint |
| `docs/RBAC_GUIDE.md` | How to apply the RBAC module to specific FitFlow Suite endpoints, plus a testing checklist |
| `docs/REFRESH_TOKEN_ROTATION.md` | How rotation, reuse detection, and rate limiting work end to end |
| `docs/API_EXAMPLES.md` | curl request/response examples for register/login/refresh/logout, captured live |
| `tests/` | Jest unit tests for `token.service.ts`, `auth.routes.ts`, `rbac.middleware.ts`, `rbac.decorator.ts`, and the rate limiters (51 tests) |
| `.github/workflows/ci.yml` | GitHub Actions: type-check → unit tests → migrate deploy against real Postgres → build, on every push/PR |
| `__mocks__/@prisma/client.ts` | Manual Jest mock so tests run without a real database |
| `app.ts` / `server.ts` | Express app factory (used by tests) and the process entrypoint (`npm start`) |
| `docker-compose.yml` / `Dockerfile` | Local Postgres + API, one command (`docker compose up --build`) |
| `prisma/migrations/` | Committed, reviewable SQL migrations (`prisma migrate deploy` applies these; no schema drift or auto-inferred changes in production) |
