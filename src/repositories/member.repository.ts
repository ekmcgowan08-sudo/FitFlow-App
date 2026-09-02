/**
 * MemberRepository — aggregate root: users + user_profiles + goals.
 * This is the ONLY file allowed to call `prisma.user.*` / `prisma.userProfile.*`
 * directly. Services and routes depend on this interface instead.
 */
import type { Prisma, User } from '@prisma/client';
import { BaseRepository, type PrismaClientOrTx } from './base.repository';
import { translatePrismaError } from '../lib/domain-errors';

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
  constructor(private readonly client: PrismaClientOrTx) {
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

  async findActiveClientsForTrainer(trainerUserId: string): Promise<Omit<User, 'passwordHash'>[]> {
    return this.client.user.findMany({
      where: {
        coachAssignments: {
          some: { coachUserId: trainerUserId, relationshipStatus: 'active' },
        },
      },
      omit: { passwordHash: true },
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
        omit: { passwordHash: true },
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
