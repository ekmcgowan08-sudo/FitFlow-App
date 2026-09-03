/**
 * Validation helpers shared across multiple resource schemas.
 */
import { z } from 'zod';

/**
 * A boolean that also accepts the string forms `"true"`/`"false"` (how a
 * boolean necessarily arrives in a query string, and how it can arrive
 * in a loosely-typed request body) — unlike `z.coerce.boolean()`, which
 * runs the input through JS's `Boolean(x)` and so treats ANY non-empty
 * string as `true`, including the literal string `"false"`. A query like
 * `?acceptingClients=false` would otherwise be indistinguishable from
 * `?acceptingClients=true`, silently returning the opposite result set.
 * Chain `.optional()` / `.default(...)` same as any other Zod schema.
 */
export const strictBoolean = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((value) => (typeof value === 'boolean' ? value : value === 'true'));
