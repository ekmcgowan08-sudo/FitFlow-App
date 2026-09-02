// Workout-plan routes: coach/AI-authored training templates
// (WorkoutPlan -> WorkoutPlanSession -> WorkoutPlanSessionExercise —
// distinct from the WorkoutSession log a member actually completes, see
// docs/architecture/canonical-schema-decisions.md). Scoped to the owning
// member, ADMIN, or a COACH with an active CoachAssignment to that member
// (see src/rbac/member-scope.ts). `authenticate` runs once, centrally, in
// app.ts's protected sub-router.

import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../auth/types';
import { validate } from '../middleware/validate';
import {
  createWorkoutPlanSchema,
  updateWorkoutPlanSchema,
  workoutPlanIdParamsSchema,
  listWorkoutPlansQuerySchema,
  type CreateWorkoutPlanInput,
  type UpdateWorkoutPlanInput,
} from '../validation/workout-plan.schema';
import { prisma } from '../lib/prisma-client';
import { canAccessMemberRecord } from '../rbac/member-scope';
import { ForbiddenError, NotFoundError } from '../lib/errors';
import { translatePrismaError } from '../lib/domain-errors';

const router = Router();

router.get(
  '/workout-plans',
  validate({ query: listWorkoutPlansQuerySchema }),
  async (req, res: Response, next) => {
    try {
      const authedReq = req as AuthenticatedRequest;
      const { userId, page, pageSize } = req.validated!.query as { userId?: string; page: number; pageSize: number };

      const targetUserId = userId ?? authedReq.user.id;
      if (!(await canAccessMemberRecord(prisma, authedReq.user, targetUserId))) {
        throw new ForbiddenError('You may only list your own workout plans.');
      }

      const where = { userId: targetUserId };
      const [plans, total] = await Promise.all([
        prisma.workoutPlan.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
        prisma.workoutPlan.count({ where }),
      ]);

      res.json({ plans, page, pageSize, total });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/workout-plans/:id',
  validate({ params: workoutPlanIdParamsSchema }),
  async (req, res: Response, next) => {
    try {
      const authedReq = req as AuthenticatedRequest;
      const { id } = req.validated!.params as { id: string };

      const plan = await prisma.workoutPlan.findUnique({
        where: { id },
        include: {
          sessions: {
            include: { exercises: { include: { exercise: true }, orderBy: { sortOrder: 'asc' } } },
          },
        },
      });
      if (!plan) throw new NotFoundError('Workout plan not found.');
      if (!(await canAccessMemberRecord(prisma, authedReq.user, plan.userId))) {
        throw new NotFoundError('Workout plan not found.');
      }

      res.json({ plan });
    } catch (err) {
      next(err);
    }
  },
);

router.post('/workout-plans', validate({ body: createWorkoutPlanSchema }), async (req, res: Response, next) => {
  try {
    const authedReq = req as AuthenticatedRequest;
    const input = req.validated!.body as CreateWorkoutPlanInput;

    if (!(await canAccessMemberRecord(prisma, authedReq.user, input.userId))) {
      throw new ForbiddenError('You may only create workout plans for yourself.');
    }

    const plan = await prisma.workoutPlan.create({
      data: {
        userId: input.userId,
        title: input.title,
        coachSource: input.coachSource,
        sessions: {
          create: input.sessions.map((session) => ({
            dayOfWeek: session.dayOfWeek,
            focus: session.focus,
            estimatedMinutes: session.estimatedMinutes,
            restTimerSeconds: session.restTimerSeconds,
            exercises: {
              create: session.exercises.map((exercise) => ({
                exerciseId: exercise.exerciseId,
                targetSets: exercise.targetSets,
                targetReps: exercise.targetReps,
                targetWorkSeconds: exercise.targetWorkSeconds,
                noteText: exercise.noteText,
                sortOrder: exercise.sortOrder,
              })),
            },
          })),
        },
      },
      include: { sessions: { include: { exercises: true } } },
    });

    res.status(201).json({ plan });
  } catch (err) {
    next(translatePrismaError(err));
  }
});

router.patch(
  '/workout-plans/:id',
  validate({ params: workoutPlanIdParamsSchema, body: updateWorkoutPlanSchema }),
  async (req, res: Response, next) => {
    try {
      const authedReq = req as AuthenticatedRequest;
      const { id } = req.validated!.params as { id: string };
      const input = req.validated!.body as UpdateWorkoutPlanInput;

      const existing = await prisma.workoutPlan.findUnique({ where: { id }, select: { userId: true } });
      if (!existing) throw new NotFoundError('Workout plan not found.');
      if (!(await canAccessMemberRecord(prisma, authedReq.user, existing.userId))) {
        throw new NotFoundError('Workout plan not found.');
      }

      const plan = await prisma.workoutPlan.update({ where: { id }, data: { title: input.title } });
      res.json({ plan });
    } catch (err) {
      next(translatePrismaError(err));
    }
  },
);

router.delete(
  '/workout-plans/:id',
  validate({ params: workoutPlanIdParamsSchema }),
  async (req, res: Response, next) => {
    try {
      const authedReq = req as AuthenticatedRequest;
      const { id } = req.validated!.params as { id: string };

      const existing = await prisma.workoutPlan.findUnique({ where: { id }, select: { userId: true } });
      if (!existing) throw new NotFoundError('Workout plan not found.');
      if (!(await canAccessMemberRecord(prisma, authedReq.user, existing.userId))) {
        throw new NotFoundError('Workout plan not found.');
      }

      // Cascades to sessions and their exercises (onDelete: Cascade in
      // prisma/schema.prisma).
      await prisma.workoutPlan.delete({ where: { id } });
      res.status(204).send();
    } catch (err) {
      next(translatePrismaError(err));
    }
  },
);

export default router;
