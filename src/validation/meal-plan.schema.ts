/**
 * Zod schema suite — Meal Plans.
 */
import { z } from 'zod';

export const mealTypeEnum = z.enum(['breakfast', 'lunch', 'dinner', 'snack', 'drink']);
export const coachSourceEnum = z.enum(['ai', 'human']);

const mealPlanMealFields = z.object({
  dayOfWeek: z.string().trim().min(1).max(20),
  mealType: mealTypeEnum,
  recipeName: z.string().trim().min(1).max(200),
  calories: z.coerce.number().int().min(0).max(20000).optional(),
  estimatedCostUsd: z.coerce.number().min(0).max(10000).optional(),
});

/** POST /v1/meal-plans */
export const createMealPlanSchema = z
  .object({
    userId: z.string().uuid('userId must be a valid UUID.'),
    title: z.string().trim().min(2).max(200),
    dailyCalories: z.coerce.number().int().min(0).max(20000).optional(),
    coachSource: coachSourceEnum.default('ai'),
    meals: z.array(mealPlanMealFields).max(70).default([]),
  })
  .strict();
export type CreateMealPlanInput = z.infer<typeof createMealPlanSchema>;

export const mealPlanIdParamsSchema = z.object({
  id: z.string().uuid('Meal plan id must be a valid UUID.'),
});

export const listMealPlansQuerySchema = z.object({
  userId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
