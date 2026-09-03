/**
 * Zod schema suite — Exercise catalog.
 */
import { z } from 'zod';

export const exerciseCategoryEnum = z.enum(['strength', 'cardio', 'mobility', 'recovery', 'sport']);

export const listExercisesQuerySchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  category: exerciseCategoryEnum.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const exerciseIdParamsSchema = z.object({
  id: z.string().uuid('Exercise id must be a valid UUID.'),
});

/** POST /v1/exercises (ADMIN only) */
export const createExerciseSchema = z
  .object({
    name: z.string().trim().min(2).max(200),
    category: exerciseCategoryEnum,
    equipment: z.string().trim().max(200).optional(),
    whyItWorks: z.string().trim().max(2000).optional(),
    howToVideoUrl: z.string().url().optional(),
    primaryMuscles: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
    secondaryMuscles: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
    instructions: z.array(z.string().trim().min(1).max(500)).max(50).default([]),
  })
  .strict();
export type CreateExerciseInput = z.infer<typeof createExerciseSchema>;

/**
 * PATCH /v1/exercises/:id (ADMIN only). Scalar catalog fields only, like
 * workout-plan.routes.ts's title-only PATCH — replacing the nested
 * muscle/instruction lists is a delete-and-recreate operation, not a
 * simple field update, and isn't needed yet.
 */
export const updateExerciseSchema = z
  .object({
    name: z.string().trim().min(2).max(200),
    category: exerciseCategoryEnum,
    equipment: z.string().trim().max(200),
    whyItWorks: z.string().trim().max(2000),
    howToVideoUrl: z.string().url(),
  })
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Provide at least one field to update.',
  });
export type UpdateExerciseInput = z.infer<typeof updateExerciseSchema>;
