// tests/auth.routes.test.ts
// Integration-style unit tests for auth/auth.routes.ts, driven through
// the real Express app (src/app.ts) with a mocked Prisma client. Each
// test uses a distinct email/refresh token so it doesn't collide with the
// per-key rate limiters (see tests/rate-limit.middleware.test.ts for
// dedicated limiter tests).

import request from "supertest";
import bcrypt from "bcryptjs";
import { prismaMock } from "../__mocks__/@prisma/client";
import { createApp } from "../src/app";

const app = createApp();

// Low cost factor keeps these tests fast; bcrypt.compare works the same
// regardless of the cost factor encoded in the hash.
const TEST_PASSWORD = "correct-horse-battery-staple";
const TEST_PASSWORD_HASH = bcrypt.hashSync(TEST_PASSWORD, 4);

describe("auth routes", () => {
  describe("POST /v1/auth/register", () => {
    it("creates a new account with the default USER role and returns a token pair", async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(null); // no existing account
      prismaMock.role.upsert.mockResolvedValueOnce({ id: 1, code: "USER" });
      prismaMock.user.create.mockResolvedValueOnce({
        id: "user-1",
        email: "new.athlete@example.com",
      });
      prismaMock.refreshToken.create.mockResolvedValueOnce({ id: "rt-1" });

      const res = await request(app).post("/v1/auth/register").send({
        email: "New.Athlete@Example.com",
        password: TEST_PASSWORD,
      });

      expect(res.status).toBe(201);
      expect(res.body.user).toEqual({ id: "user-1", email: "new.athlete@example.com" });
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      expect(res.body.tokenType).toBe("Bearer");

      // Email is normalized (lowercased) before lookup/create.
      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { email: "new.athlete@example.com" },
        select: { id: true },
      });

      // Role assignment always comes from server-side lookup, never the
      // request body — a client can't self-assign ADMIN/COACH at signup.
      expect(prismaMock.role.upsert).toHaveBeenCalledWith({
        where: { code: "USER" },
        update: {},
        create: { code: "USER" },
      });
      const createArgs = prismaMock.user.create.mock.calls[0][0];
      expect(createArgs.data.roles.create).toEqual([{ roleId: 1 }]);
      expect(createArgs.data.passwordHash).not.toBe(TEST_PASSWORD); // never store plaintext
    });

    it("rejects a duplicate email with 409 CONFLICT", async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({ id: "existing-user" });

      const res = await request(app).post("/v1/auth/register").send({
        email: "taken@example.com",
        password: TEST_PASSWORD,
      });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("CONFLICT");
      expect(prismaMock.user.create).not.toHaveBeenCalled();
    });

    it("rejects a too-short password with 400 before touching the database", async () => {
      const res = await request(app).post("/v1/auth/register").send({
        email: "short-password@example.com",
        password: "short",
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    });
  });

  describe("POST /v1/auth/login", () => {
    it("logs in with valid credentials and returns a token pair", async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: "user-1",
        email: "athlete@example.com",
        passwordHash: TEST_PASSWORD_HASH,
        status: "active",
      });
      prismaMock.refreshToken.create.mockResolvedValueOnce({ id: "rt-1" });

      const res = await request(app).post("/v1/auth/login").send({
        email: "athlete@example.com",
        password: TEST_PASSWORD,
      });

      expect(res.status).toBe(200);
      expect(res.body.user).toEqual({ id: "user-1", email: "athlete@example.com" });
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
    });

    it("returns a generic 401 for an unknown email (no user-existence leak)", async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce(null);

      const res = await request(app).post("/v1/auth/login").send({
        email: "ghost@example.com",
        password: "whatever-12345",
      });

      expect(res.status).toBe(401);
      expect(res.body.error.message).toBe("Invalid email or password");
    });

    it("returns the SAME generic 401 for a wrong password", async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: "user-2",
        email: "athlete2@example.com",
        passwordHash: TEST_PASSWORD_HASH,
        status: "active",
      });

      const res = await request(app).post("/v1/auth/login").send({
        email: "athlete2@example.com",
        password: "totally-the-wrong-password",
      });

      expect(res.status).toBe(401);
      expect(res.body.error.message).toBe("Invalid email or password");
    });

    it("rejects login for a non-active account", async () => {
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: "user-3",
        email: "suspended@example.com",
        passwordHash: TEST_PASSWORD_HASH,
        status: "suspended",
      });

      const res = await request(app).post("/v1/auth/login").send({
        email: "suspended@example.com",
        password: TEST_PASSWORD,
      });

      expect(res.status).toBe(401);
    });
  });

  describe("POST /v1/auth/refresh", () => {
    it("rotates a valid refresh token into a new pair", async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValueOnce({
        id: "rt-1",
        userId: "user-1",
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        user: { id: "user-1", email: "athlete@example.com", status: "active" },
      });
      prismaMock.refreshToken.create.mockResolvedValueOnce({ id: "rt-2" });

      const res = await request(app)
        .post("/v1/auth/refresh")
        .send({ refreshToken: "a-valid-refresh-token" });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
    });

    it("rejects a reused (already-rotated) refresh token with 401", async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValueOnce({
        id: "rt-1",
        userId: "user-1",
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
        user: { id: "user-1", email: "athlete@example.com", status: "active" },
      });

      const res = await request(app)
        .post("/v1/auth/refresh")
        .send({ refreshToken: "already-rotated-token" });

      expect(res.status).toBe(401);
      expect(res.body.error.message).toMatch(/reuse detected/i);
    });

    it("requires refreshToken in the request body", async () => {
      const res = await request(app).post("/v1/auth/refresh").send({});
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("POST /v1/auth/logout", () => {
    it("revokes the presented session and returns 204", async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValueOnce({
        id: "rt-1",
        userId: "user-1",
      });

      const res = await request(app)
        .post("/v1/auth/logout")
        .send({ refreshToken: "session-token" });

      expect(res.status).toBe(204);
      expect(prismaMock.refreshToken.update).toHaveBeenCalledWith({
        where: { id: "rt-1" },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it("revokes every session when allSessions=true", async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValueOnce({
        id: "rt-1",
        userId: "user-1",
      });

      const res = await request(app)
        .post("/v1/auth/logout")
        .send({ refreshToken: "session-token", allSessions: true });

      expect(res.status).toBe(204);
      expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: "user-1", revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it("returns 204 even for an unknown token (idempotent)", async () => {
      prismaMock.refreshToken.findUnique.mockResolvedValueOnce(null);

      const res = await request(app)
        .post("/v1/auth/logout")
        .send({ refreshToken: "unknown-token" });

      expect(res.status).toBe(204);
    });
  });
});
