# Canonical schema decisions

`prisma/schema.prisma` at the repo root reconciles three schemas that were
never designed to interoperate, preserved verbatim under
`docs/artifacts/prisma/` and `docs/artifacts/repository-pattern/`:

1. **`product-schema.prisma`** — broad, `Member`-centric (no auth at all).
2. **`security-module-schema.prisma`** — narrow `User`/roles/refresh-token
   identity slice, with a bare-bones `WorkoutSession`.
3. **The repository-pattern package** — no `.prisma` file of its own, but
   its TypeScript (`member.repository.ts`, `workout-log.repository.ts`)
   compiles only against a `User`/`UserProfile`/`Goal`/`Streak`/
   `WorkoutSession`/`WorkoutSet` shape with specific field names.

## Decisions

- **`User` is the only identity root.** There is no `Member` table. The
  security module's `User`/`Role`/`UserRole`/`RefreshToken` are adopted
  unchanged — that code is the most rigorously audited part of the archive
  and nothing about it needed to change.
- **Profile data is split off `User`** into `UserProfile` (name, birth date,
  sex at birth, height/weight, timezone — merging the product schema's
  `Member` fields with the security module's `UserProfile`),
  `UserPreference` (renamed from `MemberPreference`), and
  `UserHealthProfile` (renamed from `MemberHealthProfile`), each keyed by
  `userId`. Splitting keeps auth lookups from ever having to select profile
  columns they don't need.
- **Coaching is User-to-User.** The product schema's standalone `Coach`
  model (which could exist without a `User`, to represent an "ai" coach as
  a row) is dropped. A human coach is a `User` with a `CoachProfile`
  (from the security module) plus `CoachSpecialty` rows. An AI-authored
  plan is just `coachSource: CoachType.ai` on `WorkoutPlan`/`MealPlan` —
  there's no fake `User` row for "the AI". The security module's
  `CoachClient` and the product schema's `CoachAssignment` are the same
  relationship; the merged model is named `CoachAssignment` with field
  `relationshipStatus` (matching the repository package's
  `coachAssignments: { some: { relationshipStatus: 'active' } }` query).
  **Call sites in the security module that referenced `prisma.coachClient`
  and `.status` need updating to `prisma.coachAssignment` and
  `.relationshipStatus`** when it's wired in (tracked separately).
- **Streak fields follow the repository package, not the product schema.**
  The product schema used `currentDays`/`longestDays`; the repository
  package's actual code calls
  `streak.upsert({ update: { currentCount: { increment: 1 } } })`. Since
  that code is what will run, the schema uses `currentCount`/`bestCount`.
- **Workout logging and workout planning are two different model families,
  not one:**
  - `WorkoutPlan` → `WorkoutPlanSession` → `WorkoutPlanSessionExercise` is
    the coach/AI-authored *template* (renamed from the product schema's
    `WorkoutPlan`/`WorkoutSession`/`WorkoutSessionExercise` to avoid a name
    collision with the log-side model below).
  - `WorkoutSession` → `WorkoutSessionExercise` → `WorkoutSet` is what a
    user actually *logged*, optionally against a `WorkoutPlanSession`
    (`planSessionId` is nullable, so an ad-hoc workout with no plan still
    works). This shape is dictated by the repository-pattern package's and
    the security module's actual Prisma calls
    (`workoutSession.userId`, `.sessionExercises.sets`,
    `workoutSet.create(...)`, `workoutSession.findMany({ where: { userId },
    orderBy: { startedAt: 'desc' } })`) — both call sites work unmodified
    against this model.
- **Everything else** (`Goal`, `MealPlan`/`MealPlanMeal`, `GroceryPlan`/
  `GroceryPlanItem`, `NutritionLog`, `Gym`/`GymCheckIn`, `Badge`,
  `Achievement`, `WearableDailySummary`, `UserAllergy`, `UserMedicalNote`)
  is carried over from the product schema with `memberId` renamed to
  `userId` and the relation repointed at `User`.

## Follow-up work from the original reconciliation (now done)

The three items originally tracked here as not-yet-done are all resolved:
- `src/routes/workout-log.routes.ts` has real offset pagination
  (page/pageSize) and a full session→exercise→set write on every log,
  replacing the illustrative example wiring's bare-session/no-pagination
  version.
- `src/rbac/rbac.middleware.ts`'s `requireCoachOfClient` and
  `src/routes/rbac-examples.routes.ts` use `coachAssignment` /
  `.relationshipStatus` throughout — the rename was applied everywhere,
  not left half-done.
- `openapi/openapi.yaml` is the single merged spec matching this schema
  (48 paths as of the live workout-session flow — see its own `info`
  block for what it supersedes).

Two decisions made after this reconciliation, elsewhere in the codebase,
are worth knowing about here since they shape how the schema above gets
used: `src/rbac/member-scope.ts` requires an active `CoachAssignment` for
any COACH access to a specific member's data (a COACH role alone is
never enough — see its own doc comment), and `WorkoutSession.status`
(`in_progress`/`completed`/`cancelled`) backs a live, progressively-
logged workout flow (`src/routes/workout-session.routes.ts`), not just
`workout-log.routes.ts`'s single-shot retroactive log.
