// Nutrition-log routes: a member's own food/drink log, plus ADMIN access
// to any member's log and COACH access to the logs of members they have
// an active CoachAssignment with (see src/rbac/member-scope.ts). Same
// ownership pattern as goals and workout-logs. `authenticate` runs once,
// centrally, in app.ts's protected sub-router.

import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../auth/types';
import { validate } from '../middleware/validate';
import {
  createNutritionLogSchema,
  updateNutritionLogSchema,
  nutritionLogIdParamsSchema,
  listNutritionLogsQuerySchema,
  type CreateNutritionLogInput,
  type UpdateNutritionLogInput,
} from '../validation/nutrition-log.schema';
import { prisma } from '../lib/prisma-client';
import { canAccessMemberRecord } from '../rbac/member-scope';
import { ForbiddenError, NotFoundError } from '../lib/errors';
import { translatePrismaError } from '../lib/domain-errors';

const router = Router();

router.get(
  '/nutrition-logs',
  validate({ query: listNutritionLogsQuerySchema }),
  async (req, res: Response, next) => {
    try {
      const authedReq = req as AuthenticatedRequest;
      const { userId, mealType, from, to, page, pageSize } = req.validated!.query as {
        userId?: string;
        mealType?: string;
        from?: string;
        to?: string;
        page: number;
        pageSize: number;
      };

      const targetUserId = userId ?? authedReq.user.id;
      if (!(await canAccessMemberRecord(prisma, authedReq.user, targetUserId))) {
        throw new ForbiddenError('You may only list your own nutrition logs.');
      }

      const where = {
        userId: targetUserId,
        ...(mealType ? { mealType: mealType as never } : {}),
        ...(from || to
          ? { loggedAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
          : {}),
      };

      const [logs, total] = await Promise.all([
        prisma.nutritionLog.findMany({
          where,
          orderBy: { loggedAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.nutritionLog.count({ where }),
      ]);

      res.json({ logs, page, pageSize, total });
    } catch (err) {
      next(err);
    }
  },
);

router.post('/nutrition-logs', validate({ body: createNutritionLogSchema }), async (req, res: Response, next) => {
  try {
    const authedReq = req as AuthenticatedRequest;
    const input = req.validated!.body as CreateNutritionLogInput;

    if (!(await canAccessMemberRecord(prisma, authedReq.user, input.userId))) {
      throw new ForbiddenError('You may only log nutrition entries for yourself.');
    }

    const log = await prisma.nutritionLog.create({
      data: {
        userId: input.userId,
        loggedAt: new Date(input.loggedAt),
        mealType: input.mealType,
        itemName: input.itemName,
        servingDescription: input.servingDescription,
        calories: input.calories,
        proteinGrams: input.proteinGrams,
        carbsGrams: input.carbsGrams,
        fatGrams: input.fatGrams,
        waterOz: input.waterOz,
      },
    });

    res.status(201).json({ log });
  } catch (err) {
    next(translatePrismaError(err));
  }
});

router.patch(
  '/nutrition-logs/:id',
  validate({ params: nutritionLogIdParamsSchema, body: updateNutritionLogSchema }),
  async (req, res: Response, next) => {
    try {
      const authedReq = req as AuthenticatedRequest;
      const { id } = req.validated!.params as { id: string };
      const input = req.validated!.body as UpdateNutritionLogInput;

      const existing = await prisma.nutritionLog.findUnique({ where: { id }, select: { userId: true } });
      if (!existing) throw new NotFoundError('Nutrition log not found.');
      if (!(await canAccessMemberRecord(prisma, authedReq.user, existing.userId))) {
        throw new NotFoundError('Nutrition log not found.');
      }

      const log = await prisma.nutritionLog.update({
        where: { id },
        data: {
          ...(input.loggedAt !== undefined ? { loggedAt: new Date(input.loggedAt) } : {}),
          ...(input.mealType !== undefined ? { mealType: input.mealType } : {}),
          ...(input.itemName !== undefined ? { itemName: input.itemName } : {}),
          ...(input.servingDescription !== undefined ? { servingDescription: input.servingDescription } : {}),
          ...(input.calories !== undefined ? { calories: input.calories } : {}),
          ...(input.proteinGrams !== undefined ? { proteinGrams: input.proteinGrams } : {}),
          ...(input.carbsGrams !== undefined ? { carbsGrams: input.carbsGrams } : {}),
          ...(input.fatGrams !== undefined ? { fatGrams: input.fatGrams } : {}),
          ...(input.waterOz !== undefined ? { waterOz: input.waterOz } : {}),
        },
      });

      res.json({ log });
    } catch (err) {
      next(translatePrismaError(err));
    }
  },
);

router.delete(
  '/nutrition-logs/:id',
  validate({ params: nutritionLogIdParamsSchema }),
  async (req, res: Response, next) => {
    try {
      const authedReq = req as AuthenticatedRequest;
      const { id } = req.validated!.params as { id: string };

      const existing = await prisma.nutritionLog.findUnique({ where: { id }, select: { userId: true } });
      if (!existing) throw new NotFoundError('Nutrition log not found.');
      if (!(await canAccessMemberRecord(prisma, authedReq.user, existing.userId))) {
        throw new NotFoundError('Nutrition log not found.');
      }

      await prisma.nutritionLog.delete({ where: { id } });
      res.status(204).send();
    } catch (err) {
      next(translatePrismaError(err));
    }
  },
);

export default router;
