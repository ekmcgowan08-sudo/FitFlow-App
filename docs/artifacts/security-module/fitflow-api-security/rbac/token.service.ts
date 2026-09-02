// rbac/token.service.ts
// Refresh token rotation, built on the Prisma `RefreshToken` model
// (prisma/schema.prisma). Used by after/auth.routes.ts for login,
// refresh, and logout.
//
// Design:
// - Access tokens are short-lived signed JWTs (see rbac/token.config.ts).
// - Refresh tokens are opaque, high-entropy random strings — never JWTs.
//   Only an HMAC of the token (keyed with REFRESH_TOKEN_PEPPER) is stored
//   in the database, so a leaked database dump doesn't hand out usable
//   refresh tokens.
// - Every refresh call ROTATES: the presented token is revoked and a new
//   one is issued in the same DB transaction as part of `issueTokenPair`.
//   A refresh token can only ever be used once.
// - If a caller presents a token that's already been revoked (i.e. it was
//   already rotated once before), that's a signal the token was copied or
//   stolen — every refresh token for that user is revoked immediately,
//   forcing re-authentication everywhere.

import crypto from "crypto";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { JWT_ACCESS_SECRET, JWT_ISSUER, JWT_AUDIENCE, REFRESH_TOKEN_PEPPER } from "./env";
import { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_DAYS } from "./token.config";
import { UnauthorizedError } from "./errors";

const prisma = new PrismaClient();

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  accessTokenExpiresIn: number; // seconds
  refreshTokenExpiresAt: Date;
}

export function hashRefreshToken(token: string): string {
  return crypto.createHmac("sha256", REFRESH_TOKEN_PEPPER).update(token).digest("hex");
}

function generateOpaqueToken(): string {
  return crypto.randomBytes(48).toString("base64url");
}

/**
 * issueTokenPair — creates a new access token and a brand-new refresh
 * token row. If `rotatedFromId` is provided, the old refresh token row is
 * revoked and linked to the new one (`replacedBy`) in the SAME database
 * transaction as the create, so a mid-request crash can never leave two
 * simultaneously-valid refresh tokens for one login session.
 */
export async function issueTokenPair(
  userId: string,
  email: string,
  rotatedFromId?: string
): Promise<TokenPair> {
  const jti = crypto.randomUUID();
  const accessToken = jwt.sign({ email, jti }, JWT_ACCESS_SECRET, {
    subject: userId,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    algorithm: "HS256",
  });

  const refreshTokenPlain = generateOpaqueToken();
  const refreshTokenHash = hashRefreshToken(refreshTokenPlain);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.$transaction(async (tx) => {
    const created = await tx.refreshToken.create({
      data: { userId, tokenHash: refreshTokenHash, expiresAt },
    });

    if (rotatedFromId) {
      await tx.refreshToken.update({
        where: { id: rotatedFromId },
        data: { revokedAt: new Date(), replacedBy: created.id },
      });
    }
  });

  return {
    accessToken,
    refreshToken: refreshTokenPlain,
    tokenType: "Bearer",
    accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS,
    refreshTokenExpiresAt: expiresAt,
  };
}

/**
 * rotateRefreshToken — validates a presented refresh token and, if it's
 * valid and unused, atomically issues a replacement pair (rotation).
 * Throws UnauthorizedError (401) for every failure mode, including reuse.
 */
export async function rotateRefreshToken(refreshTokenPlain: string): Promise<TokenPair> {
  const tokenHash = hashRefreshToken(refreshTokenPlain);

  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: { select: { id: true, email: true, status: true } } },
  });

  if (!existing) {
    throw new UnauthorizedError("Invalid refresh token");
  }

  if (existing.revokedAt) {
    // Reuse of a token that was already rotated (or explicitly logged
    // out) once before. Treat as compromise: burn every live refresh
    // token this user has, so a stolen token can't keep extending itself.
    await prisma.refreshToken.updateMany({
      where: { userId: existing.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw new UnauthorizedError(
      "Refresh token reuse detected; all sessions have been revoked. Please log in again."
    );
  }

  if (existing.expiresAt.getTime() < Date.now()) {
    throw new UnauthorizedError("Refresh token has expired");
  }

  if (!existing.user || existing.user.status !== "active") {
    throw new UnauthorizedError("Account is not active");
  }

  return issueTokenPair(existing.user.id, existing.user.email, existing.id);
}

/**
 * revokeRefreshToken — used by logout.
 * @param allSessions  when true, revokes every active refresh token for
 *   the user ("log out everywhere") instead of just the presented one.
 *
 * Intentionally idempotent: presenting an unknown or already-revoked
 * token is a no-op, not an error, so logout can't be used to probe for
 * valid tokens.
 */
export async function revokeRefreshToken(
  refreshTokenPlain: string,
  allSessions = false
): Promise<void> {
  const tokenHash = hashRefreshToken(refreshTokenPlain);
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } });
  if (!existing) return;

  if (allSessions) {
    await prisma.refreshToken.updateMany({
      where: { userId: existing.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return;
  }

  await prisma.refreshToken.update({
    where: { id: existing.id },
    data: { revokedAt: new Date() },
  });
}
