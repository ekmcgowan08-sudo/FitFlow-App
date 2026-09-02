// tests/nutrition-log.routes.test.ts
// Tests for src/routes/nutrition-log.routes.ts: same ownership scoping
// and 404-not-403 convention as goal.routes.test.ts.

import request from "supertest";
import jwt from "jsonwebtoken";
import { prismaMock } from "../__mocks__/@prisma/client";
import { createApp } from "../src/app";
import { JWT_ACCESS_SECRET, JWT_ISSUER, JWT_AUDIENCE } from "../src/lib/env";

const app = createApp();

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";
const LOG_ID = "33333333-3333-4333-8333-333333333333";

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

describe("nutrition-log routes", () => {
  describe("GET /v1/nutrition-logs", () => {
    it("defaults to the caller's own userId", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.nutritionLog.findMany.mockResolvedValueOnce([]);
      prismaMock.nutritionLog.count.mockResolvedValueOnce(0);

      const res = await request(app)
        .get("/v1/nutrition-logs")
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`);

      expect(res.status).toBe(200);
      expect(prismaMock.nutritionLog.findMany.mock.calls[0][0].where.userId).toBe(USER_ID);
    });

    it("forbids a plain user from listing another member's nutrition logs", async () => {
      mockAuthedUser(USER_ID, ["USER"]);

      const res = await request(app)
        .get(`/v1/nutrition-logs?userId=${OTHER_ID}`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`);

      expect(res.status).toBe(403);
      expect(prismaMock.nutritionLog.findMany).not.toHaveBeenCalled();
    });

    it("rejects to before from", async () => {
      mockAuthedUser(USER_ID);

      const res = await request(app)
        .get("/v1/nutrition-logs?from=2026-06-02T00:00:00Z&to=2026-01-01T00:00:00Z")
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`);

      expect(res.status).toBe(400);
    });
  });

  describe("POST /v1/nutrition-logs", () => {
    it("creates a nutrition log for the caller", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.nutritionLog.create.mockResolvedValueOnce({ id: LOG_ID, userId: USER_ID, itemName: "Oatmeal" });

      const res = await request(app)
        .post("/v1/nutrition-logs")
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`)
        .send({
          userId: USER_ID,
          loggedAt: new Date().toISOString(),
          mealType: "breakfast",
          itemName: "Oatmeal",
          calories: 300,
        });

      expect(res.status).toBe(201);
      expect(prismaMock.nutritionLog.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: USER_ID, itemName: "Oatmeal" }) }),
      );
    });

    it("forbids logging nutrition for someone else without an elevated role", async () => {
      mockAuthedUser(USER_ID, ["USER"]);

      const res = await request(app)
        .post("/v1/nutrition-logs")
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`)
        .send({
          userId: OTHER_ID,
          loggedAt: new Date().toISOString(),
          mealType: "breakfast",
          itemName: "Not yours",
        });

      expect(res.status).toBe(403);
      expect(prismaMock.nutritionLog.create).not.toHaveBeenCalled();
    });
  });

  describe("PATCH /v1/nutrition-logs/:id", () => {
    it("updates the caller's own entry", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.nutritionLog.findUnique.mockResolvedValueOnce({ userId: USER_ID });
      prismaMock.nutritionLog.update.mockResolvedValueOnce({ id: LOG_ID, calories: 350 });

      const res = await request(app)
        .patch(`/v1/nutrition-logs/${LOG_ID}`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`)
        .send({ calories: 350 });

      expect(res.status).toBe(200);
    });

    it("returns 404 for someone else's entry", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.nutritionLog.findUnique.mockResolvedValueOnce({ userId: OTHER_ID });

      const res = await request(app)
        .patch(`/v1/nutrition-logs/${LOG_ID}`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`)
        .send({ calories: 350 });

      expect(res.status).toBe(404);
      expect(prismaMock.nutritionLog.update).not.toHaveBeenCalled();
    });
  });

  describe("DELETE /v1/nutrition-logs/:id", () => {
    it("deletes the caller's own entry", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.nutritionLog.findUnique.mockResolvedValueOnce({ userId: USER_ID });
      prismaMock.nutritionLog.delete.mockResolvedValueOnce({ id: LOG_ID });

      const res = await request(app)
        .delete(`/v1/nutrition-logs/${LOG_ID}`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`);

      expect(res.status).toBe(204);
    });

    it("returns 404 for someone else's entry instead of deleting it", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.nutritionLog.findUnique.mockResolvedValueOnce({ userId: OTHER_ID });

      const res = await request(app)
        .delete(`/v1/nutrition-logs/${LOG_ID}`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`);

      expect(res.status).toBe(404);
      expect(prismaMock.nutritionLog.delete).not.toHaveBeenCalled();
    });
  });
});
