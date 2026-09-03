/**
 * WorkoutLogRepository — aggregate root: workout_sessions + workout_session_exercises + workout_sets.
 * Depends on MemberRepository only through IDs, never through a direct import
 * of MemberRepository's Prisma calls.
 */
import type { Exercise, Prisma, PrismaClient, WorkoutSession, WorkoutSessionExercise, WorkoutSet } from '@prisma/client';
import { ExerciseCategory } from '@prisma/client';
import { BaseRepository } from './base.repository';
import { translatePrismaError } from '../lib/domain-errors';

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
        const exercise =
          (await tx.exercise.findFirst({
            where: { name: input.exerciseName, category: input.category },
          })) ??
          (await tx.exercise.create({
            data: { name: input.exerciseName, category: input.category },
          }));

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
          const exercise =
            (await tx.exercise.findFirst({ where: { name, category } })) ??
            (await tx.exercise.create({ data: { name, category } }));
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

  async logCompletedSet(input: {
    sessionExerciseId: string;
    setNumber: number;
    reps?: number;
    weightKg?: number;
    durationSeconds?: number;
  }): Promise<WorkoutSet> {
    try {
      return await this.client.workoutSet.create({
        data: {
          sessionExerciseId: input.sessionExerciseId,
          setNumber: input.setNumber,
          reps: input.reps,
          weightKg: input.weightKg,
          durationSeconds: input.durationSeconds,
          completed: true,
        },
      });
    } catch (err) {
      throw translatePrismaError(err);
    }
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
