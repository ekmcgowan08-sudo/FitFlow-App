// Meal-plan routes: coach/AI-authored weekly meal plans. Scoped to the
// owning member, or ADMIN/COACH. `authenticate` runs once, centrally, in
// app.ts's protected sub-router.

import { Router, Response } from 'express';
import { AuthenticatedRequest, hasRole } from '../auth/types';
import { validate } from '../middleware/validate';
import {
  createMealPlanSchema,
  mealPlanIdParamsSchema,
  listMealPlansQuerySchema,
  type CreateMealPlanInput,
} from '../validation/meal-plan.schema';
import { prisma } from '../lib/prisma-client';
import { ForbiddenError, NotFoundError } from '../lib/errors';
import { translatePrismaError } from '../lib/domain-errors';

const router = Router();

function isElevated(req: AuthenticatedRequest): boolean {
  return hasRole(req.user, 'ADMIN', 'COACH');
}

router.get('/meal-plans', validate({ query: listMealPlansQuerySchema }), async (req, res: Response, next) => {
  try {
    const authedReq = req as AuthenticatedRequest;
    const { userId, page, pageSize } = req.validated!.query as { userId?: string; page: number; pageSize: number };

    if (userId && userId !== authedReq.user.id && !isElevated(authedReq)) {
      throw new ForbiddenError('You may only list your own meal plans.');
    }
    const targetUserId = isElevated(authedReq) && userId ? userId : authedReq.user.id;

    const where = { userId: targetUserId };
    const [plans, total] = await Promise.all([
      prisma.mealPlan.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.mealPlan.count({ where }),
    ]);

    res.json({ plans, page, pageSize, total });
  } catch (err) {
    next(err);
  }
});

router.get('/meal-plans/:id', validate({ params: mealPlanIdParamsSchema }), async (req, res: Response, next) => {
  try {
    const authedReq = req as AuthenticatedRequest;
    const { id } = req.validated!.params as { id: string };

    const plan = await prisma.mealPlan.findUnique({ where: { id }, include: { meals: true } });
    if (!plan) throw new NotFoundError('Meal plan not found.');
    if (plan.userId !== authedReq.user.id && !isElevated(authedReq)) {
      throw new NotFoundError('Meal plan not found.');
    }

    res.json({ plan });
  } catch (err) {
    next(err);
  }
});

router.post('/meal-plans', validate({ body: createMealPlanSchema }), async (req, res: Response, next) => {
  try {
    const authedReq = req as AuthenticatedRequest;
    const input = req.validated!.body as CreateMealPlanInput;

    if (input.userId !== authedReq.user.id && !isElevated(authedReq)) {
      throw new ForbiddenError('You may only create meal plans for yourself.');
    }

    const plan = await prisma.mealPlan.create({
      data: {
        userId: input.userId,
        title: input.title,
        dailyCalories: input.dailyCalories,
        coachSource: input.coachSource,
        meals: { create: input.meals },
      },
      include: { meals: true },
    });

    res.status(201).json({ plan });
  } catch (err) {
    next(translatePrismaError(err));
  }
});

router.delete('/meal-plans/:id', validate({ params: mealPlanIdParamsSchema }), async (req, res: Response, next) => {
  try {
    const authedReq = req as AuthenticatedRequest;
    const { id } = req.validated!.params as { id: string };

    const existing = await prisma.mealPlan.findUnique({ where: { id }, select: { userId: true } });
    if (!existing) throw new NotFoundError('Meal plan not found.');
    if (existing.userId !== authedReq.user.id && !isElevated(authedReq)) {
      throw new NotFoundError('Meal plan not found.');
    }

    await prisma.mealPlan.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    next(translatePrismaError(err));
  }
});

export default router;
