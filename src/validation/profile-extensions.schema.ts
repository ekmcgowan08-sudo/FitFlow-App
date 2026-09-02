/**
 * Zod schema suite — extended member profile: preferences, health
 * profile, and allergies.
 */
import { z } from 'zod';

export const memberIdParamsSchema = z.object({
  userId: z.string().uuid('userId must be a valid UUID.'),
});

export const goalStyleEnum = z.enum(['fat_loss', 'muscle_gain', 'maintenance', 'endurance', 'recomposition']);
export const workoutLocationEnum = z.enum(['home', 'gym', 'hybrid']);
export const dietStyleEnum = z.enum([
  'balanced',
  'high_protein',
  'low_carb',
  'vegetarian',
  'vegan',
  'pescatarian',
]);
export const smartwatchPlatformEnum = z.enum(['apple_health', 'wear_os', 'garmin', 'fitbit', 'none']);

/** PATCH /v1/members/:userId/preferences */
export const updatePreferencesSchema = z
  .object({
    goalStyle: goalStyleEnum,
    workoutLocation: workoutLocationEnum,
    dietStyle: dietStyleEnum,
    themeColor: z.string().trim().max(32),
    coachPreference: z.string().trim().max(200),
    smartwatchPlatform: smartwatchPlatformEnum,
  })
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Provide at least one field to update.',
  });
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;

/** PATCH /v1/members/:userId/health-profile */
export const updateHealthProfileSchema = z
  .object({
    calorieTarget: z.coerce.number().int().min(0).max(20000),
    proteinTargetGrams: z.coerce.number().int().min(0).max(2000),
    carbTargetGrams: z.coerce.number().int().min(0).max(2000),
    fatTargetGrams: z.coerce.number().int().min(0).max(2000),
    waterTargetOz: z.coerce.number().int().min(0).max(1000),
  })
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Provide at least one field to update.',
  });
export type UpdateHealthProfileInput = z.infer<typeof updateHealthProfileSchema>;

/** POST /v1/members/:userId/allergies */
export const createAllergySchema = z
  .object({ allergyName: z.string().trim().min(1).max(100) })
  .strict();
export type CreateAllergyInput = z.infer<typeof createAllergySchema>;

export const allergyIdParamsSchema = z.object({
  userId: z.string().uuid('userId must be a valid UUID.'),
  allergyId: z.string().uuid('allergyId must be a valid UUID.'),
});

/**
 * POST /v1/members/:userId/medical-notes. Deliberately more restricted
 * than allergies (self/ADMIN only, no COACH) — medical notes are
 * free-text clinical information, a materially more sensitive category
 * than a structured allergy list a coach needs for meal planning.
 */
export const createMedicalNoteSchema = z.object({ noteText: z.string().trim().min(1).max(2000) }).strict();
export type CreateMedicalNoteInput = z.infer<typeof createMedicalNoteSchema>;

export const medicalNoteIdParamsSchema = z.object({
  userId: z.string().uuid('userId must be a valid UUID.'),
  noteId: z.string().uuid('noteId must be a valid UUID.'),
});
