// tests/exercise.routes.test.ts
// Tests for src/routes/exercise.routes.ts.

import request from "supertest";
import jwt from "jsonwebtoken";
import { prismaMock } from "../__mocks__/@prisma/client";
import { createApp } from "../src/app";
import { JWT_ACCESS_SECRET, JWT_ISSUER, JWT_AUDIENCE } from "../src/lib/env";

const app = createApp();

const USER_ID = "11111111-1111-4111-8111-111111111111";
const EXERCISE_ID = "22222222-2222-4222-8222-222222222222";

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

describe("exercise routes", () => {
  describe("GET /v1/exercises", () => {
    it("lets any authenticated user browse the catalog", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.exercise.findMany.mockResolvedValueOnce([{ id: EXERCISE_ID, name: "Back Squat" }]);
      prismaMock.exercise.count.mockResolvedValueOnce(1);

      const res = await request(app).get("/v1/exercises").set("Authorization", `Bearer ${tokenFor(USER_ID)}`);

      expect(res.status).toBe(200);
      expect(res.body.exercises).toHaveLength(1);
    });

    it("filters by name substring", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.exercise.findMany.mockResolvedValueOnce([]);
      prismaMock.exercise.count.mockResolvedValueOnce(0);

      const res = await request(app)
        .get("/v1/exercises?q=squat")
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`);

      expect(res.status).toBe(200);
      expect(prismaMock.exercise.findMany.mock.calls[0][0].where.name).toEqual({
        contains: "squat",
        mode: "insensitive",
      });
    });
  });

  describe("GET /v1/exercises/:id", () => {
    it("returns the exercise with muscles and instructions", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.exercise.findUnique.mockResolvedValueOnce({
        id: EXERCISE_ID,
        name: "Back Squat",
        primaryMuscles: [{ muscleName: "quadriceps" }],
        secondaryMuscles: [],
        instructions: [{ stepNumber: 1, instructionText: "Set up the bar." }],
      });

      const res = await request(app)
        .get(`/v1/exercises/${EXERCISE_ID}`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`);

      expect(res.status).toBe(200);
      expect(res.body.exercise.primaryMuscles).toHaveLength(1);
    });

    it("returns 404 for an unknown exercise", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.exercise.findUnique.mockResolvedValueOnce(null);

      const res = await request(app)
        .get(`/v1/exercises/${EXERCISE_ID}`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`);

      expect(res.status).toBe(404);
    });
  });

  describe("POST /v1/exercises", () => {
    it("forbids a non-admin from adding to the catalog", async () => {
      mockAuthedUser(USER_ID, ["USER"]);

      const res = await request(app)
        .post("/v1/exercises")
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`)
        .send({ name: "Deadlift", category: "strength" });

      expect(res.status).toBe(403);
      expect(prismaMock.exercise.create).not.toHaveBeenCalled();
    });

    it("lets an ADMIN add an exercise with muscles and instructions", async () => {
      mockAuthedUser("admin-1", ["ADMIN"]);
      prismaMock.exercise.create.mockResolvedValueOnce({ id: EXERCISE_ID, name: "Deadlift" });

      const res = await request(app)
        .post("/v1/exercises")
        .set("Authorization", `Bearer ${tokenFor("admin-1")}`)
        .send({
          name: "Deadlift",
          category: "strength",
          primaryMuscles: ["hamstrings", "glutes"],
          instructions: ["Set up the bar.", "Lift."],
        });

      expect(res.status).toBe(201);
      const createArgs = prismaMock.exercise.create.mock.calls[0][0];
      expect(createArgs.data.primaryMuscles.create).toEqual([
        { muscleName: "hamstrings" },
        { muscleName: "glutes" },
      ]);
      expect(createArgs.data.instructions.create).toEqual([
        { stepNumber: 1, instructionText: "Set up the bar." },
        { stepNumber: 2, instructionText: "Lift." },
      ]);
    });
  });
});
