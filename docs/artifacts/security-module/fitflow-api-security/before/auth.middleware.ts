// before/auth.middleware.ts
// Original authentication middleware found in the FitFlow Suite API.
// Flagged in the audit under "Secure JWT handling".

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

// VULNERABLE: silent fallback secret. If JWT_SECRET is ever unset in an
// environment (a misconfigured staging box, a CI job, a container that
// dropped its env file), the API starts signing and verifying tokens with
// a hardcoded, publicly-known string instead of failing loudly.
const JWT_SECRET = process.env.JWT_SECRET || "fitflow-dev-secret";

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    // VULNERABLE: token is accepted from the query string as a fallback.
    // Query strings get logged by proxies, CDNs, and browser history, so
    // this leaks bearer tokens into infrastructure that was never designed
    // to hold secrets.
    const header = req.headers.authorization;
    const token = header?.split(" ")[1] || (req.query.token as string);

    if (!token) {
      // VULNERABLE (status code consistency): treats "no token" as
      // "anonymous" and lets the request continue instead of rejecting it.
      // Downstream handlers are trusted to remember to check `req.user`
      // themselves — one missed check anywhere is an unauthenticated
      // data leak.
      return next();
    }

    // VULNERABLE: no `algorithms` allow-list is passed to jwt.verify().
    // If the signing key material or library configuration ever changes,
    // this is exposed to classic algorithm-confusion attacks (e.g. a
    // token signed with `alg: none` or with a mismatched key type being
    // accepted as valid).
    const payload = jwt.verify(token, JWT_SECRET) as any;

    // VULNERABLE: the entire decoded payload — which may include stale or
    // client-influenced claims — is attached directly to the request with
    // no shape validation, and the role is trusted as-is from the token
    // rather than re-checked against the database.
    req.user = payload;

    next();
  } catch (err) {
    // VULNERABLE (status code consistency): an invalid/expired token
    // returns 500 instead of 401, and leaks the raw error message
    // (including library internals) to the client.
    return res.status(500).json({ error: (err as Error).message });
  }
}
