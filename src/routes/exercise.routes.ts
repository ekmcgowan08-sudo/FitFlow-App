// Exercise-catalog routes: any authenticated user may browse it; only
// ADMIN may add to it. `authenticate` runs once, centrally, in app.ts's
// protected sub-router.

import { Router, Response } from 'express';
import { validate } from '../middleware/validate';
import { requireRole } from '../rbac/rbac.middleware';
import {
  listExercisesQuerySchema,
  exerciseIdParamsSchema,
  createExerciseSchema,
  updateExerciseSchema,
  type CreateExerciseInput,
  type UpdateExerciseInput,
} from '../validation/exercise.schema';
import { prisma } from '../lib/prisma-client';
import { NotFoundError } from '../lib/errors';
import { translatePrismaError } from '../lib/domain-errors';

const router = Router();

router.get('/exercises', validate({ query: listExercisesQuerySchema }), async (req, res: Response, next) => {
  try {
    const { q, category, page, pageSize } = req.validated!.query as {
      q?: string;
      category?: string;
      page: number;
      pageSize: number;
    };

    const where = {
      ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
      ...(category ? { category: category as never } : {}),
    };

    const [exercises, total] = await Promise.all([
      prisma.exercise.findMany({ where, orderBy: { name: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.exercise.count({ where }),
    ]);

    res.json({ exercises, page, pageSize, total });
  } catch (err) {
    next(err);
  }
});

router.get('/exercises/:id', validate({ params: exerciseIdParamsSchema }), async (req, res: Response, next) => {
  try {
    const { id } = req.validated!.params as { id: string };

    const exercise = await prisma.exercise.findUnique({
      where: { id },
      include: {
        primaryMuscles: true,
        secondaryMuscles: true,
        instructions: { orderBy: { stepNumber: 'asc' } },
      },
    });
    if (!exercise) throw new NotFoundError('Exercise not found.');

    res.json({ exercise });
  } catch (err) {
    next(err);
  }
});

router.post(
  '/exercises',
  requireRole('ADMIN'),
  validate({ body: createExerciseSchema }),
  async (req, res: Response, next) => {
    try {
      const input = req.validated!.body as CreateExerciseInput;

      const exercise = await prisma.exercise.create({
        data: {
          name: input.name,
          category: input.category,
          equipment: input.equipment,
          whyItWorks: input.whyItWorks,
          howToVideoUrl: input.howToVideoUrl,
          primaryMuscles: { create: input.primaryMuscles.map((muscleName) => ({ muscleName })) },
          secondaryMuscles: { create: input.secondaryMuscles.map((muscleName) => ({ muscleName })) },
          instructions: {
            create: input.instructions.map((instructionText, index) => ({
              stepNumber: index + 1,
              instructionText,
            })),
          },
        },
        include: { primaryMuscles: true, secondaryMuscles: true, instructions: true },
      });

      res.status(201).json({ exercise });
    } catch (err) {
      next(translatePrismaError(err));
    }
  },
);

router.patch(
  '/exercises/:id',
  requireRole('ADMIN'),
  validate({ params: exerciseIdParamsSchema, body: updateExerciseSchema }),
  async (req, res: Response, next) => {
    try {
      const { id } = req.validated!.params as { id: string };
      const input = req.validated!.body as UpdateExerciseInput;

      const existing = await prisma.exercise.findUnique({ where: { id } });
      if (!existing) throw new NotFoundError('Exercise not found.');

      const exercise = await prisma.exercise.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.category !== undefined ? { category: input.category } : {}),
          ...(input.equipment !== undefined ? { equipment: input.equipment } : {}),
          ...(input.whyItWorks !== undefined ? { whyItWorks: input.whyItWorks } : {}),
          ...(input.howToVideoUrl !== undefined ? { howToVideoUrl: input.howToVideoUrl } : {}),
        },
        include: { primaryMuscles: true, secondaryMuscles: true, instructions: true },
      });
      res.json({ exercise });
    } catch (err) {
      next(translatePrismaError(err));
    }
  },
);

router.delete(
  '/exercises/:id',
  requireRole('ADMIN'),
  validate({ params: exerciseIdParamsSchema }),
  async (req, res: Response, next) => {
    try {
      const { id } = req.validated!.params as { id: string };

      const existing = await prisma.exercise.findUnique({ where: { id } });
      if (!existing) throw new NotFoundError('Exercise not found.');

      // Fails with a 409 (translatePrismaError maps Prisma's P2003) if
      // the exercise is still referenced by a workout plan or a logged
      // session — WorkoutPlanSessionExercise/WorkoutSessionExercise are
      // both `onDelete: Restrict`, so removing an in-use catalog entry
      // never silently orphans a member's training history.
      await prisma.exercise.delete({ where: { id } });
      res.status(204).send();
    } catch (err) {
      next(translatePrismaError(err));
    }
  },
);

export default router;
