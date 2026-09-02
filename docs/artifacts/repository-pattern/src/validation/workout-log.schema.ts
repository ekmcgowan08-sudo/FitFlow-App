/**
 * Zod schema suite — Workout Logs.
 */
import { z } from 'zod';

export const workoutCategoryEnum = z.enum([
  'STRENGTH',
  'CARDIO',
  'MOBILITY',
  'SPORT',
  'RECOVERY',
]);

const baseWorkoutLogFields = {
  memberId: z.string().uuid('memberId must be a valid UUID.'),
  exerciseName: z.string().trim().min(2).max(120),
  category: workoutCategoryEnum,
  sets: z.coerce.number().int().min(0).max(20).optional(),
  reps: z.coerce.number().int().min(0).max(100).optional(),
  durationMinutes: z.coerce.number().min(1).max(600),
  caloriesBurned: z.coerce.number().min(0).max(5000).optional(),
  loggedAt: z.string().datetime({ message: 'loggedAt must be an ISO 8601 date-time string.' }),
  notes: z.string().trim().max(500).optional(),
};

/**
 * POST /v1/workout-logs
 * Cross-field rule: STRENGTH logs must include sets + reps; CARDIO logs
 * should not include sets/reps but must include a meaningful duration.
 * This demonstrates .superRefine() for validation that spans multiple
 * fields — a single-field .refine() cannot express "sets is required only
 * when category === STRENGTH".
 */
export const createWorkoutLogSchema = z
  .object(baseWorkoutLogFields)
  .strict()
  .superRefine((data, ctx) => {
    if (data.category === 'STRENGTH') {
      if (data.sets === undefined) {
        ctx.addIssue({ code: 'custom', path: ['sets'], message: 'sets is required for STRENGTH workouts.' });
      }
      if (data.reps === undefined) {
        ctx.addIssue({ code: 'custom', path: ['reps'], message: 'reps is required for STRENGTH workouts.' });
      }
    }

    if (data.category === 'CARDIO' && data.durationMinutes < 5) {
      ctx.addIssue({
        code: 'custom',
        path: ['durationMinutes'],
        message: 'Cardio sessions should be logged as at least 5 minutes — check the value.',
      });
    }
  });

export type CreateWorkoutLogInput = z.infer<typeof createWorkoutLogSchema>;

/** PATCH /v1/workout-logs/:id */
export const updateWorkoutLogSchema = z
  .object(baseWorkoutLogFields)
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Provide at least one field to update.',
  });

export type UpdateWorkoutLogInput = z.infer<typeof updateWorkoutLogSchema>;

export const workoutLogIdParamsSchema = z.object({
  id: z.string().uuid('Workout log id must be a valid UUID.'),
});

/** GET /v1/workout-logs?memberId=&category=&from=&to= */
export const listWorkoutLogsQuerySchema = z
  .object({
    memberId: z.string().uuid().optional(),
    category: workoutCategoryEnum.optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
    message: 'from must be before or equal to to.',
    path: ['from'],
  });

export const workoutLogResponseSchema = z.object({
  id: z.string().uuid(),
  ...baseWorkoutLogFields,
  createdAt: z.string().datetime(),
});

export type WorkoutLogResponse = z.infer<typeof workoutLogResponseSchema>;
