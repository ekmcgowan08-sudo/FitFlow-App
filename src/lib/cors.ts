// CORS configuration for browser-based API clients (the web dashboard in
// web/). Kept as its own module rather than an inline `cors()` call in
// app.ts so the allowlist logic is unit-testable in isolation.
import cors, { CorsOptions } from "cors";
import { CORS_ALLOWED_ORIGINS } from "./env";

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
    callback(new Error(`Origin not allowed by CORS: ${origin}`));
  },
  credentials: false,
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

export const corsMiddleware = cors(corsOptions);
