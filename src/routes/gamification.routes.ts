// Gamification routes: badges and achievements are system-awarded, never
// client-authored — reads are self, ADMIN, or a COACH with an active
// CoachAssignment to that member (see src/rbac/member-scope.ts); writes
// are ADMIN only (an internal gamification job would call these with
// admin credentials; there is deliberately no path for a user to award
// themselves a badge). `authenticate` runs once, centrally, in app.ts's
// protected sub-router.

import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../auth/types';
import { validate } from '../middleware/validate';
import { requireRole } from '../rbac/rbac.middleware';
import {
  listGamificationQuerySchema,
  awardBadgeSchema,
  badgeIdParamsSchema,
  createAchievementSchema,
  updateAchievementSchema,
  achievementIdParamsSchema,
  type AwardBadgeInput,
  type CreateAchievementInput,
  type UpdateAchievementInput,
} from '../validation/gamification.schema';
import { prisma } from '../lib/prisma-client';
import { canAccessMemberRecord } from '../rbac/member-scope';
import { ForbiddenError, NotFoundError } from '../lib/errors';
import { translatePrismaError } from '../lib/domain-errors';

const router = Router();

router.get('/badges', validate({ query: listGamificationQuerySchema }), async (req, res: Response, next) => {
  try {
    const authedReq = req as AuthenticatedRequest;
    const { userId } = req.validated!.query as { userId?: string };
    const targetUserId = userId ?? authedReq.user.id;
    if (!(await canAccessMemberRecord(prisma, authedReq.user, targetUserId))) {
      throw new ForbiddenError('You may only view your own badges.');
    }

    const badges = await prisma.badge.findMany({
      where: { userId: targetUserId },
      orderBy: { unlockedAt: 'desc' },
    });
    res.json({ badges });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/badges',
  requireRole('ADMIN'),
  validate({ body: awardBadgeSchema }),
  async (req, res: Response, next) => {
    try {
      const input = req.validated!.body as AwardBadgeInput;
      const badge = await prisma.badge.create({
        data: {
          userId: input.userId,
          name: input.name,
          unlockedAt: input.unlockedAt ? new Date(input.unlockedAt) : new Date(),
        },
      });
      res.status(201).json({ badge });
    } catch (err) {
      next(translatePrismaError(err));
    }
  },
);

router.delete(
  '/badges/:id',
  requireRole('ADMIN'),
  validate({ params: badgeIdParamsSchema }),
  async (req, res: Response, next) => {
    try {
      const { id } = req.validated!.params as { id: string };

      const existing = await prisma.badge.findUnique({ where: { id } });
      if (!existing) throw new NotFoundError('Badge not found.');

      // Revokes a wrongly-awarded badge. No children reference a Badge,
      // so this is always a clean delete — no P2003 risk.
      await prisma.badge.delete({ where: { id } });
      res.status(204).send();
    } catch (err) {
      next(translatePrismaError(err));
    }
  },
);

router.get('/achievements', validate({ query: listGamificationQuerySchema }), async (req, res: Response, next) => {
  try {
    const authedReq = req as AuthenticatedRequest;
    const { userId } = req.validated!.query as { userId?: string };
    const targetUserId = userId ?? authedReq.user.id;
    if (!(await canAccessMemberRecord(prisma, authedReq.user, targetUserId))) {
      throw new ForbiddenError('You may only view your own achievements.');
    }

    const achievements = await prisma.achievement.findMany({
      where: { userId: targetUserId },
    });
    res.json({ achievements });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/achievements',
  requireRole('ADMIN'),
  validate({ body: createAchievementSchema }),
  async (req, res: Response, next) => {
    try {
      const input = req.validated!.body as CreateAchievementInput;
      const achievement = await prisma.achievement.create({ data: input });
      res.status(201).json({ achievement });
    } catch (err) {
      next(translatePrismaError(err));
    }
  },
);

router.patch(
  '/achievements/:id',
  requireRole('ADMIN'),
  validate({ params: achievementIdParamsSchema, body: updateAchievementSchema }),
  async (req, res: Response, next) => {
    try {
      const { id } = req.validated!.params as { id: string };
      const input = req.validated!.body as UpdateAchievementInput;

      const existing = await prisma.achievement.findUnique({ where: { id } });
      if (!existing) throw new NotFoundError('Achievement not found.');

      const achievement = await prisma.achievement.update({ where: { id }, data: input });
      res.json({ achievement });
    } catch (err) {
      next(translatePrismaError(err));
    }
  },
);

export default router;
