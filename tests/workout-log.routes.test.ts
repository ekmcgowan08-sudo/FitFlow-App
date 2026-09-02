// tests/workout-log.routes.test.ts
// Tests for src/routes/workout-log.routes.ts, pinning down the three
// fixes described in docs/architecture/canonical-schema-decisions.md and
// docs/artifacts/README.md ("Known conflicts" #3):
//   1. A plain user can't read another member's logs via ?memberId=.
//   2. Pagination (page/pageSize) is real, not a no-op past page 1.
//   3. POST creates the full session/exercise/set chain, not a bare
//      session row.

import request from "supertest";
import jwt from "jsonwebtoken";
import { prismaMock } from "../__mocks__/@prisma/client";
import { createApp } from "../src/app";
import { JWT_ACCESS_SECRET, JWT_ISSUER, JWT_AUDIENCE } from "../src/lib/env";

const app = createApp();

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

describe("workout-log routes", () => {
  describe("GET /v1/workout-logs", () => {
    it("defaults to the caller's own userId when memberId is omitted", async () => {
      mockAuthedUser("user-1");
      prismaMock.workoutSession.findMany.mockResolvedValueOnce([]);
      prismaMock.workoutSession.count.mockResolvedValueOnce(0);

      const res = await request(app)
        .get("/v1/workout-logs")
        .set("Authorization", `Bearer ${tokenFor("user-1")}`);

      expect(res.status).toBe(200);
      const findManyArgs = prismaMock.workoutSession.findMany.mock.calls[0][0];
      expect(findManyArgs.where.userId).toBe("user-1");
      // The original example wiring passed `memberId ?? ''` here, which
      // matched nothing. This must never be an empty string.
      expect(findManyArgs.where.userId).not.toBe("");
    });

    it("forbids a plain user from requesting another member's logs", async () => {
      mockAuthedUser("user-1", ["USER"]);

      const res = await request(app)
        .get("/v1/workout-logs?memberId=22222222-2222-4222-8222-222222222222")
        .set("Authorization", `Bearer ${tokenFor("user-1")}`);

      expect(res.status).toBe(403);
      expect(prismaMock.workoutSession.findMany).not.toHaveBeenCalled();
    });

    it("lets an ADMIN request a specific member's logs via memberId", async () => {
      mockAuthedUser("admin-1", ["ADMIN"]);
      prismaMock.workoutSession.findMany.mockResolvedValueOnce([]);
      prismaMock.workoutSession.count.mockResolvedValueOnce(0);
      const targetId = "22222222-2222-4222-8222-222222222222";

      const res = await request(app)
        .get(`/v1/workout-logs?memberId=${targetId}`)
        .set("Authorization", `Bearer ${tokenFor("admin-1")}`);

      expect(res.status).toBe(200);
      expect(prismaMock.workoutSession.findMany.mock.calls[0][0].where.userId).toBe(targetId);
    });

    it("actually advances pagination on page 2 (skip = pageSize)", async () => {
      mockAuthedUser("user-1");
      prismaMock.workoutSession.findMany.mockResolvedValueOnce([]);
      prismaMock.workoutSession.count.mockResolvedValueOnce(0);

      const res = await request(app)
        .get("/v1/workout-logs?page=2&pageSize=5")
        .set("Authorization", `Bearer ${tokenFor("user-1")}`);

      expect(res.status).toBe(200);
      const findManyArgs = prismaMock.workoutSession.findMany.mock.calls[0][0];
      expect(findManyArgs.skip).toBe(5);
      expect(findManyArgs.take).toBe(5);
      expect(res.body.page).toBe(2);
    });
  });

  describe("POST /v1/workout-logs", () => {
    it("creates the full session -> exercise -> set chain, not a bare session", async () => {
      const userId = "11111111-1111-4111-8111-111111111111";
      mockAuthedUser(userId);
      prismaMock.exercise.findFirst.mockResolvedValueOnce(null);
      prismaMock.exercise.create.mockResolvedValueOnce({ id: "exercise-1", name: "Back Squat", category: "strength" });
      prismaMock.workoutSession.create.mockResolvedValueOnce({
        id: "session-1",
        userId,
        sessionExercises: [{ id: "se-1", exerciseId: "exercise-1", sets: [{ id: "set-1", setNumber: 1 }] }],
      });

      const res = await request(app)
        .post("/v1/workout-logs")
        .set("Authorization", `Bearer ${tokenFor(userId)}`)
        .send({
          memberId: userId,
          exerciseName: "Back Squat",
          category: "STRENGTH",
          sets: 3,
          reps: 5,
          durationMinutes: 20,
          loggedAt: new Date().toISOString(),
        });

      expect(res.status).toBe(201);
      expect(prismaMock.exercise.create).toHaveBeenCalledWith({
        data: { name: "Back Squat", category: "strength" },
      });
      const createArgs = prismaMock.workoutSession.create.mock.calls[0][0];
      expect(createArgs.data.sessionExercises.create.exerciseId).toBe("exercise-1");
      expect(createArgs.data.sessionExercises.create.sets.create.reps).toBe(5);
      expect(res.body.session.sessionExercises[0].sets[0].id).toBe("set-1");

      // Logging a workout advances the member's "workout" streak
      // (MemberRepository.incrementStreak, previously unwired to anything).
      // No existing streak row -> creates the first one.
      expect(prismaMock.streak.create).toHaveBeenCalledWith({
        data: { userId, streakType: "workout", currentCount: 1, bestCount: 1 },
      });
    });

    it("advances bestCount along with currentCount when it's a new high", async () => {
      const userId = "11111111-1111-4111-8111-111111111111";
      mockAuthedUser(userId);
      prismaMock.exercise.findFirst.mockResolvedValueOnce({ id: "exercise-1" });
      prismaMock.workoutSession.create.mockResolvedValueOnce({ id: "session-1", userId });
      // An existing streak already at its best (3/3) — logging one more
      // workout must push both currentCount AND bestCount to 4, not leave
      // bestCount frozen at 3.
      prismaMock.streak.findUnique.mockResolvedValueOnce({
        userId,
        streakType: "workout",
        currentCount: 3,
        bestCount: 3,
      });

      const res = await request(app)
        .post("/v1/workout-logs")
        .set("Authorization", `Bearer ${tokenFor(userId)}`)
        .send({
          memberId: userId,
          exerciseName: "Back Squat",
          category: "STRENGTH",
          sets: 3,
          reps: 5,
          durationMinutes: 20,
          loggedAt: new Date().toISOString(),
        });

      expect(res.status).toBe(201);
      expect(prismaMock.streak.update).toHaveBeenCalledWith({
        where: { userId_streakType: { userId, streakType: "workout" } },
        data: { currentCount: 4, bestCount: 4 },
      });
    });

    it("forbids logging a workout for someone else without an elevated role", async () => {
      mockAuthedUser("user-1", ["USER"]);

      const res = await request(app)
        .post("/v1/workout-logs")
        .set("Authorization", `Bearer ${tokenFor("user-1")}`)
        .send({
          memberId: "22222222-2222-4222-8222-222222222222",
          exerciseName: "Back Squat",
          category: "STRENGTH",
          sets: 3,
          reps: 5,
          durationMinutes: 20,
          loggedAt: new Date().toISOString(),
        });

      expect(res.status).toBe(403);
      expect(prismaMock.workoutSession.create).not.toHaveBeenCalled();
    });

    it("rejects a STRENGTH log missing sets/reps with 400", async () => {
      const userId = "11111111-1111-4111-8111-111111111111";
      mockAuthedUser(userId);

      const res = await request(app)
        .post("/v1/workout-logs")
        .set("Authorization", `Bearer ${tokenFor(userId)}`)
        .send({
          memberId: userId,
          exerciseName: "Back Squat",
          category: "STRENGTH",
          durationMinutes: 20,
          loggedAt: new Date().toISOString(),
        });

      expect(res.status).toBe(400);
    });
  });
});
