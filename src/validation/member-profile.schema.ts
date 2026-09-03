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
  timezone: z.string().trim().min(1).default('America/Chicago'),
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
