import { z } from 'zod';

export const listStreaksQuerySchema = z.object({
  userId: z.string().uuid().optional(),
});
