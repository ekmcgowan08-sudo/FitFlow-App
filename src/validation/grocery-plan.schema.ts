/**
 * Zod schema suite — Grocery Plans.
 */
import { z } from 'zod';

const groceryPlanItemFields = z.object({
  storeName: z.string().trim().min(1).max(200),
  itemName: z.string().trim().min(1).max(200),
  quantity: z.string().trim().max(50).optional(),
  unitPriceUsd: z.coerce.number().min(0).max(10000).optional(),
  bestDeal: z.coerce.boolean().default(false),
});

/** POST /v1/grocery-plans */
export const createGroceryPlanSchema = z
  .object({
    userId: z.string().uuid('userId must be a valid UUID.'),
    items: z.array(groceryPlanItemFields).max(200).default([]),
  })
  .strict();
export type CreateGroceryPlanInput = z.infer<typeof createGroceryPlanSchema>;

export const groceryPlanIdParamsSchema = z.object({
  id: z.string().uuid('Grocery plan id must be a valid UUID.'),
});

export const listGroceryPlansQuerySchema = z.object({
  userId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
