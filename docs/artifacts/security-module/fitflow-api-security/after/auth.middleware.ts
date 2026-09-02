// after/auth.middleware.ts
// Remediated authentication middleware.

import { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { PrismaClient, RoleCode } from "@prisma/client";
import { AuthenticatedRequest, RequestUser } from "./types";
import { UnauthorizedError } from "../rbac/errors";
import { JWT_ACCESS_SECRET, JWT_ISSUER, JWT_AUDIENCE } from "../rbac/env";

const prisma = new PrismaClient();

// FIX (secure JWT handling): the access-token secret is loaded once from
// rbac/env.ts, which throws at process startup if it's missing — no
// request-time fallback to a guessable default. auth.routes.ts signs
// tokens with this exact same secret/issuer/audience.

interface FitFlowAccessTokenPayload extends JwtPayload {
  sub: string; // user id
  email: string;
  jti: string; // token id, used for revocation checks
}

/**
 * authenticate — verifies the bearer JWT and attaches a strongly-typed,
 * database-confirmed user context to the request.
 *
 * Every fix below maps to a numbered finding in SECURITY_AUDIT_REPORT.md.
 */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    // FIX: token is read only from the Authorization header. The query
    // string fallback is removed so bearer tokens never end up in access
    // logs, proxy logs, or browser history.
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedError("Missing or malformed Authorization header");
    }
    const token = header.slice("Bearer ".length).trim();
    if (!token) {
      throw new UnauthorizedError("Missing bearer token");
    }

    // FIX: explicit algorithm allow-list, issuer, and audience checks close
    // off algorithm-confusion and cross-service token reuse attacks.
    // clockTolerance smooths small clock drift without disabling
    // expiration checks — `exp` is still enforced by jsonwebtoken.
    const payload = jwt.verify(token, JWT_ACCESS_SECRET, {
      algorithms: ["HS256"],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      clockTolerance: 5,
    }) as FitFlowAccessTokenPayload;

    if (!payload.sub || !payload.jti) {
      throw new UnauthorizedError("Token is missing required claims");
    }

    // FIX (Prisma query scoping + defense in depth): the role in the JWT
    // is treated as a hint only. The authoritative role list, and whether
    // the account is still active, is re-read from the database on every
    // request. This means a role revoked mid-session (e.g. an admin
    // demoted or a banned user) takes effect immediately instead of
    // waiting for the access token to expire.
    const dbUser = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        status: true,
        roles: { select: { role: { select: { code: true } } } },
      },
    });

    if (!dbUser || dbUser.status !== "active") {
      throw new UnauthorizedError("Account is not active");
    }

    const roles: RoleCode[] = dbUser.roles.map((r) => r.role.code);
    if (roles.length === 0) {
      throw new UnauthorizedError("Account has no assigned roles");
    }

    const requestUser: RequestUser = {
      id: dbUser.id,
      email: dbUser.email,
      roles,
      tokenId: payload.jti,
    };

    (req as AuthenticatedRequest).user = requestUser;
    next();
  } catch (err) {
    // FIX (status code consistency): every authentication failure —
    // malformed header, expired token, bad signature, inactive account —
    // now maps to a single, predictable 401 with a generic message.
    // Internal error detail is logged server-side, never returned to the
    // client, so failures can't be used to fingerprint the auth stack.
    console.error("[auth] token verification failed:", (err as Error).message);
    return res.status(401).json({
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required",
      },
    });
  }
}
