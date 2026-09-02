// tests/user.routes.test.ts
// Integration-style tests for src/routes/user.routes.ts (workout-session
// CRUD + admin user deletion), driven through the real Express app with a
// mocked Prisma client and a real signed JWT (so `authenticate` runs for
// real, exactly as it would in production).

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

describe("user routes", () => {
  it("rejects every route with 401 when no bearer token is presented", async () => {
    const res = await request(app).get("/v1/workout-sessions");
    expect(res.status).toBe(401);
  });

  describe("GET /v1/workout-sessions/:id", () => {
    it("returns the session when it belongs to the caller", async () => {
      mockAuthedUser("user-1");
      prismaMock.workoutSession.findFirst.mockResolvedValueOnce({
        id: "session-1",
        userId: "user-1",
        status: "completed",
      });

      const res = await request(app)
        .get("/v1/workout-sessions/session-1")
        .set("Authorization", `Bearer ${tokenFor("user-1")}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe("session-1");
      expect(prismaMock.workoutSession.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "session-1", userId: "user-1" } }),
      );
    });

    it("returns 404 — not 200 with a null body — for a session owned by someone else", async () => {
      mockAuthedUser("user-1");
      // Scoped by (id, userId) together, so a cross-user session id
      // resolves to "not found", never leaking that the row exists.
      prismaMock.workoutSession.findFirst.mockResolvedValueOnce(null);

      const res = await request(app)
        .get("/v1/workout-sessions/someone-elses-session")
        .set("Authorization", `Bearer ${tokenFor("user-1")}`);

      expect(res.status).toBe(404);
    });
  });

  describe("GET /v1/workout-sessions", () => {
    it("scopes the list to the authenticated user only", async () => {
      mockAuthedUser("user-1");
      prismaMock.workoutSession.findMany.mockResolvedValueOnce([{ id: "session-1", userId: "user-1" }]);

      const res = await request(app)
        .get("/v1/workout-sessions")
        .set("Authorization", `Bearer ${tokenFor("user-1")}`);

      expect(res.status).toBe(200);
      expect(prismaMock.workoutSession.findMany).toHaveBeenCalledWith({
        where: { userId: "user-1" },
        orderBy: { startedAt: "desc" },
      });
    });
  });

  describe("PATCH /v1/workout-sessions/:id", () => {
    it("updates status when the caller owns the session", async () => {
      mockAuthedUser("user-1");
      prismaMock.workoutSession.updateMany.mockResolvedValueOnce({ count: 1 });
      prismaMock.workoutSession.findFirst.mockResolvedValueOnce({
        id: "session-1",
        userId: "user-1",
        status: "completed",
      });

      const res = await request(app)
        .patch("/v1/workout-sessions/session-1")
        .set("Authorization", `Bearer ${tokenFor("user-1")}`)
        .send({ status: "completed" });

      expect(res.status).toBe(200);
      expect(prismaMock.workoutSession.updateMany).toHaveBeenCalledWith({
        where: { id: "session-1", userId: "user-1" },
        data: { status: "completed" },
      });
    });

    it("rejects an invalid status value with 400", async () => {
      mockAuthedUser("user-1");

      const res = await request(app)
        .patch("/v1/workout-sessions/session-1")
        .set("Authorization", `Bearer ${tokenFor("user-1")}`)
        .send({ status: "not-a-real-status" });

      expect(res.status).toBe(400);
      expect(prismaMock.workoutSession.updateMany).not.toHaveBeenCalled();
    });

    it("never accepts userId from the body (no ownership reassignment)", async () => {
      mockAuthedUser("user-1");
      prismaMock.workoutSession.updateMany.mockResolvedValueOnce({ count: 1 });
      prismaMock.workoutSession.findFirst.mockResolvedValueOnce({ id: "session-1", userId: "user-1" });

      await request(app)
        .patch("/v1/workout-sessions/session-1")
        .set("Authorization", `Bearer ${tokenFor("user-1")}`)
        .send({ status: "completed", userId: "someone-else" });

      const updateArgs = prismaMock.workoutSession.updateMany.mock.calls[0][0];
      expect(updateArgs.data).not.toHaveProperty("userId");
    });

    it("returns 404 when the session doesn't belong to the caller (updateMany matched zero rows)", async () => {
      mockAuthedUser("user-1");
      prismaMock.workoutSession.updateMany.mockResolvedValueOnce({ count: 0 });

      const res = await request(app)
        .patch("/v1/workout-sessions/not-mine")
        .set("Authorization", `Bearer ${tokenFor("user-1")}`)
        .send({ status: "cancelled" });

      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /v1/admin/users/:id", () => {
    it("forbids a non-admin caller with 403", async () => {
      mockAuthedUser("user-1", ["USER"]);

      const res = await request(app)
        .delete("/v1/admin/users/some-user")
        .set("Authorization", `Bearer ${tokenFor("user-1")}`);

      expect(res.status).toBe(403);
      expect(prismaMock.user.delete).not.toHaveBeenCalled();
    });

    it("allows an ADMIN caller to delete a user and returns 204", async () => {
      mockAuthedUser("admin-1", ["ADMIN"]);
      prismaMock.user.findUnique.mockResolvedValueOnce({ id: "target-user" });
      prismaMock.user.delete.mockResolvedValueOnce({ id: "target-user" });

      const res = await request(app)
        .delete("/v1/admin/users/target-user")
        .set("Authorization", `Bearer ${tokenFor("admin-1")}`);

      expect(res.status).toBe(204);
      expect(prismaMock.user.delete).toHaveBeenCalledWith({ where: { id: "target-user" } });
    });

    it("returns 404 when the target user doesn't exist", async () => {
      mockAuthedUser("admin-1", ["ADMIN"]);
      prismaMock.user.findUnique.mockResolvedValueOnce(null);

      const res = await request(app)
        .delete("/v1/admin/users/ghost")
        .set("Authorization", `Bearer ${tokenFor("admin-1")}`);

      expect(res.status).toBe(404);
      expect(prismaMock.user.delete).not.toHaveBeenCalled();
    });
  });
});
