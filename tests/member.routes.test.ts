// tests/member.routes.test.ts
// Tests for src/routes/member.routes.ts, which wires the repository
// pattern (MemberRepository) + Zod validation into the canonical schema.
// Pins down the access-control fix described in
// docs/architecture/canonical-schema-decisions.md: a plain member can no
// longer enumerate every other member's profile.

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

describe("member routes", () => {
  describe("GET /v1/members", () => {
    it("forbids a plain USER from listing all members", async () => {
      mockAuthedUser("user-1", ["USER"]);

      const res = await request(app)
        .get("/v1/members")
        .set("Authorization", `Bearer ${tokenFor("user-1")}`);

      expect(res.status).toBe(403);
      expect(prismaMock.user.findMany).not.toHaveBeenCalled();
    });

    it("allows an ADMIN to list members, paginated", async () => {
      mockAuthedUser("admin-1", ["ADMIN"]);
      prismaMock.user.findMany.mockResolvedValueOnce([{ id: "user-2" }]);

      const res = await request(app)
        .get("/v1/members?page=2&pageSize=10")
        .set("Authorization", `Bearer ${tokenFor("admin-1")}`);

      expect(res.status).toBe(200);
      expect(prismaMock.user.findMany).toHaveBeenCalledWith({
        take: 10,
        skip: 10,
        omit: { passwordHash: true },
      });
    });

    it("forbids a COACH from listing the entire member directory (use GET /v1/coach/clients instead)", async () => {
      mockAuthedUser("coach-1", ["COACH"]);

      const res = await request(app)
        .get("/v1/members")
        .set("Authorization", `Bearer ${tokenFor("coach-1")}`);

      expect(res.status).toBe(403);
      expect(prismaMock.user.findMany).not.toHaveBeenCalled();
    });
  });

  describe("GET /v1/members/:id", () => {
    it("rejects a non-UUID id before it ever reaches the repository", async () => {
      // Self-match (so the RBAC guard passes it through) but not a valid
      // UUID, so the Zod params validator is what rejects it.
      mockAuthedUser("not-a-uuid", ["USER"]);

      const res = await request(app)
        .get("/v1/members/not-a-uuid")
        .set("Authorization", `Bearer ${tokenFor("not-a-uuid")}`);

      expect(res.status).toBe(400);
      expect(prismaMock.user.findUnique).toHaveBeenCalledTimes(1); // only the auth lookup
    });

    it("allows a user to fetch their own profile", async () => {
      const userId = "11111111-1111-4111-8111-111111111111";
      mockAuthedUser(userId, ["USER"]);
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: userId,
        profile: { firstName: "Jamie" },
        goals: [],
      });

      const res = await request(app)
        .get(`/v1/members/${userId}`)
        .set("Authorization", `Bearer ${tokenFor(userId)}`);

      expect(res.status).toBe(200);
      // passwordHash must never round-trip in an API response.
      expect(prismaMock.user.findUnique.mock.calls[1][0]).toMatchObject({
        omit: { passwordHash: true },
      });
      expect(res.body.member.id).toBe(userId);
    });

    it("forbids reading a different member's profile without an elevated role", async () => {
      mockAuthedUser("user-1", ["USER"]);
      const otherId = "22222222-2222-4222-8222-222222222222";

      const res = await request(app)
        .get(`/v1/members/${otherId}`)
        .set("Authorization", `Bearer ${tokenFor("user-1")}`);

      expect(res.status).toBe(403);
      expect(prismaMock.user.findUnique).toHaveBeenCalledTimes(1); // only the auth lookup
    });

    it("allows a COACH to read the profile of a client they're actively assigned to", async () => {
      mockAuthedUser("coach-1", ["COACH"]);
      const clientId = "22222222-2222-4222-8222-222222222222";
      prismaMock.coachAssignment.findUnique.mockResolvedValueOnce({ relationshipStatus: "active" });
      prismaMock.user.findUnique.mockResolvedValueOnce({
        id: clientId,
        profile: { firstName: "Client" },
        goals: [],
      });

      const res = await request(app)
        .get(`/v1/members/${clientId}`)
        .set("Authorization", `Bearer ${tokenFor("coach-1")}`);

      expect(res.status).toBe(200);
      expect(res.body.member.id).toBe(clientId);
    });

    it("forbids a COACH with no active assignment from reading a member's profile", async () => {
      mockAuthedUser("coach-1", ["COACH"]);
      const otherId = "22222222-2222-4222-8222-222222222222";
      prismaMock.coachAssignment.findUnique.mockResolvedValueOnce(null);

      const res = await request(app)
        .get(`/v1/members/${otherId}`)
        .set("Authorization", `Bearer ${tokenFor("coach-1")}`);

      expect(res.status).toBe(403);
      expect(prismaMock.user.findUnique).toHaveBeenCalledTimes(1); // only the auth lookup
    });
  });

  describe("PATCH /v1/members/:id", () => {
    it("lets a user update their own profile", async () => {
      const userId = "22222222-2222-4222-8222-222222222222";
      mockAuthedUser(userId, ["USER"]);
      prismaMock.userProfile.upsert.mockResolvedValueOnce({
        userId,
        firstName: "Jamie",
        heightCm: 180,
      });

      const res = await request(app)
        .patch(`/v1/members/${userId}`)
        .set("Authorization", `Bearer ${tokenFor(userId)}`)
        .send({ heightCm: 180 });

      expect(res.status).toBe(200);
    });

    it("does not silently reset timezone when omitted from a partial update", async () => {
      // Regression test: timezone used to carry a Zod .default() that
      // still applied under .partial(), so any PATCH omitting timezone
      // silently overwrote the member's real timezone with the default.
      const userId = "22222222-2222-4222-8222-222222222222";
      mockAuthedUser(userId, ["USER"]);
      prismaMock.userProfile.upsert.mockResolvedValueOnce({ userId, heightCm: 180 });

      const res = await request(app)
        .patch(`/v1/members/${userId}`)
        .set("Authorization", `Bearer ${tokenFor(userId)}`)
        .send({ heightCm: 180 });

      expect(res.status).toBe(200);
      const upsertArgs = prismaMock.userProfile.upsert.mock.calls[0][0];
      expect(upsertArgs.update).not.toHaveProperty("timezone");
    });

    it("forbids a plain user from updating someone else's profile", async () => {
      mockAuthedUser("user-1", ["USER"]);
      const otherId = "33333333-3333-4333-8333-333333333333";

      const res = await request(app)
        .patch(`/v1/members/${otherId}`)
        .set("Authorization", `Bearer ${tokenFor("user-1")}`)
        .send({ heightCm: 180 });

      expect(res.status).toBe(403);
    });

    it("persists birthDate and sexAtBirth", async () => {
      const userId = "22222222-2222-4222-8222-222222222222";
      mockAuthedUser(userId, ["USER"]);
      prismaMock.userProfile.upsert.mockResolvedValueOnce({
        userId,
        birthDate: "1995-03-14",
        sexAtBirth: "female",
      });

      const res = await request(app)
        .patch(`/v1/members/${userId}`)
        .set("Authorization", `Bearer ${tokenFor(userId)}`)
        .send({ birthDate: "1995-03-14", sexAtBirth: "female" });

      expect(res.status).toBe(200);
      const upsertArgs = prismaMock.userProfile.upsert.mock.calls[0][0];
      expect(upsertArgs.update.birthDate).toEqual(new Date("1995-03-14"));
      expect(upsertArgs.update.sexAtBirth).toBe("female");
    });

    it("rejects fields the API doesn't manage (strict schema)", async () => {
      const userId = "22222222-2222-4222-8222-222222222222";
      mockAuthedUser(userId, ["USER"]);

      const res = await request(app)
        .patch(`/v1/members/${userId}`)
        .set("Authorization", `Bearer ${tokenFor(userId)}`)
        .send({ email: "new@example.com" });

      expect(res.status).toBe(400);
      expect(prismaMock.userProfile.upsert).not.toHaveBeenCalled();
    });
  });
});
