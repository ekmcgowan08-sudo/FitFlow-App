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
  type CreateExerciseInput,
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

export default router;
