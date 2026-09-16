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

## A flake that used to live here, now fixed

`coaching-flow.spec.ts` used to fail intermittently (roughly 15-30% of
runs under repeated local hunting) on its *second* account switch: the
member signs out, the coach signs back in, and `login()`'s
`page.waitForURL('/')` would time out stuck on the member's last page
instead. It looked like CI-runner timing noise at first, since isolated
single runs passed reliably and a retry always cleared it — but that
was a red herring; `--repeat-each` with enough samples reproduced it
locally every time.

Root cause: `page.goto('/login')` (used by every `login()` call in
`support.ts`) is a no-op when the browser is already on `/login`, which
is exactly where a just-signed-out user lands. Because it's a no-op, it
doesn't reset `history.state` on that history entry — so
`RequireAuth`'s `<Navigate to="/login" state={{from: location}}>`
redirect, fired for the *first* account's sign-out, could still be
sitting on that entry's state when a *second, unrelated* account logged
in on the same tab and got silently redirected back to wherever the
first account had been, instead of `/`.

Fixed in `AuthContext`/`RequireAuth` by distinguishing "redirected to
/login because of an explicit sign-out" (no `from` state — there's
nothing meaningful to return to) from "redirected there because an
unauthenticated visit hit a protected URL" (keep `from`, so login
returns the visitor to their original destination). Verified with a
30-repeat, 2-worker run of `coaching-flow.spec.ts` after the fix:
30/30 passed, versus a 3/20 failure rate on the same setup beforehand.

`playwright.config.ts`'s `retries: process.env.CI ? 1 : 0` remains in
place as a legitimate safety net for genuine CI-runner noise, but
should no longer be needed to get this spec green.

## What's covered, and what isn't

Login/logout, role-based navigation visibility, admin gym and exercise
catalog CRUD, the full coach-request → client-accept relationship flow
(spanning two separate logged-in sessions, which no single-component
test can catch a mismatch in), a coach's public profile and specialty
list, member profile/goal self-service, admin role grant/revoke, and
the workout/nutrition log history views (seeded via direct API calls,
since day-to-day log entry is a mobile-client flow — see
`web/README.md`). Not covered: member detail page (shares the same
profile/goal-rendering and role-pill patterns already exercised
elsewhere) — add a spec for it if it starts shipping real bugs the
pattern doesn't already catch.
