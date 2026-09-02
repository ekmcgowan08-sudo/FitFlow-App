// Grocery-plan routes: a member's shopping list with per-item pricing.
// Scoped to the owning member, or ADMIN/COACH. `authenticate` runs once,
// centrally, in app.ts's protected sub-router.

import { Router, Response } from 'express';
import { AuthenticatedRequest, hasRole } from '../auth/types';
import { validate } from '../middleware/validate';
import {
  createGroceryPlanSchema,
  groceryPlanIdParamsSchema,
  listGroceryPlansQuerySchema,
  type CreateGroceryPlanInput,
} from '../validation/grocery-plan.schema';
import { prisma } from '../lib/prisma-client';
import { ForbiddenError, NotFoundError } from '../lib/errors';
import { translatePrismaError } from '../lib/domain-errors';

const router = Router();

function isElevated(req: AuthenticatedRequest): boolean {
  return hasRole(req.user, 'ADMIN', 'COACH');
}

router.get(
  '/grocery-plans',
  validate({ query: listGroceryPlansQuerySchema }),
  async (req, res: Response, next) => {
    try {
      const authedReq = req as AuthenticatedRequest;
      const { userId, page, pageSize } = req.validated!.query as { userId?: string; page: number; pageSize: number };

      if (userId && userId !== authedReq.user.id && !isElevated(authedReq)) {
        throw new ForbiddenError('You may only list your own grocery plans.');
      }
      const targetUserId = isElevated(authedReq) && userId ? userId : authedReq.user.id;

      const where = { userId: targetUserId };
      const [plans, total] = await Promise.all([
        prisma.groceryPlan.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.groceryPlan.count({ where }),
      ]);

      res.json({ plans, page, pageSize, total });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/grocery-plans/:id',
  validate({ params: groceryPlanIdParamsSchema }),
  async (req, res: Response, next) => {
    try {
      const authedReq = req as AuthenticatedRequest;
      const { id } = req.validated!.params as { id: string };

      const plan = await prisma.groceryPlan.findUnique({ where: { id }, include: { items: true } });
      if (!plan) throw new NotFoundError('Grocery plan not found.');
      if (plan.userId !== authedReq.user.id && !isElevated(authedReq)) {
        throw new NotFoundError('Grocery plan not found.');
      }

      res.json({ plan });
    } catch (err) {
      next(err);
    }
  },
);

router.post('/grocery-plans', validate({ body: createGroceryPlanSchema }), async (req, res: Response, next) => {
  try {
    const authedReq = req as AuthenticatedRequest;
    const input = req.validated!.body as CreateGroceryPlanInput;

    if (input.userId !== authedReq.user.id && !isElevated(authedReq)) {
      throw new ForbiddenError('You may only create grocery plans for yourself.');
    }

    // The plan's estimated total is the sum of its items' unit prices —
    // `quantity` is a free-text field (e.g. "2 lbs"), not a multiplier,
    // so this treats every item as one unit. Good enough for a shopping
    // estimate; a real per-unit total would need a structured quantity.
    const totalEstimatedCostUsd = input.items.reduce((sum, item) => sum + (item.unitPriceUsd ?? 0), 0);

    const plan = await prisma.groceryPlan.create({
      data: {
        userId: input.userId,
        totalEstimatedCostUsd,
        items: { create: input.items },
      },
      include: { items: true },
    });

    res.status(201).json({ plan });
  } catch (err) {
    next(translatePrismaError(err));
  }
});

router.delete(
  '/grocery-plans/:id',
  validate({ params: groceryPlanIdParamsSchema }),
  async (req, res: Response, next) => {
    try {
      const authedReq = req as AuthenticatedRequest;
      const { id } = req.validated!.params as { id: string };

      const existing = await prisma.groceryPlan.findUnique({ where: { id }, select: { userId: true } });
      if (!existing) throw new NotFoundError('Grocery plan not found.');
      if (existing.userId !== authedReq.user.id && !isElevated(authedReq)) {
        throw new NotFoundError('Grocery plan not found.');
      }

      await prisma.groceryPlan.delete({ where: { id } });
      res.status(204).send();
    } catch (err) {
      next(translatePrismaError(err));
    }
  },
);

export default router;
