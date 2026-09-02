// Goal routes: a member's own health/fitness goals, plus ADMIN access to
// any member's goals and COACH access to the goals of members they have
// an active CoachAssignment with (see src/rbac/member-scope.ts —
// a COACH role alone is never enough). `authenticate` runs once,
// centrally, in app.ts's protected sub-router.

import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../auth/types';
import { validate } from '../middleware/validate';
import {
  createGoalSchema,
  updateGoalSchema,
  goalIdParamsSchema,
  listGoalsQuerySchema,
  type CreateGoalInput,
  type UpdateGoalInput,
} from '../validation/goal.schema';
import { prisma } from '../lib/prisma-client';
import { canAccessMemberRecord } from '../rbac/member-scope';
import { ForbiddenError, NotFoundError } from '../lib/errors';
import { translatePrismaError } from '../lib/domain-errors';

const router = Router();

router.get('/goals', validate({ query: listGoalsQuerySchema }), async (req, res: Response, next) => {
  try {
    const authedReq = req as AuthenticatedRequest;
    const { userId, category, status, page, pageSize } = req.validated!.query as {
      userId?: string;
      category?: string;
      status?: string;
      page: number;
      pageSize: number;
    };

    const targetUserId = userId ?? authedReq.user.id;
    if (!(await canAccessMemberRecord(prisma, authedReq.user, targetUserId))) {
      throw new ForbiddenError('You may only list your own goals.');
    }

    const where = { userId: targetUserId, ...(category ? { category: category as never } : {}), ...(status ? { status: status as never } : {}) };
    const [goals, total] = await Promise.all([
      prisma.goal.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.goal.count({ where }),
    ]);

    res.json({ goals, page, pageSize, total });
  } catch (err) {
    next(err);
  }
});

router.get('/goals/:id', validate({ params: goalIdParamsSchema }), async (req, res: Response, next) => {
  try {
    const authedReq = req as AuthenticatedRequest;
    const { id } = req.validated!.params as { id: string };

    const goal = await prisma.goal.findUnique({ where: { id } });
    if (!goal) throw new NotFoundError('Goal not found.');
    if (!(await canAccessMemberRecord(prisma, authedReq.user, goal.userId))) {
      // A 404, not a 403: a goal id that exists but belongs to someone
      // else should not confirm its existence to a caller with no
      // relationship to it (see requireCoachOfClient's stricter check for
      // routes where ownership already narrows this down).
      throw new NotFoundError('Goal not found.');
    }

    res.json({ goal });
  } catch (err) {
    next(err);
  }
});

router.post('/goals', validate({ body: createGoalSchema }), async (req, res: Response, next) => {
  try {
    const authedReq = req as AuthenticatedRequest;
    const input = req.validated!.body as CreateGoalInput;

    // `userId` in the body is never trusted for whose goal this becomes
    // unless the caller is authorized for that member — same rule as
    // workout-log creation (see workout-log.routes.ts).
    if (!(await canAccessMemberRecord(prisma, authedReq.user, input.userId))) {
      throw new ForbiddenError('You may only create goals for yourself.');
    }

    const goal = await prisma.goal.create({
      data: {
        userId: input.userId,
        category: input.category,
        title: input.title,
        targetValue: input.targetValue,
        targetUnit: input.targetUnit,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
      },
    });

    res.status(201).json({ goal });
  } catch (err) {
    next(translatePrismaError(err));
  }
});

router.patch(
  '/goals/:id',
  validate({ params: goalIdParamsSchema, body: updateGoalSchema }),
  async (req, res: Response, next) => {
    try {
      const authedReq = req as AuthenticatedRequest;
      const { id } = req.validated!.params as { id: string };
      const input = req.validated!.body as UpdateGoalInput;

      const existing = await prisma.goal.findUnique({ where: { id }, select: { userId: true } });
      if (!existing) throw new NotFoundError('Goal not found.');
      if (!(await canAccessMemberRecord(prisma, authedReq.user, existing.userId))) {
        throw new NotFoundError('Goal not found.');
      }

      const goal = await prisma.goal.update({
        where: { id },
        data: {
          ...(input.category !== undefined ? { category: input.category } : {}),
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.targetValue !== undefined ? { targetValue: input.targetValue } : {}),
          ...(input.targetUnit !== undefined ? { targetUnit: input.targetUnit } : {}),
          ...(input.dueDate !== undefined ? { dueDate: new Date(input.dueDate) } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
        },
      });

      res.json({ goal });
    } catch (err) {
      next(translatePrismaError(err));
    }
  },
);

router.delete('/goals/:id', validate({ params: goalIdParamsSchema }), async (req, res: Response, next) => {
  try {
    const authedReq = req as AuthenticatedRequest;
    const { id } = req.validated!.params as { id: string };

    const existing = await prisma.goal.findUnique({ where: { id }, select: { userId: true } });
    if (!existing) throw new NotFoundError('Goal not found.');
    if (!(await canAccessMemberRecord(prisma, authedReq.user, existing.userId))) {
      throw new NotFoundError('Goal not found.');
    }

    await prisma.goal.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    next(translatePrismaError(err));
  }
});

export default router;
