/**
 * Zod schema suite — Workout Plans (coach/AI-authored training templates).
 */
import { z } from 'zod';

export const coachSourceEnum = z.enum(['ai', 'human']);

const planSessionExerciseFields = z.object({
  exerciseId: z.string().uuid('exerciseId must be a valid UUID.'),
  targetSets: z.coerce.number().int().min(1).max(20).optional(),
  targetReps: z.string().trim().max(50).optional(),
  targetWorkSeconds: z.coerce.number().int().min(1).max(7200).optional(),
  noteText: z.string().trim().max(500).optional(),
  sortOrder: z.coerce.number().int().min(1).default(1),
});

const planSessionFields = z.object({
  dayOfWeek: z.string().trim().min(1).max(20),
  focus: z.string().trim().min(1).max(200),
  estimatedMinutes: z.coerce.number().int().min(1).max(600).optional(),
  restTimerSeconds: z.coerce.number().int().min(1).max(3600).optional(),
  exercises: z.array(planSessionExerciseFields).max(50).default([]),
});

/** POST /v1/workout-plans */
export const createWorkoutPlanSchema = z
  .object({
    userId: z.string().uuid('userId must be a valid UUID.'),
    title: z.string().trim().min(2).max(200),
    coachSource: coachSourceEnum.default('ai'),
    sessions: z.array(planSessionFields).max(14).default([]),
  })
  .strict();
export type CreateWorkoutPlanInput = z.infer<typeof createWorkoutPlanSchema>;

/** PATCH /v1/workout-plans/:id */
export const updateWorkoutPlanSchema = z
  .object({ title: z.string().trim().min(2).max(200) })
  .strict();
export type UpdateWorkoutPlanInput = z.infer<typeof updateWorkoutPlanSchema>;

export const workoutPlanIdParamsSchema = z.object({
  id: z.string().uuid('Workout plan id must be a valid UUID.'),
});

export const listWorkoutPlansQuerySchema = z.object({
  userId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
