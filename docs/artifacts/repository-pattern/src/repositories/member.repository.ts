/**
 * MemberRepository — aggregate root: users + user_profiles + goals.
 * This is the ONLY file allowed to call `prisma.user.*` / `prisma.userProfile.*`
 * directly. Services and routes depend on this interface instead.
 */
import type { Prisma, User } from '@prisma/client';
import { BaseRepository, type PrismaClientOrTx } from './base.repository';
import { translatePrismaError } from '../lib/domain-errors';

export type MemberWithProfile = User & {
  profile: Prisma.UserProfileGetPayload<Record<string, never>> | null;
  goals: Prisma.GoalGetPayload<Record<string, never>>[];
};

export class MemberRepository extends BaseRepository<
  Prisma.UserWhereUniqueInput,
  Prisma.UserCreateInput,
  Prisma.UserUpdateInput,
  User
> {
  constructor(private readonly client: PrismaClientOrTx) {
    super(client.user);
  }

  /** Domain-named finder used by the dashboard and coach portfolio screens. */
  async findWithProfileAndGoals(userId: string): Promise<MemberWithProfile | null> {
    return this.client.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        goals: { where: { status: 'active' } },
      },
    }) as Promise<MemberWithProfile | null>;
  }

  async findActiveClientsForTrainer(trainerUserId: string): Promise<User[]> {
    return this.client.user.findMany({
      where: {
        coachAssignments: {
          some: { coachUserId: trainerUserId, relationshipStatus: 'active' },
        },
      },
    });
  }

  async createWithProfile(input: {
    user: Prisma.UserCreateInput;
    profile: Omit<Prisma.UserProfileCreateInput, 'user'>;
  }): Promise<MemberWithProfile> {
    try {
      const user = await this.client.user.create({
        data: {
          ...input.user,
          profile: { create: input.profile },
        },
        include: { profile: true, goals: true },
      });
      return user as MemberWithProfile;
    } catch (err) {
      throw translatePrismaError(err);
    }
  }

  async incrementStreak(userId: string, streakType: string): Promise<void> {
    await this.client.streak.upsert({
      where: { userId_streakType: { userId, streakType } },
      create: { userId, streakType, currentCount: 1, bestCount: 1 },
      update: { currentCount: { increment: 1 } },
    });
  }
}
