// Grocery-plan routes: a member's shopping list with per-item pricing.
// Scoped to the owning member, ADMIN, or a COACH with an active
// CoachAssignment to that member (see src/rbac/member-scope.ts).
// `authenticate` runs once, centrally, in app.ts's protected sub-router.

import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../auth/types';
import { validate } from '../middleware/validate';
import {
  createGroceryPlanSchema,
  groceryPlanIdParamsSchema,
  listGroceryPlansQuerySchema,
  type CreateGroceryPlanInput,
} from '../validation/grocery-plan.schema';
import { prisma } from '../lib/prisma-client';
import { canAccessMemberRecord } from '../rbac/member-scope';
import { ForbiddenError, NotFoundError } from '../lib/errors';
import { translatePrismaError } from '../lib/domain-errors';

const router = Router();

router.get(
  '/grocery-plans',
  validate({ query: listGroceryPlansQuerySchema }),
  async (req, res: Response, next) => {
    try {
      const authedReq = req as AuthenticatedRequest;
      const { userId, page, pageSize } = req.validated!.query as { userId?: string; page: number; pageSize: number };

      const targetUserId = userId ?? authedReq.user.id;
      if (!(await canAccessMemberRecord(prisma, authedReq.user, targetUserId))) {
        throw new ForbiddenError('You may only list your own grocery plans.');
      }

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
      if (!(await canAccessMemberRecord(prisma, authedReq.user, plan.userId))) {
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

    if (!(await canAccessMemberRecord(prisma, authedReq.user, input.userId))) {
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
      if (!(await canAccessMemberRecord(prisma, authedReq.user, existing.userId))) {
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
