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

## Known follow-up work (tracked in the repo's task list, not yet done)

- The repository-pattern package's example routes are illustrative, not
  production-ready (see `docs/artifacts/README.md`'s "Known conflicts" #3)
  and will need real cursor pagination, a non-empty-string `userId`
  requirement, and a full exercise/sets log on create rather than a bare
  session — fixed when that package is wired into `src/`.
- The security module's `rbac/rbac.middleware.ts` (`requireCoachOfClient`)
  and `rbac/example.routes.ts` reference `prisma.coachClient` /
  `.status`; these need the `coachAssignment` / `.relationshipStatus`
  rename called out above.
- The two OpenAPI specs (`docs/artifacts/openapi/product-api.yaml` and
  `security-module-api.yaml`) still need merging into one spec that matches
  this schema once routes are wired up.
