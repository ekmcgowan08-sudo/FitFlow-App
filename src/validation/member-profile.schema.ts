/**
 * Zod schema suite — Member Profiles.
 * Shared source of truth for API request validation (via `validate()`
 * middleware) and, if reused on the client, for react-hook-form's
 * zodResolver.
 */
import { z } from 'zod';

export const fitnessGoalEnum = z.enum([
  'FAT_LOSS',
  'MUSCLE_GAIN',
  'ENDURANCE',
  'GENERAL_HEALTH',
  'RECOVERY',
]);

export const activityLevelEnum = z.enum([
  'SEDENTARY',
  'LIGHT',
  'MODERATE',
  'ACTIVE',
  'VERY_ACTIVE',
]);

const baseMemberProfileFields = {
  fullName: z
    .string()
    .trim()
    .min(2, 'Full name must be at least 2 characters.')
    .max(80, 'Full name must be at most 80 characters.'),
  email: z.string().trim().toLowerCase().email(),
  age: z.coerce.number().int().min(13, 'Members must be at least 13 years old.').max(100),
  heightCm: z.coerce.number().min(50).max(250),
  weightKg: z.coerce.number().min(20).max(400),
  fitnessGoal: fitnessGoalEnum,
  activityLevel: activityLevelEnum,
  dietaryRestrictions: z.array(z.string().trim().min(1)).max(20).default([]),
  timezone: z.string().trim().min(1).default('America/Chicago'),
};

/** POST /v1/members */
export const createMemberProfileSchema = z
  .object(baseMemberProfileFields)
  .strict()
  .superRefine((data, ctx) => {
    // Cross-field rule: FAT_LOSS goal with SEDENTARY/LIGHT activity should
    // still supply a weekly budget hint via dietaryRestrictions being present
    // is out of scope here — this shows the pattern for real cross-field checks.
    if (data.fitnessGoal === 'MUSCLE_GAIN' && data.weightKg < 30) {
      ctx.addIssue({
        code: 'custom',
        path: ['weightKg'],
        message: 'weightKg looks too low for a muscle gain goal — please double-check the value.',
      });
    }
  });

export type CreateMemberProfileInput = z.infer<typeof createMemberProfileSchema>;

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

/** Query validation for GET /v1/members?goal=&activity= */
export const listMembersQuerySchema = z.object({
  goal: fitnessGoalEnum.optional(),
  activityLevel: activityLevelEnum.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** Shape returned to clients — strips internal-only fields if any are added later. */
export const memberProfileResponseSchema = z.object({
  id: z.string().uuid(),
  ...baseMemberProfileFields,
  createdAt: z.string().datetime(),
});

export type MemberProfileResponse = z.infer<typeof memberProfileResponseSchema>;
