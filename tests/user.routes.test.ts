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

  const TARGET_ID = "22222222-2222-4222-8222-222222222222";
  const ADMIN_ID = "11111111-1111-4111-8111-111111111111";

  describe("POST /v1/admin/users/:id/roles", () => {
    it("forbids a non-admin caller with 403", async () => {
      mockAuthedUser("user-1", ["USER"]);

      const res = await request(app)
        .post(`/v1/admin/users/${TARGET_ID}/roles`)
        .set("Authorization", `Bearer ${tokenFor("user-1")}`)
        .send({ code: "COACH" });

      expect(res.status).toBe(403);
      expect(prismaMock.userRole.upsert).not.toHaveBeenCalled();
    });

    it("grants a role and returns the user's updated role list", async () => {
      mockAuthedUser(ADMIN_ID, ["ADMIN"]);
      prismaMock.user.findUnique.mockResolvedValueOnce({ id: TARGET_ID });
      prismaMock.role.upsert.mockResolvedValueOnce({ id: 2, code: "COACH" });
      prismaMock.userRole.upsert.mockResolvedValueOnce({});
      prismaMock.user.findUniqueOrThrow.mockResolvedValueOnce({
        id: TARGET_ID,
        email: "athlete@example.com",
        roles: [{ role: { code: "USER" } }, { role: { code: "COACH" } }],
      });

      const res = await request(app)
        .post(`/v1/admin/users/${TARGET_ID}/roles`)
        .set("Authorization", `Bearer ${tokenFor(ADMIN_ID)}`)
        .send({ code: "COACH" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: TARGET_ID, email: "athlete@example.com", roles: ["USER", "COACH"] });
      expect(prismaMock.userRole.upsert).toHaveBeenCalledWith({
        where: { userId_roleId: { userId: TARGET_ID, roleId: 2 } },
        update: {},
        create: { userId: TARGET_ID, roleId: 2 },
      });
    });

    it("returns 404 when the target user doesn't exist", async () => {
      mockAuthedUser(ADMIN_ID, ["ADMIN"]);
      prismaMock.user.findUnique.mockResolvedValueOnce(null);

      const res = await request(app)
        .post(`/v1/admin/users/${TARGET_ID}/roles`)
        .set("Authorization", `Bearer ${tokenFor(ADMIN_ID)}`)
        .send({ code: "COACH" });

      expect(res.status).toBe(404);
      expect(prismaMock.userRole.upsert).not.toHaveBeenCalled();
    });

    it("rejects a bogus role code with 400", async () => {
      mockAuthedUser(ADMIN_ID, ["ADMIN"]);

      const res = await request(app)
        .post(`/v1/admin/users/${TARGET_ID}/roles`)
        .set("Authorization", `Bearer ${tokenFor(ADMIN_ID)}`)
        .send({ code: "SUPER_ADMIN" });

      expect(res.status).toBe(400);
      expect(prismaMock.role.upsert).not.toHaveBeenCalled();
    });
  });

  describe("DELETE /v1/admin/users/:id/roles/:code", () => {
    it("forbids a non-admin caller with 403", async () => {
      mockAuthedUser("user-1", ["USER"]);

      const res = await request(app)
        .delete(`/v1/admin/users/${TARGET_ID}/roles/COACH`)
        .set("Authorization", `Bearer ${tokenFor("user-1")}`);

      expect(res.status).toBe(403);
      expect(prismaMock.userRole.delete).not.toHaveBeenCalled();
    });

    it("revokes a role and returns 204", async () => {
      mockAuthedUser(ADMIN_ID, ["ADMIN"]);
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: TARGET_ID,
        roles: [{ role: { id: 1, code: "USER" } }, { role: { id: 2, code: "COACH" } }],
      });
      prismaMock.userRole.delete.mockResolvedValueOnce({});

      const res = await request(app)
        .delete(`/v1/admin/users/${TARGET_ID}/roles/COACH`)
        .set("Authorization", `Bearer ${tokenFor(ADMIN_ID)}`);

      expect(res.status).toBe(204);
      expect(prismaMock.userRole.delete).toHaveBeenCalledWith({
        where: { userId_roleId: { userId: TARGET_ID, roleId: 2 } },
      });
    });

    it("returns 404 when the user doesn't have that role", async () => {
      mockAuthedUser(ADMIN_ID, ["ADMIN"]);
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: TARGET_ID,
        roles: [{ role: { id: 1, code: "USER" } }],
      });

      const res = await request(app)
        .delete(`/v1/admin/users/${TARGET_ID}/roles/COACH`)
        .set("Authorization", `Bearer ${tokenFor(ADMIN_ID)}`);

      expect(res.status).toBe(404);
      expect(prismaMock.userRole.delete).not.toHaveBeenCalled();
    });

    it("refuses to remove a user's last remaining role", async () => {
      // Regression-shaped test for a real footgun: authenticate() treats
      // zero roles as "Account has no assigned roles" and rejects every
      // request from that account — an easy way to accidentally lock a
      // user out entirely, with User.status already covering the
      // "deliberately disable this account" case properly.
      mockAuthedUser(ADMIN_ID, ["ADMIN"]);
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: TARGET_ID,
        roles: [{ role: { id: 1, code: "USER" } }],
      });

      const res = await request(app)
        .delete(`/v1/admin/users/${TARGET_ID}/roles/USER`)
        .set("Authorization", `Bearer ${tokenFor(ADMIN_ID)}`);

      expect(res.status).toBe(400);
      expect(prismaMock.userRole.delete).not.toHaveBeenCalled();
    });

    it("refuses to let an admin remove their own ADMIN role", async () => {
      // The other classic admin-panel footgun: self-demotion locking the
      // only person looking at the screen out of the admin area.
      mockAuthedUser(ADMIN_ID, ["ADMIN"]);
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: ADMIN_ID,
        roles: [{ role: { id: 1, code: "USER" } }, { role: { id: 3, code: "ADMIN" } }],
      });

      const res = await request(app)
        .delete(`/v1/admin/users/${ADMIN_ID}/roles/ADMIN`)
        .set("Authorization", `Bearer ${tokenFor(ADMIN_ID)}`);

      expect(res.status).toBe(403);
      expect(prismaMock.userRole.delete).not.toHaveBeenCalled();
    });

    it("lets a DIFFERENT admin remove someone else's ADMIN role", async () => {
      mockAuthedUser(ADMIN_ID, ["ADMIN"]);
      const otherAdminId = "33333333-3333-4333-8333-333333333333";
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: otherAdminId,
        roles: [{ role: { id: 1, code: "USER" } }, { role: { id: 3, code: "ADMIN" } }],
      });
      prismaMock.userRole.delete.mockResolvedValueOnce({});

      const res = await request(app)
        .delete(`/v1/admin/users/${otherAdminId}/roles/ADMIN`)
        .set("Authorization", `Bearer ${tokenFor(ADMIN_ID)}`);

      expect(res.status).toBe(204);
      expect(prismaMock.userRole.delete).toHaveBeenCalledWith({
        where: { userId_roleId: { userId: otherAdminId, roleId: 3 } },
      });
    });
  });
});
