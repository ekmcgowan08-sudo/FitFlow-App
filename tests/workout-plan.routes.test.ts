// tests/workout-plan.routes.test.ts
// Tests for src/routes/workout-plan.routes.ts.

import request from "supertest";
import jwt from "jsonwebtoken";
import { prismaMock } from "../__mocks__/@prisma/client";
import { createApp } from "../src/app";
import { JWT_ACCESS_SECRET, JWT_ISSUER, JWT_AUDIENCE } from "../src/lib/env";

const app = createApp();

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";
const PLAN_ID = "33333333-3333-4333-8333-333333333333";
const EXERCISE_ID = "44444444-4444-4444-8444-444444444444";

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

describe("workout-plan routes", () => {
  describe("GET /v1/workout-plans", () => {
    it("defaults to the caller's own userId", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.workoutPlan.findMany.mockResolvedValueOnce([]);
      prismaMock.workoutPlan.count.mockResolvedValueOnce(0);

      const res = await request(app).get("/v1/workout-plans").set("Authorization", `Bearer ${tokenFor(USER_ID)}`);

      expect(res.status).toBe(200);
      expect(prismaMock.workoutPlan.findMany.mock.calls[0][0].where.userId).toBe(USER_ID);
    });

    it("forbids a plain user from listing another member's plans", async () => {
      mockAuthedUser(USER_ID, ["USER"]);

      const res = await request(app)
        .get(`/v1/workout-plans?userId=${OTHER_ID}`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`);

      expect(res.status).toBe(403);
    });
  });

  describe("GET /v1/workout-plans/:id", () => {
    it("returns the plan with nested sessions and exercises when owned by the caller", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.workoutPlan.findUnique.mockResolvedValueOnce({
        id: PLAN_ID,
        userId: USER_ID,
        title: "12-Week Strength",
        sessions: [{ id: "s1", dayOfWeek: "Monday", exercises: [{ id: "e1", exerciseId: EXERCISE_ID }] }],
      });

      const res = await request(app)
        .get(`/v1/workout-plans/${PLAN_ID}`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`);

      expect(res.status).toBe(200);
      expect(res.body.plan.sessions).toHaveLength(1);
    });

    it("returns 404 (not 403) for a plan owned by someone else", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.workoutPlan.findUnique.mockResolvedValueOnce({ id: PLAN_ID, userId: OTHER_ID });

      const res = await request(app)
        .get(`/v1/workout-plans/${PLAN_ID}`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`);

      expect(res.status).toBe(404);
    });
  });

  describe("POST /v1/workout-plans", () => {
    it("creates a plan with nested sessions and exercises for the caller", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.workoutPlan.create.mockResolvedValueOnce({
        id: PLAN_ID,
        userId: USER_ID,
        title: "12-Week Strength",
        sessions: [],
      });

      const res = await request(app)
        .post("/v1/workout-plans")
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`)
        .send({
          userId: USER_ID,
          title: "12-Week Strength",
          coachSource: "ai",
          sessions: [
            {
              dayOfWeek: "Monday",
              focus: "Lower body",
              exercises: [{ exerciseId: EXERCISE_ID, targetSets: 5, targetReps: "5" }],
            },
          ],
        });

      expect(res.status).toBe(201);
      const createArgs = prismaMock.workoutPlan.create.mock.calls[0][0];
      expect(createArgs.data.sessions.create[0].dayOfWeek).toBe("Monday");
      expect(createArgs.data.sessions.create[0].exercises.create[0].exerciseId).toBe(EXERCISE_ID);
    });

    it("forbids creating a plan for someone else without an elevated role", async () => {
      mockAuthedUser(USER_ID, ["USER"]);

      const res = await request(app)
        .post("/v1/workout-plans")
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`)
        .send({ userId: OTHER_ID, title: "Not yours" });

      expect(res.status).toBe(403);
      expect(prismaMock.workoutPlan.create).not.toHaveBeenCalled();
    });
  });

  describe("PATCH /v1/workout-plans/:id", () => {
    it("renames the caller's own plan", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.workoutPlan.findUnique.mockResolvedValueOnce({ userId: USER_ID });
      prismaMock.workoutPlan.update.mockResolvedValueOnce({ id: PLAN_ID, title: "New Name" });

      const res = await request(app)
        .patch(`/v1/workout-plans/${PLAN_ID}`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`)
        .send({ title: "New Name" });

      expect(res.status).toBe(200);
      expect(res.body.plan.title).toBe("New Name");
    });

    it("returns 404 for someone else's plan instead of updating it", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.workoutPlan.findUnique.mockResolvedValueOnce({ userId: OTHER_ID });

      const res = await request(app)
        .patch(`/v1/workout-plans/${PLAN_ID}`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`)
        .send({ title: "New Name" });

      expect(res.status).toBe(404);
      expect(prismaMock.workoutPlan.update).not.toHaveBeenCalled();
    });
  });

  describe("DELETE /v1/workout-plans/:id", () => {
    it("deletes the caller's own plan", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.workoutPlan.findUnique.mockResolvedValueOnce({ userId: USER_ID });
      prismaMock.workoutPlan.delete.mockResolvedValueOnce({ id: PLAN_ID });

      const res = await request(app)
        .delete(`/v1/workout-plans/${PLAN_ID}`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`);

      expect(res.status).toBe(204);
    });

    it("returns 404 for someone else's plan instead of deleting it", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.workoutPlan.findUnique.mockResolvedValueOnce({ userId: OTHER_ID });

      const res = await request(app)
        .delete(`/v1/workout-plans/${PLAN_ID}`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`);

      expect(res.status).toBe(404);
      expect(prismaMock.workoutPlan.delete).not.toHaveBeenCalled();
    });
  });
});
