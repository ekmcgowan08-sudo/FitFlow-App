/**
 * WorkoutLogRepository — aggregate root: workout_sessions + workout_session_exercises + workout_sets.
 * Depends on MemberRepository only through IDs, never through a direct import
 * of MemberRepository's Prisma calls.
 */
import type {
  Exercise,
  Prisma,
  PrismaClient,
  WorkoutSession,
  WorkoutSessionExercise,
  WorkoutSet,
} from '@prisma/client';
import { ExerciseCategory } from '@prisma/client';
import { BaseRepository } from './base.repository';
import { translatePrismaError } from '../lib/domain-errors';

type PrismaTx = Prisma.TransactionClient;

function isUniqueConstraintViolation(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === 'P2002';
}

/**
 * Finds a catalog Exercise by (name, category), creating it if this is
 * the first time it's been logged. `exercises` has a `@@unique([name,
 * category])` constraint (see prisma/schema.prisma) specifically to back
 * this: two concurrent callers can both miss the `findFirst` and both
 * attempt the `create`, but only one can win — the loser's `create`
 * throws P2002, at which point re-querying finds the winner's row
 * instead of ending up with two catalog rows for the same exercise.
 */
async function findOrCreateExercise(
  tx: PrismaTx,
  name: string,
  category: ExerciseCategory,
): Promise<Exercise> {
  const existing = await tx.exercise.findFirst({ where: { name, category } });
  if (existing) return existing;

  try {
    return await tx.exercise.create({ data: { name, category } });
  } catch (err) {
    if (!isUniqueConstraintViolation(err)) throw err;
    const winner = await tx.exercise.findFirst({ where: { name, category } });
    if (!winner) throw err; // Shouldn't happen, but don't swallow a real conflict.
    return winner;
  }
}

export interface AdHocWorkoutLogInput {
  userId: string;
  exerciseName: string;
  category: ExerciseCategory;
  loggedAt: Date;
  sets?: number;
  reps?: number;
  durationMinutes: number;
  caloriesBurned?: number;
  notes?: string;
}

export interface UpdateAdHocWorkoutInput {
  exerciseName?: string;
  category?: ExerciseCategory;
  loggedAt?: Date;
  caloriesBurned?: number;
  notes?: string;
}

type AdHocWorkoutSession = WorkoutSession & {
  sessionExercises: (WorkoutSessionExercise & { exercise: Exercise })[];
};

export class WorkoutLogRepository extends BaseRepository<
  Prisma.WorkoutSessionWhereUniqueInput,
  Prisma.WorkoutSessionCreateInput,
  Prisma.WorkoutSessionUpdateInput,
  WorkoutSession
> {
  // Unlike MemberRepository, this repository takes a full `PrismaClient`
  // rather than `PrismaClientOrTx`: `logAdHocWorkout` owns its own
  // transaction boundary (`$transaction`, which a `Prisma.TransactionClient`
  // does not expose — nested transactions aren't a thing), so it can't be
  // constructed from inside a caller's existing transaction.
  constructor(private readonly client: PrismaClient) {
    super(client.workoutSession);
  }

  /**
   * listForUser — real offset pagination for `GET /workout-logs`
   * (page/pageSize, per listWorkoutLogsQuerySchema), always scoped to a
   * single owning user. This replaces the earlier example wiring, which
   * accepted a `page` query param but never actually advanced past page 1
   * (it always passed `cursor: undefined` to `findRecentForMember`
   * regardless of the requested page).
   */
  async listForUser(
    userId: string,
    filters: { category?: ExerciseCategory; from?: Date; to?: Date; page: number; pageSize: number },
  ): Promise<{ items: WorkoutSession[]; page: number; pageSize: number; total: number }> {
    const where: Prisma.WorkoutSessionWhereInput = {
      userId,
      ...(filters.from || filters.to
        ? { startedAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } }
        : {}),
      ...(filters.category ? { sessionExercises: { some: { exercise: { category: filters.category } } } } : {}),
    };

    const [items, total] = await Promise.all([
      this.client.workoutSession.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
        include: { sessionExercises: { include: { exercise: true, sets: true } } },
      }),
      this.client.workoutSession.count({ where }),
    ]);

    return { items, page: filters.page, pageSize: filters.pageSize, total };
  }

  /**
   * logAdHocWorkout — the real implementation behind `POST /workout-logs`:
   * creates the full WorkoutSession -> WorkoutSessionExercise -> WorkoutSet
   * chain the validation contract (createWorkoutLogSchema) promises,
   * rather than a bare session row. Finds-or-creates a catalog `Exercise`
   * by (name, category) so free-text logging still resolves to the shared
   * exercise catalog used by workout plans.
   *
   * Two fixes caught by live-testing this against a real database:
   * - It used to create exactly ONE WorkoutSet row no matter what `sets`
   *   said, so "3 sets of squats" was indistinguishable from one set —
   *   it now creates `input.sets` (default 1) rows, each carrying an
   *   even share of the logged duration.
   * - `startedAt` and `completedAt` used to both equal `loggedAt`, so the
   *   session's own timestamps always implied zero elapsed time even
   *   though `durationMinutes` was logged; `completedAt` is now
   *   `loggedAt + durationMinutes`.
   */
  async logAdHocWorkout(input: AdHocWorkoutLogInput): Promise<WorkoutSession> {
    try {
      return await this.client.$transaction(async (tx) => {
        const exercise = await findOrCreateExercise(tx, input.exerciseName, input.category);

        const setCount = input.sets ?? 1;
        const durationSecondsPerSet = Math.round((input.durationMinutes * 60) / setCount);
        const completedAt = new Date(input.loggedAt.getTime() + input.durationMinutes * 60 * 1000);

        return tx.workoutSession.create({
          data: {
            userId: input.userId,
            startedAt: input.loggedAt,
            completedAt,
            status: 'completed',
            caloriesBurned: input.caloriesBurned,
            sessionExercises: {
              create: {
                exerciseId: exercise.id,
                noteText: input.notes,
                sets: {
                  create: Array.from({ length: setCount }, (_, index) => ({
                    setNumber: index + 1,
                    reps: input.reps,
                    durationSeconds: durationSecondsPerSet,
                    completed: true,
                  })),
                },
              },
            },
          },
          include: { sessionExercises: { include: { sets: true } } },
        });
      });
    } catch (err) {
      throw translatePrismaError(err);
    }
  }

  /**
   * updateAdHocWorkout — the real implementation behind
   * `PATCH /workout-logs/:id`. The caller (workout-log.routes.ts) has
   * already confirmed ownership and that `existing` has exactly one
   * session exercise — this endpoint only corrects metadata (which
   * exercise/category, when it happened, calories, notes), never the
   * sets/reps a workout was actually logged with, so there's no set
   * regeneration here, just a session + session-exercise update.
   */
  async updateAdHocWorkout(existing: AdHocWorkoutSession, input: UpdateAdHocWorkoutInput): Promise<WorkoutSession> {
    try {
      return await this.client.$transaction(async (tx) => {
        const sessionExercise = existing.sessionExercises[0];
        let exerciseId = sessionExercise.exerciseId;

        if (input.exerciseName !== undefined || input.category !== undefined) {
          const name = input.exerciseName ?? sessionExercise.exercise.name;
          const category = input.category ?? sessionExercise.exercise.category;
          const exercise = await findOrCreateExercise(tx, name, category);
          exerciseId = exercise.id;
        }

        if (exerciseId !== sessionExercise.exerciseId || input.notes !== undefined) {
          await tx.workoutSessionExercise.update({
            where: { id: sessionExercise.id },
            data: {
              ...(exerciseId !== sessionExercise.exerciseId ? { exerciseId } : {}),
              ...(input.notes !== undefined ? { noteText: input.notes } : {}),
            },
          });
        }

        // Shifting loggedAt preserves the originally-logged elapsed time
        // (durationMinutes isn't editable here) rather than recomputing
        // completedAt from scratch.
        const elapsedMs = existing.completedAt ? existing.completedAt.getTime() - existing.startedAt.getTime() : 0;
        const startedAt = input.loggedAt ?? existing.startedAt;

        return tx.workoutSession.update({
          where: { id: existing.id },
          data: {
            ...(input.loggedAt !== undefined
              ? { startedAt, completedAt: new Date(startedAt.getTime() + elapsedMs) }
              : {}),
            ...(input.caloriesBurned !== undefined ? { caloriesBurned: input.caloriesBurned } : {}),
          },
          include: { sessionExercises: { include: { exercise: true, sets: true } } },
        });
      });
    } catch (err) {
      throw translatePrismaError(err);
    }
  }

  /**
   * startSession — begins a live, progressively-logged workout (see
   * src/routes/workout-session.routes.ts), as opposed to
   * `logAdHocWorkout`'s single-shot retroactive log. When
   * `planSessionId` is given, the route layer has already confirmed
   * that plan session belongs to `input.userId`; this copies its
   * exercises in as the session's starting list, in template order, so
   * the member doesn't have to re-add every planned exercise by hand.
   */
  async startSession(input: { userId: string; planSessionId?: string }): Promise<WorkoutSession> {
    try {
      const templateExercises = input.planSessionId
        ? await this.client.workoutPlanSessionExercise.findMany({
            where: { planSessionId: input.planSessionId },
            orderBy: { sortOrder: 'asc' },
          })
        : [];

      return await this.client.workoutSession.create({
        data: {
          userId: input.userId,
          planSessionId: input.planSessionId,
          startedAt: new Date(),
          status: 'in_progress',
          ...(templateExercises.length
            ? {
                sessionExercises: {
                  create: templateExercises.map((exercise) => ({
                    exerciseId: exercise.exerciseId,
                    sortOrder: exercise.sortOrder,
                    noteText: exercise.noteText,
                  })),
                },
              }
            : {}),
        },
        include: { sessionExercises: { include: { exercise: true, sets: true }, orderBy: { sortOrder: 'asc' } } },
      });
    } catch (err) {
      throw translatePrismaError(err);
    }
  }

  /**
   * logCompletedSet — `setNumber` is computed here (max existing + 1),
   * not passed in by the caller: the route used to derive it from
   * `session.sessionExercises[].sets.length`, a snapshot read at the top
   * of the request, which two near-simultaneous "log a set" calls for the
   * same exercise could both read before either had written — producing
   * two sets both numbered, say, 3. Computing it fresh here narrows that
   * window to just this method, and the `@@unique([sessionExerciseId,
   * setNumber])` constraint (prisma/schema.prisma) turns a genuine
   * collision into a P2002 this method retries, instead of silently
   * writing duplicate-numbered sets.
   *
   * The retry budget is sized for the realistic case (a flaky mobile
   * connection double-submitting the same tap, or two of one member's own
   * devices logging within the same second), not for arbitrary load —
   * live-tested with 10 truly simultaneous requests for the same
   * exercise, 5 succeeded and 5 exhausted their retries and 409'd, but
   * critically zero duplicate setNumbers were ever written. Losing a
   * request under extreme contention is an acceptable, retryable-by-the-
   * client failure mode; silently corrupting the set count is not.
   */
  async logCompletedSet(input: {
    sessionExerciseId: string;
    reps?: number;
    weightKg?: number;
    durationSeconds?: number;
  }): Promise<WorkoutSet> {
    const MAX_ATTEMPTS = 5;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const { _max } = await this.client.workoutSet.aggregate({
          where: { sessionExerciseId: input.sessionExerciseId },
          _max: { setNumber: true },
        });

        return await this.client.workoutSet.create({
          data: {
            sessionExerciseId: input.sessionExerciseId,
            setNumber: (_max.setNumber ?? 0) + 1,
            reps: input.reps,
            weightKg: input.weightKg,
            durationSeconds: input.durationSeconds,
            completed: true,
          },
        });
      } catch (err) {
        if (isUniqueConstraintViolation(err) && attempt < MAX_ATTEMPTS) continue;
        throw translatePrismaError(err);
      }
    }
    /* istanbul ignore next -- unreachable: the loop above always returns or throws */
    throw new Error('unreachable');
  }

  async completeSession(sessionId: string, caloriesBurned?: number): Promise<WorkoutSession> {
    try {
      return await this.client.workoutSession.update({
        where: { id: sessionId },
        data: { status: 'completed', completedAt: new Date(), caloriesBurned },
      });
    } catch (err) {
      throw translatePrismaError(err);
    }
  }
}
