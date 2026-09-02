/**
 * Zod schema suite — Goals.
 */
import { z } from 'zod';

export const goalCategoryEnum = z.enum(['weight', 'strength', 'nutrition', 'consistency', 'sleep', 'budget']);
export const goalStatusEnum = z.enum(['active', 'paused', 'achieved', 'archived']);

const baseGoalFields = {
  userId: z.string().uuid('userId must be a valid UUID.'),
  category: goalCategoryEnum,
  title: z.string().trim().min(2).max(200),
  targetValue: z.coerce.number().optional(),
  targetUnit: z.string().trim().max(32).optional(),
  dueDate: z.string().date('dueDate must be an ISO 8601 date (YYYY-MM-DD).').optional(),
};

/** POST /v1/goals */
export const createGoalSchema = z.object(baseGoalFields).strict();
export type CreateGoalInput = z.infer<typeof createGoalSchema>;

/** PATCH /v1/goals/:id */
export const updateGoalSchema = z
  .object({ ...baseGoalFields, status: goalStatusEnum })
  .omit({ userId: true })
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Provide at least one field to update.',
  });
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;

export const goalIdParamsSchema = z.object({
  id: z.string().uuid('Goal id must be a valid UUID.'),
});

/** GET /v1/goals?userId=&category=&status=&page=&pageSize= */
export const listGoalsQuerySchema = z.object({
  userId: z.string().uuid().optional(),
  category: goalCategoryEnum.optional(),
  status: goalStatusEnum.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
