/**
 * Zod schema suite — Coach profiles and specialties.
 */
import { z } from 'zod';

export const coachUserIdParamsSchema = z.object({
  userId: z.string().uuid('userId must be a valid UUID.'),
});

export const specialtyParamsSchema = z.object({
  userId: z.string().uuid('userId must be a valid UUID.'),
  specialtyId: z.string().uuid('specialtyId must be a valid UUID.'),
});

/**
 * PATCH /v1/coach-profiles/:userId (upsert). `displayName` is required —
 * CoachProfile.displayName has no default in the schema, so the first
 * call that creates the profile must supply it; a later call that only
 * changes acceptsNewClients still resends the current displayName
 * (simpler and avoids ever needing a separate "must supply displayName
 * on create" validation path).
 */
export const upsertCoachProfileSchema = z
  .object({
    displayName: z.string().trim().min(1).max(255),
    acceptsNewClients: z.coerce.boolean().default(true),
  })
  .strict();
export type UpsertCoachProfileInput = z.infer<typeof upsertCoachProfileSchema>;

export const listCoachProfilesQuerySchema = z.object({
  acceptingClients: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** POST /v1/coach-profiles/:userId/specialties */
export const addSpecialtySchema = z.object({ specialty: z.string().trim().min(1).max(100) }).strict();
export type AddSpecialtyInput = z.infer<typeof addSpecialtySchema>;
