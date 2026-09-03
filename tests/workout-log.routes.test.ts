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
      // sets: 3 in the request must produce 3 WorkoutSet rows, not 1 —
      // the original implementation always created exactly one set
      // regardless of how many were actually performed.
      const createdSets = createArgs.data.sessionExercises.create.sets.create;
      expect(createdSets).toHaveLength(3);
      expect(createdSets.map((s: { setNumber: number }) => s.setNumber)).toEqual([1, 2, 3]);
      expect(createdSets.every((s: { reps: number }) => s.reps === 5)).toBe(true);
      // 20 minutes split evenly across 3 sets = 400s each.
      expect(createdSets.every((s: { durationSeconds: number }) => s.durationSeconds === 400)).toBe(true);
      // completedAt must reflect the logged duration, not equal startedAt.
      expect(createArgs.data.completedAt.getTime() - createArgs.data.startedAt.getTime()).toBe(20 * 60 * 1000);
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

  describe("PATCH /v1/workout-logs/:id", () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const logId = "33333333-3333-4333-8333-333333333333";

    it("corrects metadata on a single-exercise ad-hoc log", async () => {
      mockAuthedUser(userId);
      prismaMock.workoutSession.findUnique.mockResolvedValueOnce({
        id: logId,
        userId,
        startedAt: new Date("2026-06-01T10:00:00Z"),
        completedAt: new Date("2026-06-01T10:20:00Z"),
        caloriesBurned: 200,
        sessionExercises: [
          { id: "se-1", exerciseId: "exercise-1", exercise: { id: "exercise-1", name: "Back Squat", category: "strength" } },
        ],
      });
      prismaMock.workoutSession.update.mockResolvedValueOnce({ id: logId, caloriesBurned: 250 });

      const res = await request(app)
        .patch(`/v1/workout-logs/${logId}`)
        .set("Authorization", `Bearer ${tokenFor(userId)}`)
        .send({ caloriesBurned: 250, notes: "Felt great" });

      expect(res.status).toBe(200);
      expect(prismaMock.workoutSessionExercise.update).toHaveBeenCalledWith({
        where: { id: "se-1" },
        data: { noteText: "Felt great" },
      });
      expect(prismaMock.workoutSession.update).toHaveBeenCalledWith({
        where: { id: logId },
        data: { caloriesBurned: 250 },
        include: { sessionExercises: { include: { exercise: true, sets: true } } },
      });
    });

    it("re-resolves the exercise when exerciseName/category changes", async () => {
      mockAuthedUser(userId);
      prismaMock.workoutSession.findUnique.mockResolvedValueOnce({
        id: logId,
        userId,
        startedAt: new Date("2026-06-01T10:00:00Z"),
        completedAt: new Date("2026-06-01T10:20:00Z"),
        sessionExercises: [
          { id: "se-1", exerciseId: "exercise-1", exercise: { id: "exercise-1", name: "Back Squat", category: "strength" } },
        ],
      });
      prismaMock.exercise.findFirst.mockResolvedValueOnce(null);
      prismaMock.exercise.create.mockResolvedValueOnce({ id: "exercise-2", name: "Front Squat", category: "strength" });
      prismaMock.workoutSession.update.mockResolvedValueOnce({ id: logId });

      const res = await request(app)
        .patch(`/v1/workout-logs/${logId}`)
        .set("Authorization", `Bearer ${tokenFor(userId)}`)
        .send({ exerciseName: "Front Squat" });

      expect(res.status).toBe(200);
      expect(prismaMock.exercise.findFirst).toHaveBeenCalledWith({
        where: { name: "Front Squat", category: "strength" },
      });
      expect(prismaMock.workoutSessionExercise.update).toHaveBeenCalledWith({
        where: { id: "se-1" },
        data: { exerciseId: "exercise-2" },
      });
    });

    it("shifting loggedAt preserves the originally-logged elapsed time", async () => {
      mockAuthedUser(userId);
      prismaMock.workoutSession.findUnique.mockResolvedValueOnce({
        id: logId,
        userId,
        startedAt: new Date("2026-06-01T10:00:00Z"),
        completedAt: new Date("2026-06-01T10:20:00Z"), // 20-minute log
        sessionExercises: [
          { id: "se-1", exerciseId: "exercise-1", exercise: { id: "exercise-1", name: "Back Squat", category: "strength" } },
        ],
      });
      prismaMock.workoutSession.update.mockResolvedValueOnce({ id: logId });

      const res = await request(app)
        .patch(`/v1/workout-logs/${logId}`)
        .set("Authorization", `Bearer ${tokenFor(userId)}`)
        .send({ loggedAt: "2026-06-02T09:00:00.000Z" });

      expect(res.status).toBe(200);
      const updateArgs = prismaMock.workoutSession.update.mock.calls[0][0];
      expect(updateArgs.data.startedAt).toEqual(new Date("2026-06-02T09:00:00.000Z"));
      expect(updateArgs.data.completedAt).toEqual(new Date("2026-06-02T09:20:00.000Z"));
    });

    it("returns 404 (not 403) for a log owned by someone else", async () => {
      mockAuthedUser(userId);
      prismaMock.workoutSession.findUnique.mockResolvedValueOnce({
        id: logId,
        userId: "22222222-2222-4222-8222-222222222222",
        sessionExercises: [{ id: "se-1", exerciseId: "exercise-1", exercise: {} }],
      });

      const res = await request(app)
        .patch(`/v1/workout-logs/${logId}`)
        .set("Authorization", `Bearer ${tokenFor(userId)}`)
        .send({ caloriesBurned: 250 });

      expect(res.status).toBe(404);
      expect(prismaMock.workoutSession.update).not.toHaveBeenCalled();
    });

    it("rejects editing a multi-exercise session, pointing at the live workout-session routes", async () => {
      mockAuthedUser(userId);
      prismaMock.workoutSession.findUnique.mockResolvedValueOnce({
        id: logId,
        userId,
        sessionExercises: [
          { id: "se-1", exerciseId: "exercise-1", exercise: {} },
          { id: "se-2", exerciseId: "exercise-2", exercise: {} },
        ],
      });

      const res = await request(app)
        .patch(`/v1/workout-logs/${logId}`)
        .set("Authorization", `Bearer ${tokenFor(userId)}`)
        .send({ caloriesBurned: 250 });

      expect(res.status).toBe(400);
      expect(prismaMock.workoutSession.update).not.toHaveBeenCalled();
    });

    it("rejects memberId as a field (ownership isn't reassignable via PATCH)", async () => {
      mockAuthedUser(userId);

      const res = await request(app)
        .patch(`/v1/workout-logs/${logId}`)
        .set("Authorization", `Bearer ${tokenFor(userId)}`)
        .send({ memberId: "22222222-2222-4222-8222-222222222222" });

      expect(res.status).toBe(400);
      expect(prismaMock.workoutSession.findUnique).not.toHaveBeenCalled();
    });
  });

  describe("DELETE /v1/workout-logs/:id", () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const logId = "33333333-3333-4333-8333-333333333333";

    it("deletes the caller's own log", async () => {
      mockAuthedUser(userId);
      prismaMock.workoutSession.findUnique.mockResolvedValueOnce({ userId });
      prismaMock.workoutSession.delete.mockResolvedValueOnce({ id: logId });

      const res = await request(app)
        .delete(`/v1/workout-logs/${logId}`)
        .set("Authorization", `Bearer ${tokenFor(userId)}`);

      expect(res.status).toBe(204);
    });

    it("returns 404 for someone else's log instead of deleting it", async () => {
      mockAuthedUser(userId);
      prismaMock.workoutSession.findUnique.mockResolvedValueOnce({ userId: "22222222-2222-4222-8222-222222222222" });

      const res = await request(app)
        .delete(`/v1/workout-logs/${logId}`)
        .set("Authorization", `Bearer ${tokenFor(userId)}`);

      expect(res.status).toBe(404);
      expect(prismaMock.workoutSession.delete).not.toHaveBeenCalled();
    });
  });
});
