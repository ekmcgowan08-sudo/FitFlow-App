/**
 * Reusable Zod validation middleware for Express routes.
 *
 * Usage:
 *   router.post(
 *     '/members',
 *     validate({ body: createMemberProfileSchema }),
 *     async (req, res) => {
 *       // req.validated.body is parsed AND typed as
 *       // z.infer<typeof createMemberProfileSchema> — defaults, coercions,
 *       // and transforms have already been applied.
 *     },
 *   );
 *
 * Express 5 gotcha: `req.query` is a getter-only accessor on the prototype
 * (no setter), so `req.query = parsedValue` throws
 * "Cannot set property query of #<IncomingMessage> which has only a getter"
 * under ESM/strict mode (and silently no-ops under CommonJS sloppy mode,
 * which is worse — it looks like it works until you check the value). This
 * broke plenty of Express 4-era validation middlewares that mutated
 * `req.query`/`req.body`/`req.params` in place after parsing. Instead of
 * reassigning the request's own properties, we attach parsed results to a
 * separate `req.validated` bag. `req.body` and `req.params` are plain
 * writable properties in Express 5 and would work fine, but we route all
 * three through `req.validated` for one consistent, future-proof access
 * pattern rather than mixing "read req.body, but read req.validated.query".
 */
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Populated by `validate()`/`validateAsync()` with parsed, typed data. */
      validated?: {
        body?: unknown;
        query?: unknown;
        params?: unknown;
      };
    }
  }
}

export interface ValidationTargets {
  body?: z.ZodType;
  query?: z.ZodType;
  params?: z.ZodType;
}

export interface ValidationErrorResponse {
  error: {
    code: 'VALIDATION_ERROR';
    message: string;
    details: {
      fieldErrors: Record<string, string[]>;
      formErrors: string[];
    };
  };
}

/**
 * Builds the standard FitFlow validation error payload from a ZodError —
 * shaped to match every other error response in this API (see
 * lib/errors.ts's `errorHandler` and openapi.yaml's `Error` schema:
 * `{ error: { code, message, details? } }`). This used to return a
 * different top-level shape (`{ error: "ValidationError", message,
 * fieldErrors, formErrors }`, with `error` a bare string instead of an
 * object) because this 400 is written directly by the `validate()`
 * middleware below rather than thrown as an AppError and caught by
 * `errorHandler` — nothing enforced the two paths agreeing on a shape,
 * and they'd drifted apart despite the OpenAPI spec documenting only
 * the one `Error` shape for both.
 */
export function formatZodError(error: z.ZodError): ValidationErrorResponse {
  const { fieldErrors, formErrors } = z.flattenError(error);
  return {
    error: {
      code: 'VALIDATION_ERROR',
      message: 'One or more fields failed validation.',
      details: { fieldErrors: fieldErrors as Record<string, string[]>, formErrors },
    },
  };
}

/** Combines multiple ZodErrors (e.g. from params + query + body) into one. */
function mergeZodErrors(a: z.ZodError, b: z.ZodError): z.ZodError {
  return new z.ZodError([...a.issues, ...b.issues]);
}

/**
 * Express middleware factory. Validates `req.body`, `req.query`, and/or
 * `req.params` against the given Zod schemas using `safeParse` (never
 * throws), and stores each parsed + transformed value on `req.validated`
 * so downstream handlers get typed, normalized data without mutating
 * Express's own request properties.
 */
export function validate(targets: ValidationTargets) {
  return (req: Request, res: Response, next: NextFunction) => {
    const errors: z.ZodError[] = [];
    const validated: NonNullable<Request['validated']> = {};

    (['params', 'query', 'body'] as const).forEach((key) => {
      const schema = targets[key];
      if (!schema) return;

      const result = schema.safeParse(req[key]);
      if (!result.success) {
        errors.push(result.error);
        return;
      }
      validated[key] = result.data;
    });

    if (errors.length > 0) {
      const merged = errors.slice(1).reduce(mergeZodErrors, errors[0]);
      return res.status(400).json(formatZodError(merged));
    }

    req.validated = { ...req.validated, ...validated };
    next();
  };
}

/**
 * Async variant for schemas with async `.refine()`/`.transform()` calls
 * (e.g. checking email uniqueness against the database during validation).
 */
export function validateAsync(targets: ValidationTargets) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const errors: z.ZodError[] = [];
    const validated: NonNullable<Request['validated']> = {};

    for (const key of ['params', 'query', 'body'] as const) {
      const schema = targets[key];
      if (!schema) continue;

      const result = await schema.safeParseAsync(req[key]);
      if (!result.success) {
        errors.push(result.error);
        continue;
      }
      validated[key] = result.data;
    }

    if (errors.length > 0) {
      const merged = errors.slice(1).reduce(mergeZodErrors, errors[0]);
      return res.status(400).json(formatZodError(merged));
    }

    req.validated = { ...req.validated, ...validated };
    next();
  };
}
