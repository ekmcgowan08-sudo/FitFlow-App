// tests/token.service.test.ts
// Unit tests for auth/token.service.ts: issuing, rotating, and revoking
// refresh tokens, including reuse detection.

import jwt from "jsonwebtoken";
import { prismaMock } from "../__mocks__/@prisma/client";
import {
  issueTokenPair,
  rotateRefreshToken,
  revokeRefreshToken,
  hashRefreshToken,
} from "../src/auth/token.service";

const userId = "11111111-1111-1111-1111-111111111111";
const email = "athlete@example.com";

describe("token.service", () => {
  beforeEach(() => {
    prismaMock.refreshToken.create.mockResolvedValue({ id: "rt-new-id" });
    prismaMock.refreshToken.update.mockResolvedValue({});
    prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 1 });
  });

  describe("issueTokenPair", () => {
    it("signs an access token carrying sub/email/jti claims", async () => {
      const pair = await issueTokenPair(userId, email);

      const decoded = jwt.decode(pair.accessToken) as jwt.JwtPayload;
      expect(decoded.sub).toBe(userId);
      expect(decoded.email).toBe(email);
      expect(typeof decoded.jti).toBe("string");
      expect(pair.tokenType).toBe("Bearer");
      expect(pair.accessTokenExpiresIn).toBeGreaterThan(0);
    });

    it("stores only an HMAC hash of the refresh token, never the plaintext", async () => {
      const pair = await issueTokenPair(userId, email);

      expect(prismaMock.refreshToken.create).toHaveBeenCalledTimes(1);
      const createArgs = prismaMock.refreshToken.create.mock.calls[0][0];
      expect(createArgs.data.tokenHash).toBe(hashRefreshToken(pair.refreshToken));
      expect(createArgs.data.tokenHash).not.toBe(pair.refreshToken);
      expect(createArgs.data.userId).toBe(userId);
    });

    it("revokes the prior token and links replacedBy when rotating", async () => {
      await issueTokenPair(userId, email, "rt-old-id");

      // A conditional `updateMany` (WHERE id AND revokedAt IS NULL), not a
      // plain `update` keyed only on id — see the comment in
      // token.service.ts on why this needs to be a compare-and-swap.
      expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { id: "rt-old-id", revokedAt: null },
        data: { revokedAt: expect.any(Date), replacedBy: "rt-new-id" },
      });
    });

    it("does not touch any prior token when rotatedFromId is omitted", async () => {
      await issueTokenPair(userId, email);
      expect(prismaMock.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it("rolls back and throws when the prior token was already rotated by a concurrent request", async () => {
      prismaMock.refreshToken.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(issueTokenPair(userId, email, "rt-old-id")).rejects.toThrow(
        "Refresh token has already been used"
      );
    });
  });

  describe("rotateRefreshToken", () => {
    it("issues a new pair and revokes the presented token on a valid rotation", async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValueOnce({
        id: "rt-1",
        userId,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        user: { id: userId, email, status: "active" },
      });

      const pair = await rotateRefreshToken("valid-refresh-token");

      expect(pair.accessToken).toBeDefined();
      expect(pair.refreshToken).toBeDefined();
      expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { id: "rt-1", revokedAt: null },
        data: { revokedAt: expect.any(Date), replacedBy: "rt-new-id" },
      });
    });

    it("rejects an unknown refresh token with 'Invalid refresh token'", async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValueOnce(null);

      await expect(rotateRefreshToken("does-not-exist")).rejects.toThrow(
        "Invalid refresh token"
      );
    });

    it("rejects reuse of an already-rotated token and revokes ALL sessions for the user", async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValueOnce({
        id: "rt-1",
        userId,
        revokedAt: new Date(), // already used once before — reuse!
        expiresAt: new Date(Date.now() + 60_000),
        user: { id: userId, email, status: "active" },
      });

      await expect(rotateRefreshToken("already-rotated-token")).rejects.toThrow(
        /reuse detected/i
      );

      expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      // Reuse is a hard stop — no new pair should ever be issued.
      expect(prismaMock.refreshToken.create).not.toHaveBeenCalled();
    });

    it("rejects an expired refresh token", async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValueOnce({
        id: "rt-1",
        userId,
        revokedAt: null,
        expiresAt: new Date(Date.now() - 60_000), // already expired
        user: { id: userId, email, status: "active" },
      });

      await expect(rotateRefreshToken("expired-token")).rejects.toThrow(
        "Refresh token has expired"
      );
    });

    it("rejects a token belonging to a non-active account", async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValueOnce({
        id: "rt-1",
        userId,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        user: { id: userId, email, status: "suspended" },
      });

      await expect(rotateRefreshToken("token-for-suspended-user")).rejects.toThrow(
        "Account is not active"
      );
    });
  });

  describe("revokeRefreshToken", () => {
    it("revokes a single session by default", async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValueOnce({ id: "rt-1", userId });

      await revokeRefreshToken("some-token");

      expect(prismaMock.refreshToken.update).toHaveBeenCalledWith({
        where: { id: "rt-1" },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prismaMock.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it("revokes every session for the user when allSessions=true", async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValueOnce({ id: "rt-1", userId });

      await revokeRefreshToken("some-token", true);

      expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prismaMock.refreshToken.update).not.toHaveBeenCalled();
    });

    it("is a silent no-op for an unknown token (idempotent logout)", async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValueOnce(null);

      await expect(revokeRefreshToken("unknown-token")).resolves.toBeUndefined();
      expect(prismaMock.refreshToken.update).not.toHaveBeenCalled();
      expect(prismaMock.refreshToken.updateMany).not.toHaveBeenCalled();
    });
  });
});
