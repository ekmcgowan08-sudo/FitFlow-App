// rbac/errors.ts
// Centralized, typed error classes + a single Express error handler so
// every auth/authz failure in the API maps to one predictable HTTP status
// and one predictable JSON shape.

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super(401, "UNAUTHORIZED", message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action", details?: unknown) {
    super(403, "FORBIDDEN", message, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(404, "NOT_FOUND", message);
  }
}

export class ValidationError extends AppError {
  constructor(message = "Invalid request", details?: unknown) {
    super(400, "VALIDATION_ERROR", message, details);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Resource already exists", details?: unknown) {
    super(409, "CONFLICT", message, details);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = "Too many requests, please try again later", retryAfterSeconds?: number) {
    super(429, "TOO_MANY_REQUESTS", message, retryAfterSeconds ? { retryAfterSeconds } : undefined);
  }
}

/**
 * Express error-handling middleware. Register this LAST, after all routes:
 *
 *   app.use(rbacErrorHandler);
 *
 * Every route in this module throws AppError subclasses and forwards them
 * with `next(err)` rather than constructing ad-hoc `res.status(...)` calls,
 * so the status code / JSON body contract is defined in exactly one place.
 */
export function rbacErrorHandler(
  err: unknown,
  _req: import("express").Request,
  res: import("express").Response,
  _next: import("express").NextFunction
) {
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      console.error(`[${err.code}]`, err.message, err.details ?? "");
    }
    return res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
  }

  // Unknown/unexpected errors: log full detail server-side, return a
  // generic 500 to the client. Never leak stack traces or library
  // internals in the response body.
  console.error("[UNHANDLED_ERROR]", err);
  return res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Something went wrong" },
  });
}
