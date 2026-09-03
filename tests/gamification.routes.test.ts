// tests/gamification.routes.test.ts
// Tests for src/routes/gamification.routes.ts: reads = self or
// ADMIN/COACH; writes = ADMIN only (system-awarded, never client-authored).

import request from "supertest";
import jwt from "jsonwebtoken";
import { prismaMock } from "../__mocks__/@prisma/client";
import { createApp } from "../src/app";
import { JWT_ACCESS_SECRET, JWT_ISSUER, JWT_AUDIENCE } from "../src/lib/env";

const app = createApp();

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";
const ACHIEVEMENT_ID = "33333333-3333-4333-8333-333333333333";

function tokenFor(userId: string) {
  return jwt.sign({ email: "athlete@example.com", jti: `jti-${userId}` }, JWT_ACCESS_SECRET, {
    subject: userId,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    expiresIn: 900,
    algorithm: "HS256",
  });
}

function mockAuthedUser(userId: string, roles: string[] = ["USER"]) {
  prismaMock.user.findUnique.mockResolvedValueOnce({
    id: userId,
    email: "athlete@example.com",
    status: "active",
    roles: roles.map((code) => ({ role: { code } })),
  });
}

describe("gamification routes", () => {
  describe("GET /v1/badges", () => {
    it("defaults to the caller's own userId", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.badge.findMany.mockResolvedValueOnce([]);

      const res = await request(app).get("/v1/badges").set("Authorization", `Bearer ${tokenFor(USER_ID)}`);

      expect(res.status).toBe(200);
      expect(prismaMock.badge.findMany.mock.calls[0][0].where.userId).toBe(USER_ID);
    });

    it("forbids a plain user from viewing another member's badges", async () => {
      mockAuthedUser(USER_ID, ["USER"]);

      const res = await request(app)
        .get(`/v1/badges?userId=${OTHER_ID}`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`);

      expect(res.status).toBe(403);
    });
  });

  describe("POST /v1/badges", () => {
    it("forbids a non-admin (even the badge's own owner) from awarding a badge", async () => {
      mockAuthedUser(USER_ID, ["USER"]);

      const res = await request(app)
        .post("/v1/badges")
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`)
        .send({ userId: USER_ID, name: "First Workout" });

      expect(res.status).toBe(403);
      expect(prismaMock.badge.create).not.toHaveBeenCalled();
    });

    it("lets an ADMIN award a badge", async () => {
      mockAuthedUser("admin-1", ["ADMIN"]);
      prismaMock.badge.create.mockResolvedValueOnce({ id: "b1", userId: USER_ID, name: "First Workout" });

      const res = await request(app)
        .post("/v1/badges")
        .set("Authorization", `Bearer ${tokenFor("admin-1")}`)
        .send({ userId: USER_ID, name: "First Workout" });

      expect(res.status).toBe(201);
    });
  });

  describe("DELETE /v1/badges/:id", () => {
    const BADGE_ID = "44444444-4444-4444-8444-444444444444";

    it("forbids a non-admin from revoking a badge", async () => {
      mockAuthedUser(USER_ID, ["USER"]);

      const res = await request(app)
        .delete(`/v1/badges/${BADGE_ID}`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`);

      expect(res.status).toBe(403);
      expect(prismaMock.badge.delete).not.toHaveBeenCalled();
    });

    it("lets an ADMIN revoke a wrongly-awarded badge", async () => {
      mockAuthedUser("admin-1", ["ADMIN"]);
      prismaMock.badge.findUnique.mockResolvedValueOnce({ id: BADGE_ID, userId: USER_ID });
      prismaMock.badge.delete.mockResolvedValueOnce({ id: BADGE_ID });

      const res = await request(app)
        .delete(`/v1/badges/${BADGE_ID}`)
        .set("Authorization", `Bearer ${tokenFor("admin-1")}`);

      expect(res.status).toBe(204);
    });

    it("returns 404 for a badge that doesn't exist", async () => {
      mockAuthedUser("admin-1", ["ADMIN"]);
      prismaMock.badge.findUnique.mockResolvedValueOnce(null);

      const res = await request(app)
        .delete(`/v1/badges/${BADGE_ID}`)
        .set("Authorization", `Bearer ${tokenFor("admin-1")}`);

      expect(res.status).toBe(404);
      expect(prismaMock.badge.delete).not.toHaveBeenCalled();
    });
  });

  describe("GET /v1/achievements", () => {
    it("lets a COACH view an actively-assigned client's achievements", async () => {
      mockAuthedUser("coach-1", ["COACH"]);
      prismaMock.coachAssignment.findUnique.mockResolvedValueOnce({ relationshipStatus: "active" });
      prismaMock.achievement.findMany.mockResolvedValueOnce([]);

      const res = await request(app)
        .get(`/v1/achievements?userId=${OTHER_ID}`)
        .set("Authorization", `Bearer ${tokenFor("coach-1")}`);

      expect(res.status).toBe(200);
      expect(prismaMock.achievement.findMany.mock.calls[0][0].where.userId).toBe(OTHER_ID);
    });

    it("forbids a COACH with no active assignment from viewing a member's achievements", async () => {
      mockAuthedUser("coach-1", ["COACH"]);
      prismaMock.coachAssignment.findUnique.mockResolvedValueOnce(null);

      const res = await request(app)
        .get(`/v1/achievements?userId=${OTHER_ID}`)
        .set("Authorization", `Bearer ${tokenFor("coach-1")}`);

      expect(res.status).toBe(403);
      expect(prismaMock.achievement.findMany).not.toHaveBeenCalled();
    });
  });

  describe("PATCH /v1/achievements/:id", () => {
    it("forbids a non-admin from updating achievement progress", async () => {
      mockAuthedUser(USER_ID, ["USER"]);

      const res = await request(app)
        .patch(`/v1/achievements/${ACHIEVEMENT_ID}`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`)
        .send({ progressPercent: 50 });

      expect(res.status).toBe(403);
      expect(prismaMock.achievement.update).not.toHaveBeenCalled();
    });

    it("lets an ADMIN update achievement progress", async () => {
      mockAuthedUser("admin-1", ["ADMIN"]);
      prismaMock.achievement.findUnique.mockResolvedValueOnce({ id: ACHIEVEMENT_ID, userId: USER_ID });
      prismaMock.achievement.update.mockResolvedValueOnce({ id: ACHIEVEMENT_ID, progressPercent: 50 });

      const res = await request(app)
        .patch(`/v1/achievements/${ACHIEVEMENT_ID}`)
        .set("Authorization", `Bearer ${tokenFor("admin-1")}`)
        .send({ progressPercent: 50 });

      expect(res.status).toBe(200);
    });

    it("returns 404 for an achievement that doesn't exist", async () => {
      mockAuthedUser("admin-1", ["ADMIN"]);
      prismaMock.achievement.findUnique.mockResolvedValueOnce(null);

      const res = await request(app)
        .patch(`/v1/achievements/${ACHIEVEMENT_ID}`)
        .set("Authorization", `Bearer ${tokenFor("admin-1")}`)
        .send({ progressPercent: 50 });

      expect(res.status).toBe(404);
    });
  });
});
