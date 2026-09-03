/**
 * Zod schema suite — live workout sessions: start a session (optionally
 * from a WorkoutPlanSession template), add exercises, log completed sets
 * progressively, and finish or cancel it.
 */
import { z } from 'zod';

export const startWorkoutSessionSchema = z
  .object({
    userId: z.string().uuid('userId must be a valid UUID.'),
    planSessionId: z.string().uuid('planSessionId must be a valid UUID.').optional(),
  })
  .strict();
export type StartWorkoutSessionInput = z.infer<typeof startWorkoutSessionSchema>;

export const workoutSessionIdParamsSchema = z.object({
  sessionId: z.string().uuid('sessionId must be a valid UUID.'),
});

export const addSessionExerciseSchema = z
  .object({
    exerciseId: z.string().uuid('exerciseId must be a valid UUID.'),
    noteText: z.string().trim().max(500).optional(),
  })
  .strict();
export type AddSessionExerciseInput = z.infer<typeof addSessionExerciseSchema>;

export const sessionExerciseParamsSchema = z.object({
  sessionId: z.string().uuid('sessionId must be a valid UUID.'),
  sessionExerciseId: z.string().uuid('sessionExerciseId must be a valid UUID.'),
});

export const logSetSchema = z
  .object({
    reps: z.coerce.number().int().min(0).max(1000).optional(),
    weightKg: z.coerce.number().min(0).max(1000).optional(),
    durationSeconds: z.coerce.number().int().min(0).max(36000).optional(),
  })
  .strict();
export type LogSetInput = z.infer<typeof logSetSchema>;

export const completeSessionSchema = z
  .object({
    caloriesBurned: z.coerce.number().int().min(0).max(10000).optional(),
  })
  .strict();
export type CompleteSessionInput = z.infer<typeof completeSessionSchema>;
