// tests/meal-plan.routes.test.ts
// Tests for src/routes/meal-plan.routes.ts.

import request from "supertest";
import jwt from "jsonwebtoken";
import { prismaMock } from "../__mocks__/@prisma/client";
import { createApp } from "../src/app";
import { JWT_ACCESS_SECRET, JWT_ISSUER, JWT_AUDIENCE } from "../src/lib/env";

const app = createApp();

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";
const PLAN_ID = "33333333-3333-4333-8333-333333333333";

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

describe("meal-plan routes", () => {
  describe("GET /v1/meal-plans", () => {
    it("defaults to the caller's own userId", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.mealPlan.findMany.mockResolvedValueOnce([]);
      prismaMock.mealPlan.count.mockResolvedValueOnce(0);

      const res = await request(app).get("/v1/meal-plans").set("Authorization", `Bearer ${tokenFor(USER_ID)}`);

      expect(res.status).toBe(200);
      expect(prismaMock.mealPlan.findMany.mock.calls[0][0].where.userId).toBe(USER_ID);
    });

    it("forbids a plain user from listing another member's meal plans", async () => {
      mockAuthedUser(USER_ID, ["USER"]);

      const res = await request(app)
        .get(`/v1/meal-plans?userId=${OTHER_ID}`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`);

      expect(res.status).toBe(403);
    });
  });

  describe("GET /v1/meal-plans/:id", () => {
    it("returns the plan with its meals when owned by the caller", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.mealPlan.findUnique.mockResolvedValueOnce({
        id: PLAN_ID,
        userId: USER_ID,
        title: "Cutting Plan",
        meals: [{ id: "m1", dayOfWeek: "Monday", mealType: "breakfast", recipeName: "Oatmeal" }],
      });

      const res = await request(app)
        .get(`/v1/meal-plans/${PLAN_ID}`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`);

      expect(res.status).toBe(200);
      expect(res.body.plan.meals).toHaveLength(1);
    });

    it("returns 404 (not 403) for a plan owned by someone else", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.mealPlan.findUnique.mockResolvedValueOnce({ id: PLAN_ID, userId: OTHER_ID });

      const res = await request(app)
        .get(`/v1/meal-plans/${PLAN_ID}`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`);

      expect(res.status).toBe(404);
    });
  });

  describe("POST /v1/meal-plans", () => {
    it("creates a plan with nested meals for the caller", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.mealPlan.create.mockResolvedValueOnce({ id: PLAN_ID, userId: USER_ID, title: "Cutting Plan" });

      const res = await request(app)
        .post("/v1/meal-plans")
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`)
        .send({
          userId: USER_ID,
          title: "Cutting Plan",
          dailyCalories: 2000,
          meals: [{ dayOfWeek: "Monday", mealType: "breakfast", recipeName: "Oatmeal", calories: 300 }],
        });

      expect(res.status).toBe(201);
      const createArgs = prismaMock.mealPlan.create.mock.calls[0][0];
      expect(createArgs.data.meals.create[0].recipeName).toBe("Oatmeal");
    });

    it("forbids creating a meal plan for someone else without an elevated role", async () => {
      mockAuthedUser(USER_ID, ["USER"]);

      const res = await request(app)
        .post("/v1/meal-plans")
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`)
        .send({ userId: OTHER_ID, title: "Not yours" });

      expect(res.status).toBe(403);
      expect(prismaMock.mealPlan.create).not.toHaveBeenCalled();
    });
  });

  describe("DELETE /v1/meal-plans/:id", () => {
    it("deletes the caller's own plan", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.mealPlan.findUnique.mockResolvedValueOnce({ userId: USER_ID });
      prismaMock.mealPlan.delete.mockResolvedValueOnce({ id: PLAN_ID });

      const res = await request(app)
        .delete(`/v1/meal-plans/${PLAN_ID}`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`);

      expect(res.status).toBe(204);
    });

    it("returns 404 for someone else's plan instead of deleting it", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.mealPlan.findUnique.mockResolvedValueOnce({ userId: OTHER_ID });

      const res = await request(app)
        .delete(`/v1/meal-plans/${PLAN_ID}`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`);

      expect(res.status).toBe(404);
      expect(prismaMock.mealPlan.delete).not.toHaveBeenCalled();
    });
  });
});
