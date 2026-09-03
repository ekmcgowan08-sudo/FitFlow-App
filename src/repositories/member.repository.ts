/**
 * MemberRepository — aggregate root: users + user_profiles + goals.
 * This is the ONLY file allowed to call `prisma.user.*` / `prisma.userProfile.*`
 * directly. Services and routes depend on this interface instead.
 */
import type { Prisma, PrismaClient, User } from '@prisma/client';
import { BaseRepository } from './base.repository';

export type MemberWithProfile = Omit<User, 'passwordHash'> & {
  profile: Prisma.UserProfileGetPayload<Record<string, never>> | null;
  goals: Prisma.GoalGetPayload<Record<string, never>>[];
};

export class MemberRepository extends BaseRepository<
  Prisma.UserWhereUniqueInput,
  Prisma.UserCreateInput,
  Prisma.UserUpdateInput,
  User
> {
  // `incrementStreak` owns its own transaction boundary (`$transaction`,
  // which a `Prisma.TransactionClient` doesn't expose), so — like
  // WorkoutLogRepository — this takes a full `PrismaClient` rather than
  // `PrismaClientOrTx`.
  constructor(private readonly client: PrismaClient) {
    super(client.user);
  }

  /** Domain-named finder used by the dashboard and coach portfolio screens. */
  async findWithProfileAndGoals(userId: string): Promise<MemberWithProfile | null> {
    return this.client.user.findUnique({
      where: { id: userId },
      // `omit` keeps `passwordHash` out of every caller's response by
      // construction, rather than relying on every route handler to
      // remember to strip it before sending JSON back to the client.
      omit: { passwordHash: true },
      include: {
        profile: true,
        goals: { where: { status: 'active' } },
      },
    }) as Promise<MemberWithProfile | null>;
  }

  /**
   * incrementStreak — advances `currentCount` and, when it's a new high,
   * `bestCount` too. This needs a read-modify-write in a transaction
   * rather than a single `upsert` with `currentCount: { increment: 1 }`:
   * Prisma has no "set bestCount to GREATEST(bestCount, currentCount)"
   * update operator, so a plain upsert would raise `currentCount`
   * forever while `bestCount` stayed frozen at whatever it was on first
   * creation — a real bug caught by exercising this end to end (it had
   * never been called from anywhere before workout-log.routes.ts wired
   * it up).
   */
  async incrementStreak(userId: string, streakType: string): Promise<void> {
    await this.client.$transaction(async (tx) => {
      const existing = await tx.streak.findUnique({ where: { userId_streakType: { userId, streakType } } });

      if (!existing) {
        await tx.streak.create({ data: { userId, streakType, currentCount: 1, bestCount: 1 } });
        return;
      }

      const currentCount = existing.currentCount + 1;
      await tx.streak.update({
        where: { userId_streakType: { userId, streakType } },
        data: { currentCount, bestCount: Math.max(existing.bestCount, currentCount) },
      });
    });
  }
}
