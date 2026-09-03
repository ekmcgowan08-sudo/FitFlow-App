// tests/profile-extensions.routes.test.ts
// Tests for src/routes/profile-extensions.routes.ts: read = self or
// ADMIN/COACH; write = self or ADMIN only (a coach can see targets but
// not silently change them).

import request from "supertest";
import jwt from "jsonwebtoken";
import { prismaMock } from "../__mocks__/@prisma/client";
import { createApp } from "../src/app";
import { JWT_ACCESS_SECRET, JWT_ISSUER, JWT_AUDIENCE } from "../src/lib/env";

const app = createApp();

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";
const ALLERGY_ID = "33333333-3333-4333-8333-333333333333";

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

describe("profile-extensions routes", () => {
  describe("preferences", () => {
    it("lets the caller read their own preferences", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.userPreference.findUnique.mockResolvedValueOnce({ userId: USER_ID, goalStyle: "fat_loss" });

      const res = await request(app)
        .get(`/v1/members/${USER_ID}/preferences`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`);

      expect(res.status).toBe(200);
    });

    it("lets a COACH read an actively-assigned client's preferences but forbids a plain user", async () => {
      mockAuthedUser("coach-1", ["COACH"]);
      prismaMock.coachAssignment.findUnique.mockResolvedValueOnce({ relationshipStatus: "active" });
      prismaMock.userPreference.findUnique.mockResolvedValueOnce(null);

      const res = await request(app)
        .get(`/v1/members/${OTHER_ID}/preferences`)
        .set("Authorization", `Bearer ${tokenFor("coach-1")}`);

      expect(res.status).toBe(200);
    });

    it("forbids a COACH with no active assignment from reading a member's preferences", async () => {
      mockAuthedUser("coach-1", ["COACH"]);
      prismaMock.coachAssignment.findUnique.mockResolvedValueOnce(null);

      const res = await request(app)
        .get(`/v1/members/${OTHER_ID}/preferences`)
        .set("Authorization", `Bearer ${tokenFor("coach-1")}`);

      expect(res.status).toBe(403);
      expect(prismaMock.userPreference.findUnique).not.toHaveBeenCalled();
    });

    it("forbids a plain user from reading another member's preferences", async () => {
      mockAuthedUser(USER_ID, ["USER"]);

      const res = await request(app)
        .get(`/v1/members/${OTHER_ID}/preferences`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`);

      expect(res.status).toBe(403);
    });

    it("lets the caller update their own preferences", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.userPreference.upsert.mockResolvedValueOnce({ userId: USER_ID, goalStyle: "fat_loss" });

      const res = await request(app)
        .patch(`/v1/members/${USER_ID}/preferences`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`)
        .send({ goalStyle: "fat_loss" });

      expect(res.status).toBe(200);
    });

    it("forbids a COACH from writing a client's preferences (read-only for coaches)", async () => {
      mockAuthedUser("coach-1", ["COACH"]);

      const res = await request(app)
        .patch(`/v1/members/${OTHER_ID}/preferences`)
        .set("Authorization", `Bearer ${tokenFor("coach-1")}`)
        .send({ goalStyle: "fat_loss" });

      expect(res.status).toBe(403);
      expect(prismaMock.userPreference.upsert).not.toHaveBeenCalled();
    });

    it("lets an ADMIN write a member's preferences", async () => {
      mockAuthedUser("admin-1", ["ADMIN"]);
      prismaMock.userPreference.upsert.mockResolvedValueOnce({ userId: OTHER_ID, goalStyle: "fat_loss" });

      const res = await request(app)
        .patch(`/v1/members/${OTHER_ID}/preferences`)
        .set("Authorization", `Bearer ${tokenFor("admin-1")}`)
        .send({ goalStyle: "fat_loss" });

      expect(res.status).toBe(200);
    });
  });

  describe("health profile", () => {
    it("lets the caller read their own health profile", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.userHealthProfile.findUnique.mockResolvedValueOnce({ userId: USER_ID, calorieTarget: 2200 });

      const res = await request(app)
        .get(`/v1/members/${USER_ID}/health-profile`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`);

      expect(res.status).toBe(200);
      expect(res.body.healthProfile.calorieTarget).toBe(2200);
    });

    it("forbids a plain user from reading another member's health profile", async () => {
      mockAuthedUser(USER_ID, ["USER"]);

      const res = await request(app)
        .get(`/v1/members/${OTHER_ID}/health-profile`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`);

      expect(res.status).toBe(403);
      expect(prismaMock.userHealthProfile.findUnique).not.toHaveBeenCalled();
    });

    it("forbids a plain user from writing another member's health profile", async () => {
      mockAuthedUser(USER_ID, ["USER"]);

      const res = await request(app)
        .patch(`/v1/members/${OTHER_ID}/health-profile`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`)
        .send({ calorieTarget: 2200 });

      expect(res.status).toBe(403);
      expect(prismaMock.userHealthProfile.upsert).not.toHaveBeenCalled();
    });

    it("lets the caller update their own health profile", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.userHealthProfile.upsert.mockResolvedValueOnce({ userId: USER_ID, calorieTarget: 2200 });

      const res = await request(app)
        .patch(`/v1/members/${USER_ID}/health-profile`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`)
        .send({ calorieTarget: 2200 });

      expect(res.status).toBe(200);
    });
  });

  describe("allergies", () => {
    it("lets the caller read their own allergies", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.userAllergy.findMany.mockResolvedValueOnce([{ id: ALLERGY_ID, userId: USER_ID, allergyName: "peanuts" }]);

      const res = await request(app)
        .get(`/v1/members/${USER_ID}/allergies`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`);

      expect(res.status).toBe(200);
      expect(res.body.allergies).toHaveLength(1);
    });

    it("forbids a plain user from reading another member's allergies", async () => {
      mockAuthedUser(USER_ID, ["USER"]);

      const res = await request(app)
        .get(`/v1/members/${OTHER_ID}/allergies`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`);

      expect(res.status).toBe(403);
      expect(prismaMock.userAllergy.findMany).not.toHaveBeenCalled();
    });

    it("lets the caller add their own allergy", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.userAllergy.create.mockResolvedValueOnce({ id: ALLERGY_ID, userId: USER_ID, allergyName: "peanuts" });

      const res = await request(app)
        .post(`/v1/members/${USER_ID}/allergies`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`)
        .send({ allergyName: "peanuts" });

      expect(res.status).toBe(201);
    });

    it("forbids adding an allergy for someone else without an elevated role", async () => {
      mockAuthedUser(USER_ID, ["USER"]);

      const res = await request(app)
        .post(`/v1/members/${OTHER_ID}/allergies`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`)
        .send({ allergyName: "peanuts" });

      expect(res.status).toBe(403);
      expect(prismaMock.userAllergy.create).not.toHaveBeenCalled();
    });

    it("deletes the caller's own allergy", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.userAllergy.findUnique.mockResolvedValueOnce({ id: ALLERGY_ID, userId: USER_ID });
      prismaMock.userAllergy.delete.mockResolvedValueOnce({ id: ALLERGY_ID });

      const res = await request(app)
        .delete(`/v1/members/${USER_ID}/allergies/${ALLERGY_ID}`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`);

      expect(res.status).toBe(204);
    });

    it("returns 404 when the allergy belongs to a different member", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.userAllergy.findUnique.mockResolvedValueOnce({ id: ALLERGY_ID, userId: OTHER_ID });

      const res = await request(app)
        .delete(`/v1/members/${USER_ID}/allergies/${ALLERGY_ID}`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`);

      expect(res.status).toBe(404);
      expect(prismaMock.userAllergy.delete).not.toHaveBeenCalled();
    });
  });

  describe("medical notes (self/ADMIN only — stricter than allergies)", () => {
    it("lets the caller add their own medical note", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.userMedicalNote.create.mockResolvedValueOnce({
        id: ALLERGY_ID,
        userId: USER_ID,
        noteText: "Prior ACL surgery, 2023.",
      });

      const res = await request(app)
        .post(`/v1/members/${USER_ID}/medical-notes`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`)
        .send({ noteText: "Prior ACL surgery, 2023." });

      expect(res.status).toBe(201);
    });

    it("forbids adding a medical note for someone else without an elevated role", async () => {
      mockAuthedUser(USER_ID, ["USER"]);

      const res = await request(app)
        .post(`/v1/members/${OTHER_ID}/medical-notes`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`)
        .send({ noteText: "Not yours" });

      expect(res.status).toBe(403);
      expect(prismaMock.userMedicalNote.create).not.toHaveBeenCalled();
    });

    it("forbids removing a medical note for someone else without an elevated role", async () => {
      mockAuthedUser(USER_ID, ["USER"]);

      const res = await request(app)
        .delete(`/v1/members/${OTHER_ID}/medical-notes/${ALLERGY_ID}`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`);

      expect(res.status).toBe(403);
      expect(prismaMock.userMedicalNote.findUnique).not.toHaveBeenCalled();
    });

    it("forbids a COACH from reading a client's medical notes (unlike allergies)", async () => {
      mockAuthedUser("coach-1", ["COACH"]);

      const res = await request(app)
        .get(`/v1/members/${OTHER_ID}/medical-notes`)
        .set("Authorization", `Bearer ${tokenFor("coach-1")}`);

      expect(res.status).toBe(403);
      expect(prismaMock.userMedicalNote.findMany).not.toHaveBeenCalled();
    });

    it("lets an ADMIN read a member's medical notes", async () => {
      mockAuthedUser("admin-1", ["ADMIN"]);
      prismaMock.userMedicalNote.findMany.mockResolvedValueOnce([]);

      const res = await request(app)
        .get(`/v1/members/${OTHER_ID}/medical-notes`)
        .set("Authorization", `Bearer ${tokenFor("admin-1")}`);

      expect(res.status).toBe(200);
    });

    it("deletes the caller's own medical note", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.userMedicalNote.findUnique.mockResolvedValueOnce({ id: ALLERGY_ID, userId: USER_ID });
      prismaMock.userMedicalNote.delete.mockResolvedValueOnce({ id: ALLERGY_ID });

      const res = await request(app)
        .delete(`/v1/members/${USER_ID}/medical-notes/${ALLERGY_ID}`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`);

      expect(res.status).toBe(204);
    });

    it("returns 404 for a medical note belonging to a different member", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.userMedicalNote.findUnique.mockResolvedValueOnce({ id: ALLERGY_ID, userId: OTHER_ID });

      const res = await request(app)
        .delete(`/v1/members/${USER_ID}/medical-notes/${ALLERGY_ID}`)
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`);

      expect(res.status).toBe(404);
      expect(prismaMock.userMedicalNote.delete).not.toHaveBeenCalled();
    });
  });
});
