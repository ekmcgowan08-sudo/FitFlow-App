# FitFlow Dashboard

A React + TypeScript + Vite web dashboard for the FitFlow API (`../`).
Talks to the API over plain `fetch` — see `src/api/`.

## Who it's for

Three roles exist in the API (`USER`, `COACH`, `ADMIN`); this dashboard
covers the management-style workflows those roles actually need:

- **Every signed-in account**: an overview of their own streaks and
  active goals (`/`).
- **COACH**: their client roster and pending/active coaching requests
  (`/coach/clients`), and their own public coach-directory listing
  (`/coach/profile`).
- **ADMIN**: the full member directory (`/admin/members`), and the gym
  and exercise catalogs (`/admin/gyms`, `/admin/exercises`).

Day-to-day logging (workouts, nutrition, meal/grocery plans) is left to
a mobile client — those flows are built for quick, frequent, on-the-go
entry, which a desktop-oriented dashboard isn't the right shape for.

## Running locally

```bash
npm install
cp .env.example .env   # point VITE_API_BASE_URL at your running API
npm run dev             # http://localhost:5173
```

The API must have this dashboard's origin in its own
`CORS_ALLOWED_ORIGINS` (see `../.env.example`) — `http://localhost:5173`
is the default on both sides, so a fresh checkout of both projects works
together with no config changes.

## Auth model

Bearer tokens (access + refresh), matching the API's design — there is
no cookie/session support to build a cookie-based flow against. Tokens
live in `localStorage`; `src/api/session.ts` documents the tradeoff
(XSS-readable, bounded by the API's own 15-minute access-token TTL and
single-use refresh-token rotation with reuse detection) in detail. A
401 triggers one transparent refresh-and-retry (`src/api/client.ts`)
before falling back to `/login`.

Roles aren't in the JWT (deliberately, on the API side — see
`GET /v1/users/me`'s doc comment in `src/routes/user.routes.ts`), so
`AuthContext` fetches them once via that endpoint after login and after
a reload, and gates navigation/routes on them (`RequireRole`). This is
a UX convenience, not the authorization boundary — every request is
still independently authorized by the API regardless of what the
dashboard shows or hides.

## Building for production

```bash
npm run build        # outputs dist/
```

`VITE_API_BASE_URL` is a **build-time** value — Vite inlines every
`import.meta.env.VITE_*` reference into the compiled JS, so it can't be
changed after the fact the way the API's runtime env vars can. Rebuild
with the right value for each environment you deploy to (see
`Dockerfile`'s `VITE_API_BASE_URL` build arg).

## Docker

```bash
docker build --build-arg VITE_API_BASE_URL=https://api.example.com -t fitflow-dashboard web/
```

Multi-stage: builds the static bundle with Node, serves it with nginx
(`nginx.conf` — includes the SPA fallback route so a hard refresh on a
client-side route like `/admin/gyms` doesn't 404). See the repo root's
`docker-compose.yml` for a wired-up example (`web` service) alongside
the API and Postgres.
