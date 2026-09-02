/**
 * Zod schema suite — Gyms and Gym Check-ins.
 */
import { z } from 'zod';

export const checkinSourceEnum = z.enum(['qr', 'geofence', 'manual']);

/** POST /v1/gyms (ADMIN only) */
export const createGymSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    city: z.string().trim().max(100).optional(),
    state: z.string().trim().max(100).optional(),
  })
  .strict();
export type CreateGymInput = z.infer<typeof createGymSchema>;

export const listGymsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** POST /v1/gym-checkins */
export const createGymCheckInSchema = z
  .object({
    userId: z.string().uuid('userId must be a valid UUID.'),
    gymId: z.string().uuid('gymId must be a valid UUID.'),
    source: checkinSourceEnum,
    checkedInAt: z.string().datetime().optional(),
  })
  .strict();
export type CreateGymCheckInInput = z.infer<typeof createGymCheckInSchema>;

export const listGymCheckInsQuerySchema = z.object({
  userId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
