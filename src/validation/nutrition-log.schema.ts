/**
 * Zod schema suite — Nutrition Logs.
 */
import { z } from 'zod';

export const mealTypeEnum = z.enum(['breakfast', 'lunch', 'dinner', 'snack', 'drink']);

const baseNutritionLogFields = {
  userId: z.string().uuid('userId must be a valid UUID.'),
  loggedAt: z.string().datetime({ message: 'loggedAt must be an ISO 8601 date-time string.' }),
  mealType: mealTypeEnum,
  itemName: z.string().trim().min(1).max(200),
  servingDescription: z.string().trim().max(200).optional(),
  calories: z.coerce.number().int().min(0).max(20000).optional(),
  proteinGrams: z.coerce.number().min(0).max(2000).optional(),
  carbsGrams: z.coerce.number().min(0).max(2000).optional(),
  fatGrams: z.coerce.number().min(0).max(2000).optional(),
  waterOz: z.coerce.number().min(0).max(500).optional(),
};

/** POST /v1/nutrition-logs */
export const createNutritionLogSchema = z.object(baseNutritionLogFields).strict();
export type CreateNutritionLogInput = z.infer<typeof createNutritionLogSchema>;

/** PATCH /v1/nutrition-logs/:id */
export const updateNutritionLogSchema = z
  .object(baseNutritionLogFields)
  .omit({ userId: true })
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Provide at least one field to update.',
  });
export type UpdateNutritionLogInput = z.infer<typeof updateNutritionLogSchema>;

export const nutritionLogIdParamsSchema = z.object({
  id: z.string().uuid('Nutrition log id must be a valid UUID.'),
});

/** GET /v1/nutrition-logs?userId=&mealType=&from=&to=&page=&pageSize= */
export const listNutritionLogsQuerySchema = z
  .object({
    userId: z.string().uuid().optional(),
    mealType: mealTypeEnum.optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
    message: 'from must be before or equal to to.',
    path: ['from'],
  });
