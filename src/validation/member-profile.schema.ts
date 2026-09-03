/**
 * Zod schema suite — Member Profiles (UserProfile, per prisma/schema.prisma).
 */
import { z } from 'zod';

export const sexAtBirthEnum = z.enum(['female', 'male', 'intersex', 'undisclosed']);

const baseMemberProfileFields = {
  fullName: z
    .string()
    .trim()
    .min(2, 'Full name must be at least 2 characters.')
    .max(80, 'Full name must be at most 80 characters.'),
  birthDate: z.string().date('birthDate must be an ISO 8601 date (YYYY-MM-DD).'),
  sexAtBirth: sexAtBirthEnum,
  heightCm: z.coerce.number().min(50).max(250),
  weightKg: z.coerce.number().min(20).max(400),
  // No .default() here: this object backs a PATCH schema via .partial()
  // (see updateMemberProfileSchema below), and Zod applies .default()
  // to a field even when .partial() makes it optional — so a default
  // here would silently inject "America/Chicago" into every PATCH that
  // omits timezone, resetting a member's real timezone on any unrelated
  // profile edit. The database column already defaults new rows to
  // "America/Chicago" (see UserProfile.timezone in schema.prisma), which
  // is all the create path in member.routes.ts needs.
  timezone: z.string().trim().min(1),
};

/** PATCH /v1/members/:id — every field optional, at least one required. */
export const updateMemberProfileSchema = z
  .object(baseMemberProfileFields)
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Provide at least one field to update.',
  });

export type UpdateMemberProfileInput = z.infer<typeof updateMemberProfileSchema>;

/** Path param validation for /v1/members/:id */
export const memberIdParamsSchema = z.object({
  id: z.string().uuid('Member id must be a valid UUID.'),
});

/** Query validation for GET /v1/members */
export const listMembersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
