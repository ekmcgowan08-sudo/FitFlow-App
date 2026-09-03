// tests/workout-session.routes.test.ts
// Tests for src/routes/workout-session.routes.ts: the live,
// progressively-logged workout flow (start -> add exercises -> log sets
// -> complete/cancel), as opposed to workout-log.routes.ts's single-shot
// retroactive log. Covers ownership scoping (self/ADMIN/assigned COACH),
// the in_progress-only guard on every mutating action, and the
// 404-not-403 convention for a session that exists but isn't the
// caller's.

import request from "supertest";
import jwt from "jsonwebtoken";
import { prismaMock } from "../__mocks__/@prisma/client";
import { createApp } from "../src/app";
import { JWT_ACCESS_SECRET, JWT_ISSUER, JWT_AUDIENCE } from "../src/lib/env";

const app = createApp();

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_ID = "33333333-3333-4333-8333-333333333333";
const SESSION_EXERCISE_ID = "44444444-4444-4444-8444-444444444444";
const EXERCISE_ID = "55555555-5555-4555-8555-555555555555";
const PLAN_SESSION_ID = "66666666-6666-4666-8666-666666666666";

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

function inProgressSession(overrides: Partial<{ userId: string; sessionExercises: unknown[] }> = {}) {
  return {
    id: SESSION_ID,
    userId: overrides.userId ?? USER_ID,
    status: "in_progress",
    startedAt: new Date("2026-06-01T10:00:00Z"),
    completedAt: null,
    sessionExercises: overrides.sessionExercises ?? [],
  };
}

describe("workout-session routes", () => {
  describe("POST /v1/workout-sessions/start", () => {
    it("starts an ad-hoc session (no planSessionId) for the caller", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.workoutSession.create.mockResolvedValueOnce({ id: SESSION_ID, userId: USER_ID, status: "in_progress" });

      const res = await request(app)
        .post("/v1/workout-sessions/start")
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`)
        .send({ userId: USER_ID });

      expect(res.status).toBe(201);
      expect(prismaMock.workoutPlanSessionExercise.findMany).not.toHaveBeenCalled();
      expect(res.body.session.id).toBe(SESSION_ID);
    });

    it("copies the plan session's exercises in when planSessionId is given", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.workoutPlanSession.findUnique.mockResolvedValueOnce({
        id: PLAN_SESSION_ID,
        workoutPlan: { userId: USER_ID },
      });
      prismaMock.workoutPlanSessionExercise.findMany.mockResolvedValueOnce([
        { exerciseId: EXERCISE_ID, sortOrder: 1, noteText: null },
      ]);
      prismaMock.workoutSession.create.mockResolvedValueOnce({
        id: SESSION_ID,
        userId: USER_ID,
        status: "in_progress",
        sessionExercises: [{ id: SESSION_EXERCISE_ID, exerciseId: EXERCISE_ID }],
      });

      const res = await request(app)
        .post("/v1/workout-sessions/start")
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`)
        .send({ userId: USER_ID, planSessionId: PLAN_SESSION_ID });

      expect(res.status).toBe(201);
      expect(prismaMock.workoutSession.create.mock.calls[0][0].data.sessionExercises.create).toEqual([
        { exerciseId: EXERCISE_ID, sortOrder: 1, noteText: null },
      ]);
    });

    it("returns 404 when planSessionId belongs to a different member's plan", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.workoutPlanSession.findUnique.mockResolvedValueOnce({
        id: PLAN_SESSION_ID,
        workoutPlan: { userId: OTHER_ID },
      });

      const res = await request(app)
        .post("/v1/workout-sessions/start")
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`)
        .send({ userId: USER_ID, planSessionId: PLAN_SESSION_ID });

      expect(res.status).toBe(404);
      expect(prismaMock.workoutSession.create).not.toHaveBeenCalled();
    });

    it("forbids starting a session for someone else without an elevated relationship", async () => {
      mockAuthedUser(USER_ID, ["USER"]);

      const res = await request(app)
        .post("/v1/workout-sessions/start")
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`)
        .send({ userId: OTHER_ID });

      expect(res.status).toBe(403);
      expect(prismaMock.workoutSession.create).not.toHaveBeenCalled();
    });

    it("lets a COACH start a session for a client they're actively assigned to", async () => {
      mockAuthedUser("coach-1", ["COACH"]);
      prismaMock.coachAssignment.findUnique.mockResolvedValueOnce({ relationshipStatus: "active" });
      prismaMock.workoutSession.create.mockResolvedValueOnce({ id: SESSION_ID, userId: OTHER_ID, status: "in_progress" });

      const res = await request(app)
        .post("/v1/workout-sessions/start")
        .set("Authorization", `Bearer ${tokenFor("coach-1")}`)
        .send({ userId: OTHER_ID });

      expect(res.status).toBe(201);
    });
  });

  describe("GET /v1/workout-sessions/:sessionId", () => {
    it("returns the session when it belongs to the caller", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.workoutSession.findUnique.mockResolvedValueOnce(inProgressSession());

      const res = await request(app)
        .get(`/v1/workout-sessions/${SESSION_ID}`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`);

      expect(res.status).toBe(200);
      expect(res.body.session.id).toBe(SESSION_ID);
    });

    it("returns 404 (not 403) for a session owned by someone else", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.workoutSession.findUnique.mockResolvedValueOnce(inProgressSession({ userId: OTHER_ID }));

      const res = await request(app)
        .get(`/v1/workout-sessions/${SESSION_ID}`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`);

      expect(res.status).toBe(404);
    });
  });

  describe("POST /v1/workout-sessions/:sessionId/exercises", () => {
    it("adds an exercise to an in-progress session, computing the next sortOrder", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.workoutSession.findUnique.mockResolvedValueOnce(
        inProgressSession({ sessionExercises: [{ id: "existing-1" }] }),
      );
      prismaMock.workoutSessionExercise.create.mockResolvedValueOnce({
        id: SESSION_EXERCISE_ID,
        exerciseId: EXERCISE_ID,
        sortOrder: 2,
      });

      const res = await request(app)
        .post(`/v1/workout-sessions/${SESSION_ID}/exercises`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`)
        .send({ exerciseId: EXERCISE_ID });

      expect(res.status).toBe(201);
      expect(prismaMock.workoutSessionExercise.create.mock.calls[0][0].data.sortOrder).toBe(2);
    });

    it("rejects adding an exercise once the session is no longer in progress", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.workoutSession.findUnique.mockResolvedValueOnce({
        ...inProgressSession(),
        status: "completed",
      });

      const res = await request(app)
        .post(`/v1/workout-sessions/${SESSION_ID}/exercises`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`)
        .send({ exerciseId: EXERCISE_ID });

      expect(res.status).toBe(400);
      expect(prismaMock.workoutSessionExercise.create).not.toHaveBeenCalled();
    });
  });

  describe("POST /v1/workout-sessions/:sessionId/exercises/:sessionExerciseId/sets", () => {
    it("logs a completed set, computing the next setNumber", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.workoutSession.findUnique.mockResolvedValueOnce(
        inProgressSession({
          sessionExercises: [{ id: SESSION_EXERCISE_ID, sets: [{ setNumber: 1 }, { setNumber: 2 }] }],
        }),
      );
      prismaMock.workoutSet.create.mockResolvedValueOnce({ id: "set-3", setNumber: 3, reps: 8 });

      const res = await request(app)
        .post(`/v1/workout-sessions/${SESSION_ID}/exercises/${SESSION_EXERCISE_ID}/sets`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`)
        .send({ reps: 8, weightKg: 60 });

      expect(res.status).toBe(201);
      expect(prismaMock.workoutSet.create.mock.calls[0][0].data.setNumber).toBe(3);
      expect(res.body.set.id).toBe("set-3");
    });

    it("returns 404 when the session exercise isn't part of this session", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.workoutSession.findUnique.mockResolvedValueOnce(inProgressSession({ sessionExercises: [] }));

      const res = await request(app)
        .post(`/v1/workout-sessions/${SESSION_ID}/exercises/${SESSION_EXERCISE_ID}/sets`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`)
        .send({ reps: 8 });

      expect(res.status).toBe(404);
      expect(prismaMock.workoutSet.create).not.toHaveBeenCalled();
    });
  });

  describe("POST /v1/workout-sessions/:sessionId/complete", () => {
    it("marks the session completed and advances the workout streak", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.workoutSession.findUnique.mockResolvedValueOnce(inProgressSession());
      prismaMock.workoutSession.update.mockResolvedValueOnce({ id: SESSION_ID, status: "completed" });
      prismaMock.streak.findUnique.mockResolvedValueOnce(null);
      prismaMock.streak.create.mockResolvedValueOnce({ userId: USER_ID, streakType: "workout", currentCount: 1 });

      const res = await request(app)
        .post(`/v1/workout-sessions/${SESSION_ID}/complete`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`)
        .send({ caloriesBurned: 300 });

      expect(res.status).toBe(200);
      expect(prismaMock.workoutSession.update).toHaveBeenCalledWith({
        where: { id: SESSION_ID },
        data: { status: "completed", completedAt: expect.any(Date), caloriesBurned: 300 },
      });
      expect(prismaMock.streak.create).toHaveBeenCalled();
    });

    it("rejects completing a session that isn't in progress", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.workoutSession.findUnique.mockResolvedValueOnce({ ...inProgressSession(), status: "cancelled" });

      const res = await request(app)
        .post(`/v1/workout-sessions/${SESSION_ID}/complete`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`)
        .send({});

      expect(res.status).toBe(400);
      expect(prismaMock.workoutSession.update).not.toHaveBeenCalled();
    });
  });

  describe("POST /v1/workout-sessions/:sessionId/cancel", () => {
    it("marks an in-progress session cancelled", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.workoutSession.findUnique.mockResolvedValueOnce(inProgressSession());
      prismaMock.workoutSession.update.mockResolvedValueOnce({ id: SESSION_ID, status: "cancelled" });

      const res = await request(app)
        .post(`/v1/workout-sessions/${SESSION_ID}/cancel`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`);

      expect(res.status).toBe(200);
      expect(res.body.session.status).toBe("cancelled");
    });
  });
});
