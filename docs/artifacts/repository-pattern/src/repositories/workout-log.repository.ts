/**
 * WorkoutLogRepository — aggregate root: workout_sessions + workout_session_exercises + workout_sets.
 * Depends on MemberRepository only through IDs, never through a direct import
 * of MemberRepository's Prisma calls.
 */
import type { Prisma, WorkoutSession } from '@prisma/client';
import { BaseRepository, type PrismaClientOrTx, type Page } from './base.repository';
import { translatePrismaError } from '../lib/domain-errors';

export class WorkoutLogRepository extends BaseRepository<
  Prisma.WorkoutSessionWhereUniqueInput,
  Prisma.WorkoutSessionCreateInput,
  Prisma.WorkoutSessionUpdateInput,
  WorkoutSession
> {
  constructor(private readonly client: PrismaClientOrTx) {
    super(client.workoutSession);
  }

  async findRecentForMember(userId: string, page: { take?: number; cursor?: string } = {}): Promise<Page<WorkoutSession>> {
    return this.findPage(
      {
        where: { userId },
        orderBy: { startedAt: 'desc' },
        include: { sessionExercises: { include: { sets: true } } },
      },
      page,
    );
  }

  async logCompletedSet(input: {
    sessionExerciseId: string;
    setNumber: number;
    reps?: number;
    weightKg?: number;
    durationSeconds?: number;
  }): Promise<void> {
    try {
      await this.client.workoutSet.create({
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
