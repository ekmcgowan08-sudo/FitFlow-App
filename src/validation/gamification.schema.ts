/**
 * Zod schema suite — Badges and Achievements (read: self or ADMIN/COACH;
 * write: ADMIN only — these are system-awarded, never client-authored).
 */
import { z } from 'zod';

export const achievementStatusEnum = z.enum(['locked', 'in_progress', 'unlocked']);

export const listGamificationQuerySchema = z.object({
  userId: z.string().uuid().optional(),
});

/** POST /v1/badges (ADMIN only) */
export const awardBadgeSchema = z
  .object({
    userId: z.string().uuid('userId must be a valid UUID.'),
    name: z.string().trim().min(1).max(200),
    unlockedAt: z.string().datetime().optional(),
  })
  .strict();
export type AwardBadgeInput = z.infer<typeof awardBadgeSchema>;

/** POST /v1/achievements (ADMIN only) */
export const createAchievementSchema = z
  .object({
    userId: z.string().uuid('userId must be a valid UUID.'),
    title: z.string().trim().min(1).max(200),
    progressPercent: z.coerce.number().min(0).max(100).default(0),
    status: achievementStatusEnum.default('locked'),
  })
  .strict();
export type CreateAchievementInput = z.infer<typeof createAchievementSchema>;

/** PATCH /v1/achievements/:id (ADMIN only) */
export const updateAchievementSchema = z
  .object({
    progressPercent: z.coerce.number().min(0).max(100),
    status: achievementStatusEnum,
  })
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Provide at least one field to update.',
  });
export type UpdateAchievementInput = z.infer<typeof updateAchievementSchema>;

export const achievementIdParamsSchema = z.object({
  id: z.string().uuid('Achievement id must be a valid UUID.'),
});

export const badgeIdParamsSchema = z.object({
  id: z.string().uuid('Badge id must be a valid UUID.'),
});
