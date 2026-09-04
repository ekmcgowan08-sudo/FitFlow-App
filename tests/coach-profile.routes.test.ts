// tests/coach-profile.routes.test.ts
// Tests for src/routes/coach-profile.routes.ts.

import request from "supertest";
import jwt from "jsonwebtoken";
import { prismaMock } from "../__mocks__/@prisma/client";
import { createApp } from "../src/app";
import { JWT_ACCESS_SECRET, JWT_ISSUER, JWT_AUDIENCE } from "../src/lib/env";

const app = createApp();

const COACH_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_COACH_ID = "22222222-2222-4222-8222-222222222222";
const SPECIALTY_ID = "33333333-3333-4333-8333-333333333333";

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

describe("coach-profile routes", () => {
  describe("GET /v1/coach-profiles", () => {
    it("lets any authenticated user browse the directory", async () => {
      mockAuthedUser(COACH_ID, ["USER"]);
      prismaMock.coachProfile.findMany.mockResolvedValueOnce([{ userId: COACH_ID, displayName: "Alex" }]);
      prismaMock.coachProfile.count.mockResolvedValueOnce(1);

      const res = await request(app)
        .get("/v1/coach-profiles")
        .set("Authorization", `Bearer ${tokenFor(COACH_ID)}`);

      expect(res.status).toBe(200);
      expect(res.body.profiles).toHaveLength(1);
    });

    it("filters by acceptingClients", async () => {
      mockAuthedUser(COACH_ID);
      prismaMock.coachProfile.findMany.mockResolvedValueOnce([]);
      prismaMock.coachProfile.count.mockResolvedValueOnce(0);

      const res = await request(app)
        .get("/v1/coach-profiles?acceptingClients=true")
        .set("Authorization", `Bearer ${tokenFor(COACH_ID)}`);

      expect(res.status).toBe(200);
      expect(prismaMock.coachProfile.findMany.mock.calls[0][0].where).toEqual({ acceptsNewClients: true });
    });

    it("filters by acceptingClients=false correctly (not coerced to true)", async () => {
      // Regression test: query params always arrive as strings, and
      // z.coerce.boolean() runs them through JS's Boolean(x), under
      // which the literal string "false" is truthy — so this used to
      // silently return coaches WITH open rosters when a caller asked
      // for the opposite. See src/validation/shared.ts's strictBoolean.
      mockAuthedUser(COACH_ID);
      prismaMock.coachProfile.findMany.mockResolvedValueOnce([]);
      prismaMock.coachProfile.count.mockResolvedValueOnce(0);

      const res = await request(app)
        .get("/v1/coach-profiles?acceptingClients=false")
        .set("Authorization", `Bearer ${tokenFor(COACH_ID)}`);

      expect(res.status).toBe(200);
      expect(prismaMock.coachProfile.findMany.mock.calls[0][0].where).toEqual({ acceptsNewClients: false });
    });
  });

  describe("GET /v1/coach-profiles/:userId", () => {
    it("returns a single coach's profile with specialties", async () => {
      mockAuthedUser(COACH_ID, ["USER"]);
      prismaMock.coachProfile.findUnique.mockResolvedValueOnce({
        userId: COACH_ID,
        displayName: "Alex",
        specialties: [{ specialty: "powerlifting" }],
      });

      const res = await request(app)
        .get(`/v1/coach-profiles/${COACH_ID}`)
        .set("Authorization", `Bearer ${tokenFor(COACH_ID)}`);

      expect(res.status).toBe(200);
      expect(res.body.profile.specialties).toHaveLength(1);
    });

    it("returns 404 for a coach with no profile", async () => {
      mockAuthedUser(COACH_ID, ["USER"]);
      prismaMock.coachProfile.findUnique.mockResolvedValueOnce(null);

      const res = await request(app)
        .get(`/v1/coach-profiles/${OTHER_COACH_ID}`)
        .set("Authorization", `Bearer ${tokenFor(COACH_ID)}`);

      expect(res.status).toBe(404);
    });
  });

  describe("PATCH /v1/coach-profiles/:userId", () => {
    it("lets a coach create/update their own profile", async () => {
      mockAuthedUser(COACH_ID, ["COACH"]);
      prismaMock.coachProfile.upsert.mockResolvedValueOnce({ userId: COACH_ID, displayName: "Alex the Coach" });

      const res = await request(app)
        .patch(`/v1/coach-profiles/${COACH_ID}`)
        .set("Authorization", `Bearer ${tokenFor(COACH_ID)}`)
        .send({ displayName: "Alex the Coach", acceptsNewClients: true });

      expect(res.status).toBe(200);
    });

    it("forbids a plain USER from creating a coach profile for themselves", async () => {
      // Regression test: canWrite used to only check self-or-ADMIN, so
      // any authenticated USER could PATCH their own userId here and
      // appear in the public GET /coach-profiles directory despite never
      // having been granted the COACH role by anyone.
      const plainUserId = "33333333-3333-4333-8333-333333333333";
      mockAuthedUser(plainUserId, ["USER"]);

      const res = await request(app)
        .patch(`/v1/coach-profiles/${plainUserId}`)
        .set("Authorization", `Bearer ${tokenFor(plainUserId)}`)
        .send({ displayName: "Definitely A Real Coach", acceptsNewClients: true });

      expect(res.status).toBe(403);
      expect(prismaMock.coachProfile.upsert).not.toHaveBeenCalled();
    });

    it("forbids editing a different coach's profile without an elevated role", async () => {
      mockAuthedUser(COACH_ID, ["COACH"]);

      const res = await request(app)
        .patch(`/v1/coach-profiles/${OTHER_COACH_ID}`)
        .set("Authorization", `Bearer ${tokenFor(COACH_ID)}`)
        .send({ displayName: "Not yours" });

      expect(res.status).toBe(403);
      expect(prismaMock.coachProfile.upsert).not.toHaveBeenCalled();
    });

    it("does not silently reset acceptsNewClients when omitted from a displayName-only edit", async () => {
      // Regression test: acceptsNewClients used to carry a Zod
      // .default(true), so a coach who had stopped taking new clients
      // and then PATCHed only displayName (fixing a typo) would have
      // acceptsNewClients silently reset to true.
      mockAuthedUser(COACH_ID, ["COACH"]);
      prismaMock.coachProfile.upsert.mockResolvedValueOnce({ userId: COACH_ID, displayName: "Alex T. Coach" });

      const res = await request(app)
        .patch(`/v1/coach-profiles/${COACH_ID}`)
        .set("Authorization", `Bearer ${tokenFor(COACH_ID)}`)
        .send({ displayName: "Alex T. Coach" });

      expect(res.status).toBe(200);
      const upsertArgs = prismaMock.coachProfile.upsert.mock.calls[0][0];
      expect(upsertArgs.update).not.toHaveProperty("acceptsNewClients");
    });

    it("lets an ADMIN edit any coach's profile", async () => {
      mockAuthedUser("admin-1", ["ADMIN"]);
      prismaMock.coachProfile.upsert.mockResolvedValueOnce({ userId: OTHER_COACH_ID, displayName: "Set by admin" });

      const res = await request(app)
        .patch(`/v1/coach-profiles/${OTHER_COACH_ID}`)
        .set("Authorization", `Bearer ${tokenFor("admin-1")}`)
        .send({ displayName: "Set by admin" });

      expect(res.status).toBe(200);
    });
  });

  describe("specialties", () => {
    it("lets a coach add their own specialty", async () => {
      mockAuthedUser(COACH_ID, ["COACH"]);
      prismaMock.coachProfile.findUnique.mockResolvedValueOnce({ userId: COACH_ID, displayName: "Alex" });
      prismaMock.coachSpecialty.create.mockResolvedValueOnce({
        id: SPECIALTY_ID,
        coachUserId: COACH_ID,
        specialty: "Powerlifting",
      });

      const res = await request(app)
        .post(`/v1/coach-profiles/${COACH_ID}/specialties`)
        .set("Authorization", `Bearer ${tokenFor(COACH_ID)}`)
        .send({ specialty: "Powerlifting" });

      expect(res.status).toBe(201);
    });

    it("forbids adding a specialty to another coach's profile", async () => {
      mockAuthedUser(COACH_ID, ["COACH"]);

      const res = await request(app)
        .post(`/v1/coach-profiles/${OTHER_COACH_ID}/specialties`)
        .set("Authorization", `Bearer ${tokenFor(COACH_ID)}`)
        .send({ specialty: "Powerlifting" });

      expect(res.status).toBe(403);
      expect(prismaMock.coachSpecialty.create).not.toHaveBeenCalled();
    });

    it("requires a coach profile to exist before adding a specialty", async () => {
      mockAuthedUser(COACH_ID, ["COACH"]);
      prismaMock.coachProfile.findUnique.mockResolvedValueOnce(null);

      const res = await request(app)
        .post(`/v1/coach-profiles/${COACH_ID}/specialties`)
        .set("Authorization", `Bearer ${tokenFor(COACH_ID)}`)
        .send({ specialty: "Powerlifting" });

      expect(res.status).toBe(404);
      expect(prismaMock.coachSpecialty.create).not.toHaveBeenCalled();
    });

    it("removes a specialty owned by the caller", async () => {
      mockAuthedUser(COACH_ID, ["COACH"]);
      prismaMock.coachSpecialty.findUnique.mockResolvedValueOnce({ id: SPECIALTY_ID, coachUserId: COACH_ID });
      prismaMock.coachSpecialty.delete.mockResolvedValueOnce({ id: SPECIALTY_ID });

      const res = await request(app)
        .delete(`/v1/coach-profiles/${COACH_ID}/specialties/${SPECIALTY_ID}`)
        .set("Authorization", `Bearer ${tokenFor(COACH_ID)}`);

      expect(res.status).toBe(204);
    });

    it("returns 404 for a specialty belonging to a different coach", async () => {
      mockAuthedUser(COACH_ID, ["COACH"]);
      prismaMock.coachSpecialty.findUnique.mockResolvedValueOnce({ id: SPECIALTY_ID, coachUserId: OTHER_COACH_ID });

      const res = await request(app)
        .delete(`/v1/coach-profiles/${COACH_ID}/specialties/${SPECIALTY_ID}`)
        .set("Authorization", `Bearer ${tokenFor(COACH_ID)}`);

      expect(res.status).toBe(404);
      expect(prismaMock.coachSpecialty.delete).not.toHaveBeenCalled();
    });
  });
});
