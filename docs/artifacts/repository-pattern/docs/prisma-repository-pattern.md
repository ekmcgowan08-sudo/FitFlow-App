# Prisma Repository Pattern — Best Practices for FitFlow

This guide defines how the FitFlow backend should structure its data-access layer on top of Prisma + TypeScript. It complements the existing `prisma/schema.prisma`, migrations V001–V010, and the route/middleware examples already in the project.

## Why a repository layer at all

`PrismaClient` is already type-safe, so it is tempting to call `prisma.member.findMany(...)` directly inside route handlers. That works for a prototype, but it breaks down as FitFlow grows coach dashboards, billing, and wearable sync on the same schema:

- **Query duplication.** The same `include`/`select` shape for a "member with active goals and latest body metrics" ends up copy-pasted across the dashboard route, the coach portfolio route, and the notification job.
- **Leaky abstractions.** Controllers start depending on Prisma-specific types (`Prisma.MemberWhereInput`, `Prisma.MemberGetPayload<...>`), so a future change to the ORM or schema ripples through the whole codebase.
- **Hard to test.** Route tests end up needing a real Postgres instance because the query logic is inline. A repository interface lets services be tested with an in-memory fake.
- **No single place to enforce invariants.** Soft-delete filters, tenant scoping (coach → client), and audit logging are easy to forget in one of ten call sites but trivial to enforce in one repository method.

## Layering

```
src/
  routes/            <- HTTP concerns only: parse request, call a service, shape response
  services/          <- business logic, orchestration across repositories, transactions
  repositories/       <- one file per aggregate root, Prisma calls live ONLY here
  validation/         <- Zod schemas (request/response contracts)
  middleware/          <- auth, validate(), error handling
  lib/                 <- cross-cutting utilities (error map, logger, prisma client singleton)
```

Rule of thumb: **if a file imports `@prisma/client` types beyond `Prisma` namespace helpers, it should be a repository.** Routes and services should never import `PrismaClient` directly.

## The base repository

Define one generic base class that captures the CRUD shape every aggregate needs, parameterized by the Prisma delegate type. This keeps individual repositories short — they only add model-specific finder methods.

```ts
// src/repositories/base.repository.ts
import type { PrismaClient } from '@prisma/client';

/**
 * Minimal shape shared by every Prisma model delegate
 * (prisma.member, prisma.workoutLog, etc.) that this base class relies on.
 */
export interface PrismaDelegate<TWhere, TCreateInput, TUpdateInput, TEntity> {
  findUnique(args: { where: TWhere }): Promise<TEntity | null>;
  findMany(args?: Record<string, unknown>): Promise<TEntity[]>;
  create(args: { data: TCreateInput }): Promise<TEntity>;
  update(args: { where: TWhere; data: TUpdateInput }): Promise<TEntity>;
  delete(args: { where: TWhere }): Promise<TEntity>;
  count(args?: Record<string, unknown>): Promise<number>;
}

export abstract class BaseRepository<
  TWhere,
  TCreateInput,
  TUpdateInput,
  TEntity,
> {
  protected constructor(
    protected readonly delegate: PrismaDelegate<TWhere, TCreateInput, TUpdateInput, TEntity>,
  ) {}

  findById(where: TWhere): Promise<TEntity | null> {
    return this.delegate.findUnique({ where });
  }

  findMany(args?: Record<string, unknown>): Promise<TEntity[]> {
    return this.delegate.findMany(args);
  }

  create(data: TCreateInput): Promise<TEntity> {
    return this.delegate.create({ data });
  }

  update(where: TWhere, data: TUpdateInput): Promise<TEntity> {
    return this.delegate.update({ where, data });
  }

  delete(where: TWhere): Promise<TEntity> {
    return this.delegate.delete({ where });
  }

  count(args?: Record<string, unknown>): Promise<number> {
    return this.delegate.count(args);
  }
}
```

See `src/repositories/member.repository.ts` and `src/repositories/workout-log.repository.ts` for concrete extensions of this base class.

## Aggregate-scoped repositories, not one god-repository

Create one repository per aggregate root (`MemberRepository`, `WorkoutLogRepository`, `CoachRepository`, `InvoiceRepository`), not one `DatabaseRepository` that wraps the entire schema. Each file:

- Owns the `include`/`select` shapes that route handlers actually need (e.g. `withActiveGoals`, `withLatestBodyMetrics`) as named methods, not ad-hoc objects scattered across callers.
- Exposes domain-shaped finder methods (`findActiveClientsForTrainer(trainerId)`) instead of leaking generic Prisma filter objects to callers.
- Is the only place that imports `prisma` directly.

## Transactions belong in the service layer, not the repository

Repositories should accept an optional Prisma transaction client so services can compose multi-repository writes atomically, but the decision to open a transaction belongs to the service:

```ts
// src/services/workout-session.service.ts
import { prisma } from '../lib/prisma-client';
import { WorkoutLogRepository } from '../repositories/workout-log.repository';
import { MemberRepository } from '../repositories/member.repository';

export async function completeWorkoutSession(input: CompleteSessionInput) {
  return prisma.$transaction(async (tx) => {
    const workoutLogRepo = new WorkoutLogRepository(tx);
    const memberRepo = new MemberRepository(tx);

    const log = await workoutLogRepo.create(input.logData);
    await memberRepo.incrementStreak(input.memberId);
    return log;
  });
}
```

To support this, repository constructors should accept `PrismaClient | Prisma.TransactionClient` rather than hard-coding the global singleton.

## Translate Prisma errors at the repository boundary

Prisma throws `PrismaClientKnownRequestError` with codes like `P2002` (unique constraint) and `P2025` (record not found). Catch and re-throw these as domain errors inside the repository so services and routes never need to know about Prisma error codes:

```ts
import { Prisma } from '@prisma/client';
import { NotFoundError, ConflictError } from '../lib/domain-errors';

async function createMember(data: Prisma.MemberCreateInput) {
  try {
    return await prisma.member.create({ data });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') throw new ConflictError('A member with this email already exists.');
      if (err.code === 'P2025') throw new NotFoundError('Member not found.');
    }
    throw err;
  }
}
```

## Pagination and filtering conventions

Standardize cursor or offset pagination in the base repository (or a shared helper) so every list endpoint behaves the same way:

```ts
export interface PageRequest {
  take?: number;
  cursor?: string;
}

export interface Page<T> {
  items: T[];
  nextCursor?: string;
}
```

Individual repositories map domain filters (e.g. `{ trainerId, status: 'active' }`) into a Prisma `where` clause inside the repository, never in the route.

## Testing strategy

- **Unit test services** against a hand-written fake that implements the same interface as the repository (e.g. `FakeMemberRepository implements Pick<MemberRepository, 'findById' | 'create'>`), so tests run without a database.
- **Integration test repositories** against a real (test) Postgres database using Prisma's migration tooling, focused on query correctness (filters, joins, uniqueness) rather than business rules.
- Never mock `PrismaClient` directly — mock the repository interface instead. Mocking `PrismaClient` couples tests to Prisma's fluent API shape and breaks on every Prisma upgrade.

## Anti-patterns to avoid

- Calling `prisma.<model>.*` from a route handler or a React/Express controller.
- Putting business rules (streak calculations, invoice due-date logic, billing reminders) inside a repository — repositories only translate between domain calls and Prisma calls.
- One repository per Prisma model when several models belong to the same aggregate (e.g. `Invoice` + `InvoiceLineItem` should be one `InvoiceRepository`, not two).
- Returning raw Prisma-generated types from repositories to the HTTP layer — map to explicit DTOs or reuse the Zod schemas in `src/validation/` as the response contract.
- Opening transactions inside a repository method that is also called outside a transaction elsewhere — keep transaction boundaries in services.

## Suggested repository inventory for FitFlow

| Repository | Aggregate root | Depends on |
|---|---|---|
| `MemberRepository` | `users` + `user_profiles` + `goals` | — |
| `WorkoutLogRepository` | `workout_sessions` + `workout_session_exercises` + `workout_sets` | `MemberRepository` |
| `MealPlanRepository` | `meal_plans` + `meal_plan_days` + `meal_plan_entries` | `MemberRepository` |
| `CoachRepository` | `coach_profiles` + `coach_clients` + `coach_notes` | `MemberRepository` |
| `InvoiceRepository` | `invoices` + `invoice_line_items` + `payments` | `CoachRepository` |
| `GymCheckinRepository` | `gyms` + `gym_checkins` | `MemberRepository` |

Each of these should follow the same shape as `MemberRepository` in `src/repositories/member.repository.ts`: extend `BaseRepository`, accept a transaction-capable client in the constructor, and expose domain-named finder methods on top of the generic CRUD surface.
