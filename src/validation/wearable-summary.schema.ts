/**
 * Zod schema suite — Wearable Daily Summaries.
 */
import { z } from 'zod';

/** POST /v1/wearable-summaries (upsert by userId + summaryDate) */
export const upsertWearableSummarySchema = z
  .object({
    userId: z.string().uuid('userId must be a valid UUID.'),
    summaryDate: z.string().date('summaryDate must be an ISO 8601 date (YYYY-MM-DD).'),
    steps: z.coerce.number().int().min(0).max(200000).optional(),
    activeCalories: z.coerce.number().int().min(0).max(20000).optional(),
    exerciseMinutes: z.coerce.number().int().min(0).max(1440).optional(),
    restingHeartRate: z.coerce.number().int().min(20).max(250).optional(),
    sleepHours: z.coerce.number().min(0).max(24).optional(),
  })
  .strict();
export type UpsertWearableSummaryInput = z.infer<typeof upsertWearableSummarySchema>;

export const listWearableSummariesQuerySchema = z
  .object({
    userId: z.string().uuid().optional(),
    from: z.string().date().optional(),
    to: z.string().date().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(30),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
    message: 'from must be before or equal to to.',
    path: ['from'],
  });
