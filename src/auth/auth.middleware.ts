import { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { RoleCode } from "@prisma/client";
import { prisma } from "../lib/prisma-client";
import { AuthenticatedRequest, RequestUser } from "./types";
import { UnauthorizedError } from "../lib/errors";
import { JWT_ACCESS_SECRET, JWT_ISSUER, JWT_AUDIENCE } from "../lib/env";

interface FitFlowAccessTokenPayload extends JwtPayload {
  sub: string; // user id
  email: string;
  jti: string; // token id, used for revocation checks
}

/**
 * authenticate — verifies the bearer JWT and attaches a strongly-typed,
 * database-confirmed user context to the request.
 *
 * - Token is read only from the Authorization header (never a query
 *   string fallback), so bearer tokens never end up in access logs, proxy
 *   logs, or browser history.
 * - `jwt.verify` pins an explicit algorithm allow-list, issuer, and
 *   audience, closing off algorithm-confusion and cross-service token
 *   reuse attacks.
 * - The role in the JWT is a hint only. The authoritative role list, and
 *   whether the account is still active, is re-read from the database on
 *   every request, so a role revoked mid-session takes effect immediately
 *   instead of waiting for the access token to expire.
 */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedError("Missing or malformed Authorization header");
    }
    const token = header.slice("Bearer ".length).trim();
    if (!token) {
      throw new UnauthorizedError("Missing bearer token");
    }

    const payload = jwt.verify(token, JWT_ACCESS_SECRET, {
      algorithms: ["HS256"],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      clockTolerance: 5,
    }) as FitFlowAccessTokenPayload;

    if (!payload.sub || !payload.jti) {
      throw new UnauthorizedError("Token is missing required claims");
    }

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
    // Every authentication failure — malformed header, expired token, bad
    // signature, inactive account — maps to a single, predictable 401
    // with a generic message. Internal error detail is logged
    // server-side, never returned to the client.
    console.error("[auth] token verification failed:", (err as Error).message);
    return res.status(401).json({
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required",
      },
    });
  }
}
