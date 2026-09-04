// tests/user.routes.test.ts
// Integration-style tests for src/routes/user.routes.ts (admin user
// deletion — the workout-session routes this file used to own moved to
// tests/workout-session.routes.test.ts, see src/routes/user.routes.ts's
// header), driven through the real Express app with a mocked Prisma
// client and a real signed JWT (so `authenticate` runs for real, exactly
// as it would in production).

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
    const res = await request(app).delete("/v1/admin/users/some-user");
    expect(res.status).toBe(401);
  });

  describe("GET /v1/users/me", () => {
    it("returns the caller's own id, email, and roles", async () => {
      mockAuthedUser("coach-1", ["COACH", "USER"]);

      const res = await request(app).get("/v1/users/me").set("Authorization", `Bearer ${tokenFor("coach-1")}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: "coach-1", email: "athlete@example.com", roles: ["COACH", "USER"] });
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
