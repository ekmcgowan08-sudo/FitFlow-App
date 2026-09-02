// before/types.ts
// Original request-context typing found in the FitFlow Suite API.
// Flagged in the audit under "TypeScript interface integrity".

import { Request } from "express";

// VULNERABLE: `user` is optional and typed `any`. Every route handler that
// reads `req.user.id` compiles fine even on completely unauthenticated
// requests, and the compiler gives zero protection against typos like
// `req.user.rol` or against `role` being `undefined`.
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

// VULNERABLE: role is a free-form string. "Admin", "admin", " admin" and
// "administrator" are all valid values as far as the type system is
// concerned, so a comparison bug or a data-entry typo silently fails open
// or closed instead of being caught at compile time.
export interface RequestUser {
  id?: string;
  email?: string;
  role?: string;
}

export type AuthedRequest = Request;
