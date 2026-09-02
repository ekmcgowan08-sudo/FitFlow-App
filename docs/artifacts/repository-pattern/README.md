# FitFlow — Repository Pattern, Validation Middleware & Schema Suite

Drop-in additions to the existing FitFlow Prisma + TypeScript + Express backend.

## Files

```
docs/
  prisma-repository-pattern.md   Best practices for structuring the repository layer
src/
  repositories/
    base.repository.ts           Generic BaseRepository<TWhere, TCreateInput, TUpdateInput, TEntity>
    member.repository.ts         MemberRepository (users + user_profiles + goals)
    workout-log.repository.ts    WorkoutLogRepository (workout_sessions + sets)
  lib/
    domain-errors.ts             NotFoundError / ConflictError + Prisma error translation
    prisma-client.ts             Singleton PrismaClient
    zod-error-map.ts             Custom global Zod error map (z.config customError)
  middleware/
    validate.ts                  Reusable validate()/validateAsync() Express middleware
  validation/
    member-profile.schema.ts     Zod schema suite — member profiles
    workout-log.schema.ts        Zod schema suite — workout logs
  routes/
    example-routes.ts            Wires validate() + schemas + repositories together
```

## Install

```bash
npm install zod express @prisma/client
npm install -D typescript tsx @types/express
```

## Wire up at startup

```ts
// src/index.ts
import { registerFitFlowErrorMap } from './lib/zod-error-map';
registerFitFlowErrorMap(); // must run before any schema.safeParse() call

import express from 'express';
import exampleRoutes from './routes/example-routes';

const app = express();
app.use(express.json());
app.use('/v1', exampleRoutes);
app.listen(3000);
```

## Why these four pieces fit together

1. **Repository pattern** (`docs/prisma-repository-pattern.md` + `src/repositories/`) keeps every `prisma.*` call behind a typed interface, one file per aggregate root, so routes and services never import `@prisma/client` directly.
2. **`validate()` middleware** (`src/middleware/validate.ts`) parses `req.body` / `req.query` / `req.params` with `safeParse` and attaches the parsed+transformed value to `req.validated.{body,query,params}` (see "Express 5 gotcha" below for why), returning a consistent `400 { error: 'ValidationError', fieldErrors, formErrors }` shape on failure.
3. **Global error map** (`src/lib/zod-error-map.ts`) makes every one of those `fieldErrors` messages read like FitFlow copy ("age must be at least 13.") instead of Zod's generic defaults — registered once via `z.config({ customError })`.
4. **Schema suite** (`src/validation/*.schema.ts`) is the single source of truth both `validate()` and, if reused client-side, `zodResolver` can share — including cross-field rules like "STRENGTH workouts require sets and reps" via `.superRefine()`.

## Express 5 gotcha: don't reassign `req.query`

If you're on Express 5 (check your `package.json` — it's the default for new projects since late 2024), `req.query` is a getter-only accessor with no setter. Older Express-4-era validation middlewares that did `req.query = parsedValue` after `safeParse()` will throw `Cannot set property query of #<IncomingMessage> which has only a getter` under ESM/strict mode — or silently no-op under CommonJS sloppy mode, which is worse because it looks like it works. `req.body` and `req.params` are still plain writable properties, but `validate()` in this package routes all three through `req.validated.{body,query,params}` for one consistent access pattern instead of mixing `req.body` with `req.validated.query`. Update your route handlers to read `req.validated!.body` / `req.validated!.query` / `req.validated!.params` accordingly.

## Live demo

A runnable version of this exact architecture (Express + Zod validation middleware + custom error map + schema suite + a repository layer over SQLite/Drizzle standing in for Prisma/Postgres) is deployed so you can submit valid and intentionally invalid member profiles and workout logs and see the formatted errors come back live. See the link shared alongside this package.
