/**
 * Zod schema suite — Coach profiles and specialties.
 */
import { z } from 'zod';
import { strictBoolean } from './shared';

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
 *
 * `acceptsNewClients` is deliberately `.optional()`, not `.default(true)`:
 * a `.default()` here would apply even when the field is omitted, so a
 * coach who PATCHes only `displayName` (fixing a typo) would silently
 * have acceptsNewClients reset to true, re-opening themselves to new
 * clients against their own prior choice. Omitted means "leave
 * unchanged" on update (coach-profile.routes.ts passes `undefined`
 * straight through — Prisma treats that as "don't touch this field");
 * on create, the column's own `@default(true)` in schema.prisma covers
 * a first-time profile that doesn't specify it.
 */
export const upsertCoachProfileSchema = z
  .object({
    displayName: z.string().trim().min(1).max(255),
    acceptsNewClients: strictBoolean.optional(),
  })
  .strict();
export type UpsertCoachProfileInput = z.infer<typeof upsertCoachProfileSchema>;

export const listCoachProfilesQuerySchema = z.object({
  acceptingClients: strictBoolean.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** POST /v1/coach-profiles/:userId/specialties */
export const addSpecialtySchema = z.object({ specialty: z.string().trim().min(1).max(100) }).strict();
export type AddSpecialtyInput = z.infer<typeof addSpecialtySchema>;
