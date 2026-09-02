// Shared "may this caller act on this member's data" predicate, used by
// every domain route (goals, logs, plans, gym check-ins, extended
// profile) that lets a coach reach a member's records.
//
// A COACH role alone is NOT sufficient — that would let any coach read
// or write every member's data platform-wide, not just their own
// clients'. The caller must additionally hold an active CoachAssignment
// to that specific member, exactly like requireCoachOfClient
// (rbac.middleware.ts) already enforces for the illustrative RBAC demo
// routes; this is the same check exposed as a boolean predicate so it
// composes with each route's own self-or-404-vs-403 handling instead of
// being a standalone middleware.
import { PrismaClient } from '@prisma/client';
import { RequestUser, hasRole } from '../auth/types';

export async function canAccessMemberRecord(
  prisma: PrismaClient,
  user: RequestUser,
  targetUserId: string,
): Promise<boolean> {
  if (user.id === targetUserId) return true;
  if (hasRole(user, 'ADMIN')) return true;
  if (hasRole(user, 'COACH')) {
    const assignment = await prisma.coachAssignment.findUnique({
      where: { coachUserId_clientUserId: { coachUserId: user.id, clientUserId: targetUserId } },
      select: { relationshipStatus: true },
    });
    return assignment?.relationshipStatus === 'active';
  }
  return false;
}
