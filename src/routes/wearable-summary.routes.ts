// Wearable-daily-summary routes: a member's phone/watch app syncs one
// row per day. Writes are self or ADMIN only (a coach doesn't sync
// someone else's wearable); reads are self or ADMIN/COACH. `authenticate`
// runs once, centrally, in app.ts's protected sub-router.

import { Router, Response } from 'express';
import { AuthenticatedRequest, hasRole } from '../auth/types';
import { validate } from '../middleware/validate';
import {
  upsertWearableSummarySchema,
  listWearableSummariesQuerySchema,
  type UpsertWearableSummaryInput,
} from '../validation/wearable-summary.schema';
import { prisma } from '../lib/prisma-client';
import { ForbiddenError } from '../lib/errors';
import { translatePrismaError } from '../lib/domain-errors';

const router = Router();

function canRead(req: AuthenticatedRequest, targetUserId: string): boolean {
  return req.user.id === targetUserId || hasRole(req.user, 'ADMIN', 'COACH');
}

function canWrite(req: AuthenticatedRequest, targetUserId: string): boolean {
  return req.user.id === targetUserId || hasRole(req.user, 'ADMIN');
}

router.get(
  '/wearable-summaries',
  validate({ query: listWearableSummariesQuerySchema }),
  async (req, res: Response, next) => {
    try {
      const authedReq = req as AuthenticatedRequest;
      const { userId, from, to, page, pageSize } = req.validated!.query as {
        userId?: string;
        from?: string;
        to?: string;
        page: number;
        pageSize: number;
      };

      const targetUserId = userId ?? authedReq.user.id;
      if (!canRead(authedReq, targetUserId)) {
        throw new ForbiddenError('You may only view your own wearable summaries.');
      }

      const where = {
        userId: targetUserId,
        ...(from || to
          ? { summaryDate: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
          : {}),
      };

      const [summaries, total] = await Promise.all([
        prisma.wearableDailySummary.findMany({
          where,
          orderBy: { summaryDate: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.wearableDailySummary.count({ where }),
      ]);

      res.json({ summaries, page, pageSize, total });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/wearable-summaries',
  validate({ body: upsertWearableSummarySchema }),
  async (req, res: Response, next) => {
    try {
      const authedReq = req as AuthenticatedRequest;
      const input = req.validated!.body as UpsertWearableSummaryInput;

      if (!canWrite(authedReq, input.userId)) {
        throw new ForbiddenError('You may only sync your own wearable data.');
      }

      const summaryDate = new Date(input.summaryDate);
      const fields = {
        steps: input.steps,
        activeCalories: input.activeCalories,
        exerciseMinutes: input.exerciseMinutes,
        restingHeartRate: input.restingHeartRate,
        sleepHours: input.sleepHours,
      };

      const summary = await prisma.wearableDailySummary.upsert({
        where: { userId_summaryDate: { userId: input.userId, summaryDate } },
        create: { userId: input.userId, summaryDate, ...fields },
        update: fields,
      });

      res.status(201).json({ summary });
    } catch (err) {
      next(translatePrismaError(err));
    }
  },
);

export default router;
