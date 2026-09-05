# End-to-end tests

Real browser tests against a real running API + Postgres + this
dashboard's dev server — no mocking. These are what actually verified
this dashboard while it was built (replacing a set of one-off manual
scripts with a permanent, repeatable suite).

## Prerequisites

1. Postgres running with migrations applied (`npm run prisma:migrate:dev`
   in the API project) and the demo seed loaded (`npm run seed`) — the
   auth/nav specs log in as the seeded `admin@fitflow.example` /
   `coach@fitflow.example` / `member@fitflow.example` accounts.
2. The API running (`npm run dev` in the API project), reachable at
   `E2E_API_BASE_URL` (default `http://localhost:3000`).
3. `DATABASE_URL` set in this shell to the **same** database the API is
   using — the coaching-flow spec needs to grant a fresh test account
   the COACH role directly (see `e2e/support.ts`'s `grantCoachRole`),
   since there's deliberately no API path to self-assign a role.
4. This dashboard's dev server running (`npm run dev`, default
   `http://localhost:5173`) or reachable at `E2E_BASE_URL`.

## Running

```bash
DATABASE_URL=postgresql://fitflow:fitflow_dev_password@localhost:5432/fitflow?schema=public \
  npm run test:e2e
```

`npm run test:e2e:ui` opens Playwright's UI mode for debugging a
failing spec interactively.

## What's covered, and what isn't

Login/logout, role-based navigation visibility, admin gym CRUD, the
full coach-request → client-accept relationship flow (spanning two
separate logged-in sessions, which no single-component test can catch
a mismatch in), and member profile/goal self-service. Not covered:
every CRUD screen (exercises, member detail, coach profile/specialties)
— those share the same patterns already exercised above and are lower
value to duplicate here; add a spec for one if it starts shipping real
bugs the pattern doesn't already catch.
