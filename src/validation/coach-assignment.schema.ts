/**
 * Zod schema suite — Coach Assignments.
 */
import { z } from 'zod';

export const relationshipStatusEnum = z.enum(['active', 'paused', 'ended']);

/** POST /v1/coach/assignments */
export const createCoachAssignmentSchema = z
  .object({
    coachUserId: z.string().uuid('coachUserId must be a valid UUID.'),
    clientUserId: z.string().uuid('clientUserId must be a valid UUID.'),
    startsOn: z.string().date('startsOn must be an ISO 8601 date (YYYY-MM-DD).').optional(),
    notes: z.string().trim().max(1000).optional(),
  })
  .strict()
  .refine((data) => data.coachUserId !== data.clientUserId, {
    message: 'coachUserId and clientUserId must be different users.',
    path: ['clientUserId'],
  });
export type CreateCoachAssignmentInput = z.infer<typeof createCoachAssignmentSchema>;

/** PATCH /v1/coach/assignments/:coachUserId/:clientUserId */
export const updateCoachAssignmentSchema = z
  .object({
    relationshipStatus: relationshipStatusEnum,
    notes: z.string().trim().max(1000).optional(),
  })
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Provide at least one field to update.',
  });
export type UpdateCoachAssignmentInput = z.infer<typeof updateCoachAssignmentSchema>;

export const coachAssignmentParamsSchema = z.object({
  coachUserId: z.string().uuid('coachUserId must be a valid UUID.'),
  clientUserId: z.string().uuid('clientUserId must be a valid UUID.'),
});

export const listClientsQuerySchema = z.object({
  coachUserId: z.string().uuid().optional(),
});

export const listCoachesQuerySchema = z.object({
  clientUserId: z.string().uuid().optional(),
});
