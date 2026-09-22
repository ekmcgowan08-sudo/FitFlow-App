// CORS configuration for browser-based API clients (the web dashboard in
// web/). Kept as its own module rather than an inline `cors()` call in
// app.ts so the allowlist logic is unit-testable in isolation.
import cors, { CorsOptions } from "cors";
import { CORS_ALLOWED_ORIGINS } from "./env";
import { ForbiddenError } from "./errors";

export const corsOptions: CorsOptions = {
  // No `Origin` header (mobile apps, curl, server-to-server calls) is
  // always allowed through — CORS is a browser-enforced restriction on
  // browser callers, not a server-side authorization mechanism, so
  // blocking non-browser clients here would do nothing for security
  // while breaking every non-browser consumer of this API.
  origin(origin, callback) {
    if (!origin || CORS_ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
      return;
    }
    // A plain `new Error(...)` here isn't an AppError, so errorHandler
    // (lib/errors.ts) can't recognize it and falls through to its
    // generic "unexpected error" branch: a 500 INTERNAL_ERROR, plus a
    // false-positive `[UNHANDLED_ERROR]` log line — for what is, like a
    // malformed JSON body, a routine and expected condition (a browser
    // origin that was never on the allowlist), not a server bug.
    callback(new ForbiddenError(`Origin not allowed by CORS: ${origin}`));
  },
  credentials: false,
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

export const corsMiddleware = cors(corsOptions);
