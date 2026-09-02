// tests/goal.routes.test.ts
// Tests for src/routes/goal.routes.ts: ownership scoping (self vs
// ADMIN/COACH) and the 404-not-403 convention for a goal id that exists
// but isn't the caller's (see requireCoachOfClient's approach for the
// distinction between "doesn't exist" and "not yours").

import request from "supertest";
import jwt from "jsonwebtoken";
import { prismaMock } from "../__mocks__/@prisma/client";
import { createApp } from "../src/app";
import { JWT_ACCESS_SECRET, JWT_ISSUER, JWT_AUDIENCE } from "../src/lib/env";

const app = createApp();

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";
const GOAL_ID = "33333333-3333-4333-8333-333333333333";

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

describe("goal routes", () => {
  describe("GET /v1/goals", () => {
    it("defaults to the caller's own userId", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.goal.findMany.mockResolvedValueOnce([]);
      prismaMock.goal.count.mockResolvedValueOnce(0);

      const res = await request(app).get("/v1/goals").set("Authorization", `Bearer ${tokenFor(USER_ID)}`);

      expect(res.status).toBe(200);
      expect(prismaMock.goal.findMany.mock.calls[0][0].where.userId).toBe(USER_ID);
    });

    it("forbids a plain user from listing another member's goals", async () => {
      mockAuthedUser(USER_ID, ["USER"]);

      const res = await request(app)
        .get(`/v1/goals?userId=${OTHER_ID}`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`);

      expect(res.status).toBe(403);
      expect(prismaMock.goal.findMany).not.toHaveBeenCalled();
    });

    it("lets a COACH list the goals of a client they're actively assigned to", async () => {
      mockAuthedUser("coach-1", ["COACH"]);
      prismaMock.coachAssignment.findUnique.mockResolvedValueOnce({ relationshipStatus: "active" });
      prismaMock.goal.findMany.mockResolvedValueOnce([]);
      prismaMock.goal.count.mockResolvedValueOnce(0);

      const res = await request(app)
        .get(`/v1/goals?userId=${OTHER_ID}`)
        .set("Authorization", `Bearer ${tokenFor("coach-1")}`);

      expect(res.status).toBe(200);
      expect(prismaMock.goal.findMany.mock.calls[0][0].where.userId).toBe(OTHER_ID);
    });

    it("forbids a COACH with no active assignment to that member", async () => {
      mockAuthedUser("coach-1", ["COACH"]);
      prismaMock.coachAssignment.findUnique.mockResolvedValueOnce(null);

      const res = await request(app)
        .get(`/v1/goals?userId=${OTHER_ID}`)
        .set("Authorization", `Bearer ${tokenFor("coach-1")}`);

      expect(res.status).toBe(403);
      expect(prismaMock.goal.findMany).not.toHaveBeenCalled();
    });
  });

  describe("GET /v1/goals/:id", () => {
    it("returns the goal when it belongs to the caller", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.goal.findUnique.mockResolvedValueOnce({ id: GOAL_ID, userId: USER_ID, title: "Run a 5k" });

      const res = await request(app)
        .get(`/v1/goals/${GOAL_ID}`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`);

      expect(res.status).toBe(200);
      expect(res.body.goal.id).toBe(GOAL_ID);
    });

    it("returns 404 (not 403) for a goal owned by someone else", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.goal.findUnique.mockResolvedValueOnce({ id: GOAL_ID, userId: OTHER_ID, title: "Not yours" });

      const res = await request(app)
        .get(`/v1/goals/${GOAL_ID}`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`);

      expect(res.status).toBe(404);
    });

    it("returns 404 for a goal id that doesn't exist at all", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.goal.findUnique.mockResolvedValueOnce(null);

      const res = await request(app)
        .get(`/v1/goals/${GOAL_ID}`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`);

      expect(res.status).toBe(404);
    });
  });

  describe("POST /v1/goals", () => {
    it("creates a goal for the caller", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.goal.create.mockResolvedValueOnce({ id: GOAL_ID, userId: USER_ID, title: "Run a 5k" });

      const res = await request(app)
        .post("/v1/goals")
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`)
        .send({ userId: USER_ID, category: "consistency", title: "Run a 5k" });

      expect(res.status).toBe(201);
      expect(prismaMock.goal.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: USER_ID, title: "Run a 5k" }) }),
      );
    });

    it("forbids creating a goal for someone else without an elevated role", async () => {
      mockAuthedUser(USER_ID, ["USER"]);

      const res = await request(app)
        .post("/v1/goals")
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`)
        .send({ userId: OTHER_ID, category: "consistency", title: "Not yours" });

      expect(res.status).toBe(403);
      expect(prismaMock.goal.create).not.toHaveBeenCalled();
    });
  });

  describe("PATCH /v1/goals/:id", () => {
    it("updates the caller's own goal", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.goal.findUnique.mockResolvedValueOnce({ userId: USER_ID });
      prismaMock.goal.update.mockResolvedValueOnce({ id: GOAL_ID, status: "achieved" });

      const res = await request(app)
        .patch(`/v1/goals/${GOAL_ID}`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`)
        .send({ status: "achieved" });

      expect(res.status).toBe(200);
    });

    it("returns 404 for someone else's goal", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.goal.findUnique.mockResolvedValueOnce({ userId: OTHER_ID });

      const res = await request(app)
        .patch(`/v1/goals/${GOAL_ID}`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`)
        .send({ status: "achieved" });

      expect(res.status).toBe(404);
      expect(prismaMock.goal.update).not.toHaveBeenCalled();
    });
  });

  describe("DELETE /v1/goals/:id", () => {
    it("deletes the caller's own goal", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.goal.findUnique.mockResolvedValueOnce({ userId: USER_ID });
      prismaMock.goal.delete.mockResolvedValueOnce({ id: GOAL_ID });

      const res = await request(app)
        .delete(`/v1/goals/${GOAL_ID}`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`);

      expect(res.status).toBe(204);
    });

    it("returns 404 for someone else's goal instead of deleting it", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.goal.findUnique.mockResolvedValueOnce({ userId: OTHER_ID });

      const res = await request(app)
        .delete(`/v1/goals/${GOAL_ID}`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`);

      expect(res.status).toBe(404);
      expect(prismaMock.goal.delete).not.toHaveBeenCalled();
    });
  });
});
