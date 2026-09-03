// tests/gym.routes.test.ts
// Tests for src/routes/gym.routes.ts: gym catalog (ADMIN writes, anyone
// reads) and check-in scoping/points rules.

import request from "supertest";
import jwt from "jsonwebtoken";
import { prismaMock } from "../__mocks__/@prisma/client";
import { createApp } from "../src/app";
import { JWT_ACCESS_SECRET, JWT_ISSUER, JWT_AUDIENCE } from "../src/lib/env";

const app = createApp();

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";
const GYM_ID = "33333333-3333-4333-8333-333333333333";

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

describe("gym routes", () => {
  describe("GET /v1/gyms", () => {
    it("lets any authenticated user browse gyms", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.gym.findMany.mockResolvedValueOnce([{ id: GYM_ID, name: "Downtown Gym" }]);
      prismaMock.gym.count.mockResolvedValueOnce(1);

      const res = await request(app).get("/v1/gyms").set("Authorization", `Bearer ${tokenFor(USER_ID)}`);

      expect(res.status).toBe(200);
      expect(res.body.gyms).toHaveLength(1);
    });
  });

  describe("POST /v1/gyms", () => {
    it("forbids a non-admin from creating a gym", async () => {
      mockAuthedUser(USER_ID, ["USER"]);

      const res = await request(app)
        .post("/v1/gyms")
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`)
        .send({ name: "New Gym" });

      expect(res.status).toBe(403);
      expect(prismaMock.gym.create).not.toHaveBeenCalled();
    });

    it("lets an ADMIN create a gym", async () => {
      mockAuthedUser("admin-1", ["ADMIN"]);
      prismaMock.gym.create.mockResolvedValueOnce({ id: GYM_ID, name: "New Gym" });

      const res = await request(app)
        .post("/v1/gyms")
        .set("Authorization", `Bearer ${tokenFor("admin-1")}`)
        .send({ name: "New Gym", city: "Austin" });

      expect(res.status).toBe(201);
    });
  });

  describe("PATCH /v1/gyms/:id", () => {
    it("forbids a non-admin from updating a gym", async () => {
      mockAuthedUser(USER_ID, ["USER"]);

      const res = await request(app)
        .patch(`/v1/gyms/${GYM_ID}`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`)
        .send({ city: "Dallas" });

      expect(res.status).toBe(403);
      expect(prismaMock.gym.update).not.toHaveBeenCalled();
    });

    it("lets an ADMIN update a gym", async () => {
      mockAuthedUser("admin-1", ["ADMIN"]);
      prismaMock.gym.findUnique.mockResolvedValueOnce({ id: GYM_ID, name: "Downtown Gym", city: "Austin" });
      prismaMock.gym.update.mockResolvedValueOnce({ id: GYM_ID, name: "Downtown Gym", city: "Dallas" });

      const res = await request(app)
        .patch(`/v1/gyms/${GYM_ID}`)
        .set("Authorization", `Bearer ${tokenFor("admin-1")}`)
        .send({ city: "Dallas" });

      expect(res.status).toBe(200);
      expect(res.body.gym.city).toBe("Dallas");
    });

    it("returns 404 for a gym that doesn't exist", async () => {
      mockAuthedUser("admin-1", ["ADMIN"]);
      prismaMock.gym.findUnique.mockResolvedValueOnce(null);

      const res = await request(app)
        .patch(`/v1/gyms/${GYM_ID}`)
        .set("Authorization", `Bearer ${tokenFor("admin-1")}`)
        .send({ city: "Dallas" });

      expect(res.status).toBe(404);
      expect(prismaMock.gym.update).not.toHaveBeenCalled();
    });
  });

  describe("DELETE /v1/gyms/:id", () => {
    it("forbids a non-admin from deleting a gym", async () => {
      mockAuthedUser(USER_ID, ["USER"]);

      const res = await request(app)
        .delete(`/v1/gyms/${GYM_ID}`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`);

      expect(res.status).toBe(403);
      expect(prismaMock.gym.delete).not.toHaveBeenCalled();
    });

    it("lets an ADMIN delete an unused gym", async () => {
      mockAuthedUser("admin-1", ["ADMIN"]);
      prismaMock.gym.findUnique.mockResolvedValueOnce({ id: GYM_ID, name: "Downtown Gym" });
      prismaMock.gym.delete.mockResolvedValueOnce({ id: GYM_ID });

      const res = await request(app)
        .delete(`/v1/gyms/${GYM_ID}`)
        .set("Authorization", `Bearer ${tokenFor("admin-1")}`);

      expect(res.status).toBe(204);
    });

    it("returns 409 (not 500) when the gym still has check-ins", async () => {
      mockAuthedUser("admin-1", ["ADMIN"]);
      prismaMock.gym.findUnique.mockResolvedValueOnce({ id: GYM_ID, name: "Downtown Gym" });
      prismaMock.gym.delete.mockRejectedValueOnce(
        Object.assign(new Error("Foreign key constraint failed"), { code: "P2003" }),
      );

      const res = await request(app)
        .delete(`/v1/gyms/${GYM_ID}`)
        .set("Authorization", `Bearer ${tokenFor("admin-1")}`);

      expect(res.status).toBe(409);
    });
  });

  describe("GET /v1/gym-checkins", () => {
    it("defaults to the caller's own userId", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.gymCheckIn.findMany.mockResolvedValueOnce([]);
      prismaMock.gymCheckIn.count.mockResolvedValueOnce(0);

      const res = await request(app)
        .get("/v1/gym-checkins")
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`);

      expect(res.status).toBe(200);
      expect(prismaMock.gymCheckIn.findMany.mock.calls[0][0].where.userId).toBe(USER_ID);
    });

    it("forbids a plain user from listing another member's check-ins", async () => {
      mockAuthedUser(USER_ID, ["USER"]);

      const res = await request(app)
        .get(`/v1/gym-checkins?userId=${OTHER_ID}`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`);

      expect(res.status).toBe(403);
    });
  });

  describe("POST /v1/gym-checkins", () => {
    it("awards points for a QR check-in", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.gymCheckIn.create.mockResolvedValueOnce({ id: "ci-1", userId: USER_ID, pointsEarned: 10 });

      const res = await request(app)
        .post("/v1/gym-checkins")
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`)
        .send({ userId: USER_ID, gymId: GYM_ID, source: "qr" });

      expect(res.status).toBe(201);
      expect(prismaMock.gymCheckIn.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ pointsEarned: 10 }) }),
      );
    });

    it("awards zero points for an unverifiable manual check-in", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.gymCheckIn.create.mockResolvedValueOnce({ id: "ci-2", userId: USER_ID, pointsEarned: 0 });

      const res = await request(app)
        .post("/v1/gym-checkins")
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`)
        .send({ userId: USER_ID, gymId: GYM_ID, source: "manual" });

      expect(res.status).toBe(201);
      expect(prismaMock.gymCheckIn.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ pointsEarned: 0 }) }),
      );
    });

    it("advances the member's gym_checkin streak", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.gymCheckIn.create.mockResolvedValueOnce({ id: "ci-3", userId: USER_ID, pointsEarned: 10 });
      prismaMock.streak.findUnique.mockResolvedValueOnce(null);

      await request(app)
        .post("/v1/gym-checkins")
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`)
        .send({ userId: USER_ID, gymId: GYM_ID, source: "qr" });

      expect(prismaMock.streak.create).toHaveBeenCalledWith({
        data: { userId: USER_ID, streakType: "gym_checkin", currentCount: 1, bestCount: 1 },
      });
    });

    it("forbids checking in someone else without an elevated role", async () => {
      mockAuthedUser(USER_ID, ["USER"]);

      const res = await request(app)
        .post("/v1/gym-checkins")
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`)
        .send({ userId: OTHER_ID, gymId: GYM_ID, source: "qr" });

      expect(res.status).toBe(403);
      expect(prismaMock.gymCheckIn.create).not.toHaveBeenCalled();
    });
  });
});
