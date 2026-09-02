// after/auth.routes.ts
// Registration, login, refresh, and logout, wired to the refresh-token
// rotation service (rbac/token.service.ts) and rate limiters
// (rbac/rate-limit.middleware.ts).

import { Router, Request, Response, NextFunction } from "express";
import { PrismaClient, RoleCode } from "@prisma/client";
import bcrypt from "bcryptjs";
import { ValidationError, UnauthorizedError, ConflictError } from "../rbac/errors";
import { issueTokenPair, rotateRefreshToken, revokeRefreshToken } from "../rbac/token.service";
import {
  loginRateLimiter,
  refreshRateLimiter,
  registerRateLimiter,
} from "../rbac/rate-limit.middleware";

const prisma = new PrismaClient();
const router = Router();

const BCRYPT_COST_FACTOR = 12;
const MIN_PASSWORD_LENGTH = 8;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function tokenPairResponseBody(tokens: {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  accessTokenExpiresIn: number;
  refreshTokenExpiresAt: Date;
}) {
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    tokenType: tokens.tokenType,
    accessTokenExpiresIn: tokens.accessTokenExpiresIn,
    refreshTokenExpiresAt: tokens.refreshTokenExpiresAt.toISOString(),
  };
}

// POST /v1/auth/register
router.post(
  "/auth/register",
  registerRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body as { email?: unknown; password?: unknown };

      if (!isNonEmptyString(email) || !isNonEmptyString(password)) {
        throw new ValidationError("email and password are required");
      }
      if (password.length < MIN_PASSWORD_LENGTH) {
        throw new ValidationError(`password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      }

      const normalizedEmail = email.trim().toLowerCase();
      const existing = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictError("An account with this email already exists");
      }

      const passwordHash = await bcrypt.hash(password, BCRYPT_COST_FACTOR);

      // FIX applied here too: default role is looked up/created by code,
      // never taken from the request body — a client can't self-assign
      // ADMIN or COACH at registration time.
      const defaultRole = await prisma.role.upsert({
        where: { code: RoleCode.USER },
        update: {},
        create: { code: RoleCode.USER },
      });

      const user = await prisma.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          roles: { create: [{ roleId: defaultRole.id }] },
        },
        select: { id: true, email: true },
      });

      const tokens = await issueTokenPair(user.id, user.email);
      return res.status(201).json({ user, ...tokenPairResponseBody(tokens) });
    } catch (err) {
      return next(err);
    }
  }
);

// POST /v1/auth/login
router.post(
  "/auth/login",
  loginRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body as { email?: unknown; password?: unknown };
      if (!isNonEmptyString(email) || !isNonEmptyString(password)) {
        throw new ValidationError("email and password are required");
      }

      const normalizedEmail = email.trim().toLowerCase();
      const user = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true, email: true, passwordHash: true, status: true },
      });

      // FIX (status code / info leak consistency): "no such user" and
      // "wrong password" return the exact same 401 and message — never
      // reveal which part of the credential pair was wrong.
      const genericFailure = () => new UnauthorizedError("Invalid email or password");

      if (!user || user.status !== "active") {
        throw genericFailure();
      }

      const passwordMatches = await bcrypt.compare(password, user.passwordHash);
      if (!passwordMatches) {
        throw genericFailure();
      }

      const tokens = await issueTokenPair(user.id, user.email);
      return res.status(200).json({
        user: { id: user.id, email: user.email },
        ...tokenPairResponseBody(tokens),
      });
    } catch (err) {
      return next(err);
    }
  }
);

// POST /v1/auth/refresh
router.post(
  "/auth/refresh",
  refreshRateLimiter,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { refreshToken } = req.body as { refreshToken?: unknown };
      if (!isNonEmptyString(refreshToken)) {
        throw new ValidationError("refreshToken is required");
      }

      // rotateRefreshToken revokes the presented token and issues a new
      // pair atomically, and throws UnauthorizedError on reuse/expiry —
      // see rbac/token.service.ts for the full rotation + reuse-detection
      // logic.
      const tokens = await rotateRefreshToken(refreshToken);
      return res.status(200).json(tokenPairResponseBody(tokens));
    } catch (err) {
      return next(err);
    }
  }
);

// POST /v1/auth/logout
router.post("/auth/logout", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken, allSessions } = req.body as {
      refreshToken?: unknown;
      allSessions?: unknown;
    };

    // Logout is intentionally lenient on input — a missing/invalid token
    // still returns 204, since the end state ("client holds no valid
    // session") is the same either way. See revokeRefreshToken's
    // idempotency note in rbac/token.service.ts.
    if (isNonEmptyString(refreshToken)) {
      await revokeRefreshToken(refreshToken, allSessions === true);
    }

    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
});

export default router;
