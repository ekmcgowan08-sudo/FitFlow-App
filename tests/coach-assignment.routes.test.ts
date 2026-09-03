// tests/coach-assignment.routes.test.ts
// Tests for src/routes/coach-assignment.routes.ts.

import request from "supertest";
import jwt from "jsonwebtoken";
import { prismaMock } from "../__mocks__/@prisma/client";
import { createApp } from "../src/app";
import { JWT_ACCESS_SECRET, JWT_ISSUER, JWT_AUDIENCE } from "../src/lib/env";

const app = createApp();

const COACH_ID = "11111111-1111-4111-8111-111111111111";
const CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_ID = "33333333-3333-4333-8333-333333333333";

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

describe("coach-assignment routes", () => {
  describe("GET /v1/coach/clients", () => {
    it("forbids a plain user (no COACH/ADMIN role)", async () => {
      mockAuthedUser(COACH_ID, ["USER"]);

      const res = await request(app).get("/v1/coach/clients").set("Authorization", `Bearer ${tokenFor(COACH_ID)}`);

      expect(res.status).toBe(403);
    });

    it("returns the caller's own roster for a COACH", async () => {
      mockAuthedUser(COACH_ID, ["COACH"]);
      prismaMock.coachAssignment.findMany.mockResolvedValueOnce([
        { coachUserId: COACH_ID, clientUserId: CLIENT_ID, client: { id: CLIENT_ID } },
      ]);

      const res = await request(app).get("/v1/coach/clients").set("Authorization", `Bearer ${tokenFor(COACH_ID)}`);

      expect(res.status).toBe(200);
      expect(prismaMock.coachAssignment.findMany).toHaveBeenCalledWith({
        where: { coachUserId: COACH_ID },
        include: { client: { omit: { passwordHash: true } } },
      });
    });

    it("forbids a COACH from viewing a different coach's roster", async () => {
      mockAuthedUser(COACH_ID, ["COACH"]);

      const res = await request(app)
        .get(`/v1/coach/clients?coachUserId=${OTHER_ID}`)
        .set("Authorization", `Bearer ${tokenFor(COACH_ID)}`);

      expect(res.status).toBe(403);
    });

    it("lets an ADMIN view any coach's roster", async () => {
      mockAuthedUser("admin-1", ["ADMIN"]);
      prismaMock.coachAssignment.findMany.mockResolvedValueOnce([]);

      const res = await request(app)
        .get(`/v1/coach/clients?coachUserId=${COACH_ID}`)
        .set("Authorization", `Bearer ${tokenFor("admin-1")}`);

      expect(res.status).toBe(200);
      expect(prismaMock.coachAssignment.findMany).toHaveBeenCalledWith({
        where: { coachUserId: COACH_ID },
        include: { client: { omit: { passwordHash: true } } },
      });
    });
  });

  describe("GET /v1/coach/coaches", () => {
    it("returns the caller's own coach relationships", async () => {
      mockAuthedUser(CLIENT_ID, ["USER"]);
      prismaMock.coachAssignment.findMany.mockResolvedValueOnce([
        { coachUserId: COACH_ID, clientUserId: CLIENT_ID, coach: { id: COACH_ID } },
      ]);

      const res = await request(app).get("/v1/coach/coaches").set("Authorization", `Bearer ${tokenFor(CLIENT_ID)}`);

      expect(res.status).toBe(200);
      expect(prismaMock.coachAssignment.findMany).toHaveBeenCalledWith({
        where: { clientUserId: CLIENT_ID },
        include: { coach: { omit: { passwordHash: true } } },
      });
    });

    it("forbids a plain user from requesting another client's coaches", async () => {
      mockAuthedUser(CLIENT_ID, ["USER"]);

      const res = await request(app)
        .get(`/v1/coach/coaches?clientUserId=${OTHER_ID}`)
        .set("Authorization", `Bearer ${tokenFor(CLIENT_ID)}`);

      expect(res.status).toBe(403);
    });
  });

  describe("POST /v1/coach/assignments", () => {
    it("creates a COACH-initiated assignment as pending, never active", async () => {
      mockAuthedUser(COACH_ID, ["COACH"]);
      prismaMock.coachAssignment.create.mockResolvedValueOnce({
        coachUserId: COACH_ID,
        clientUserId: CLIENT_ID,
        relationshipStatus: "pending",
      });

      const res = await request(app)
        .post("/v1/coach/assignments")
        .set("Authorization", `Bearer ${tokenFor(COACH_ID)}`)
        .send({ coachUserId: COACH_ID, clientUserId: CLIENT_ID });

      expect(res.status).toBe(201);
      expect(prismaMock.coachAssignment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ relationshipStatus: "pending" }) }),
      );
    });

    it("lets an ADMIN create an assignment that starts active immediately", async () => {
      mockAuthedUser("admin-1", ["ADMIN"]);
      prismaMock.coachAssignment.create.mockResolvedValueOnce({
        coachUserId: COACH_ID,
        clientUserId: CLIENT_ID,
        relationshipStatus: "active",
      });

      const res = await request(app)
        .post("/v1/coach/assignments")
        .set("Authorization", `Bearer ${tokenFor("admin-1")}`)
        .send({ coachUserId: COACH_ID, clientUserId: CLIENT_ID });

      expect(res.status).toBe(201);
      expect(prismaMock.coachAssignment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ relationshipStatus: "active" }) }),
      );
    });

    it("forbids a COACH from creating an assignment naming a different coach", async () => {
      mockAuthedUser(COACH_ID, ["COACH"]);

      const res = await request(app)
        .post("/v1/coach/assignments")
        .set("Authorization", `Bearer ${tokenFor(COACH_ID)}`)
        .send({ coachUserId: OTHER_ID, clientUserId: CLIENT_ID });

      expect(res.status).toBe(403);
      expect(prismaMock.coachAssignment.create).not.toHaveBeenCalled();
    });

    it("rejects coachUserId === clientUserId", async () => {
      mockAuthedUser(COACH_ID, ["COACH"]);

      const res = await request(app)
        .post("/v1/coach/assignments")
        .set("Authorization", `Bearer ${tokenFor(COACH_ID)}`)
        .send({ coachUserId: COACH_ID, clientUserId: COACH_ID });

      expect(res.status).toBe(400);
    });

    it("forbids a plain user (no COACH/ADMIN role) from creating an assignment", async () => {
      mockAuthedUser(COACH_ID, ["USER"]);

      const res = await request(app)
        .post("/v1/coach/assignments")
        .set("Authorization", `Bearer ${tokenFor(COACH_ID)}`)
        .send({ coachUserId: COACH_ID, clientUserId: CLIENT_ID });

      expect(res.status).toBe(403);
    });
  });

  describe("PATCH /v1/coach/assignments/:coachUserId/:clientUserId", () => {
    it("lets the client end the relationship", async () => {
      mockAuthedUser(CLIENT_ID, ["USER"]);
      prismaMock.coachAssignment.findUnique.mockResolvedValueOnce({ coachUserId: COACH_ID, clientUserId: CLIENT_ID });
      prismaMock.coachAssignment.update.mockResolvedValueOnce({
        coachUserId: COACH_ID,
        clientUserId: CLIENT_ID,
        relationshipStatus: "ended",
      });

      const res = await request(app)
        .patch(`/v1/coach/assignments/${COACH_ID}/${CLIENT_ID}`)
        .set("Authorization", `Bearer ${tokenFor(CLIENT_ID)}`)
        .send({ relationshipStatus: "ended" });

      expect(res.status).toBe(200);
    });

    it("forbids an unrelated user from updating the assignment", async () => {
      mockAuthedUser(OTHER_ID, ["USER"]);

      const res = await request(app)
        .patch(`/v1/coach/assignments/${COACH_ID}/${CLIENT_ID}`)
        .set("Authorization", `Bearer ${tokenFor(OTHER_ID)}`)
        .send({ relationshipStatus: "ended" });

      expect(res.status).toBe(403);
      expect(prismaMock.coachAssignment.update).not.toHaveBeenCalled();
    });

    it("returns 404 for an assignment that doesn't exist", async () => {
      mockAuthedUser(COACH_ID, ["COACH"]);
      prismaMock.coachAssignment.findUnique.mockResolvedValueOnce(null);

      const res = await request(app)
        .patch(`/v1/coach/assignments/${COACH_ID}/${CLIENT_ID}`)
        .set("Authorization", `Bearer ${tokenFor(COACH_ID)}`)
        .send({ relationshipStatus: "ended" });

      expect(res.status).toBe(404);
    });

    it("forbids the coach from self-activating their own pending request", async () => {
      mockAuthedUser(COACH_ID, ["COACH"]);
      prismaMock.coachAssignment.findUnique.mockResolvedValueOnce({
        coachUserId: COACH_ID,
        clientUserId: CLIENT_ID,
        relationshipStatus: "pending",
      });

      const res = await request(app)
        .patch(`/v1/coach/assignments/${COACH_ID}/${CLIENT_ID}`)
        .set("Authorization", `Bearer ${tokenFor(COACH_ID)}`)
        .send({ relationshipStatus: "active" });

      expect(res.status).toBe(403);
      expect(prismaMock.coachAssignment.update).not.toHaveBeenCalled();
    });

    it("lets the client accept and activate a pending coaching request", async () => {
      mockAuthedUser(CLIENT_ID, ["USER"]);
      prismaMock.coachAssignment.findUnique.mockResolvedValueOnce({
        coachUserId: COACH_ID,
        clientUserId: CLIENT_ID,
        relationshipStatus: "pending",
      });
      prismaMock.coachAssignment.update.mockResolvedValueOnce({
        coachUserId: COACH_ID,
        clientUserId: CLIENT_ID,
        relationshipStatus: "active",
      });

      const res = await request(app)
        .patch(`/v1/coach/assignments/${COACH_ID}/${CLIENT_ID}`)
        .set("Authorization", `Bearer ${tokenFor(CLIENT_ID)}`)
        .send({ relationshipStatus: "active" });

      expect(res.status).toBe(200);
      expect(res.body.assignment.relationshipStatus).toBe("active");
    });

    it("lets an ADMIN activate a pending request on the client's behalf", async () => {
      mockAuthedUser("admin-1", ["ADMIN"]);
      prismaMock.coachAssignment.findUnique.mockResolvedValueOnce({
        coachUserId: COACH_ID,
        clientUserId: CLIENT_ID,
        relationshipStatus: "pending",
      });
      prismaMock.coachAssignment.update.mockResolvedValueOnce({
        coachUserId: COACH_ID,
        clientUserId: CLIENT_ID,
        relationshipStatus: "active",
      });

      const res = await request(app)
        .patch(`/v1/coach/assignments/${COACH_ID}/${CLIENT_ID}`)
        .set("Authorization", `Bearer ${tokenFor("admin-1")}`)
        .send({ relationshipStatus: "active" });

      expect(res.status).toBe(200);
    });

    it("lets the coach update notes on a pending request without activating it", async () => {
      mockAuthedUser(COACH_ID, ["COACH"]);
      prismaMock.coachAssignment.findUnique.mockResolvedValueOnce({
        coachUserId: COACH_ID,
        clientUserId: CLIENT_ID,
        relationshipStatus: "pending",
      });
      prismaMock.coachAssignment.update.mockResolvedValueOnce({
        coachUserId: COACH_ID,
        clientUserId: CLIENT_ID,
        relationshipStatus: "pending",
        notes: "Following up next week",
      });

      const res = await request(app)
        .patch(`/v1/coach/assignments/${COACH_ID}/${CLIENT_ID}`)
        .set("Authorization", `Bearer ${tokenFor(COACH_ID)}`)
        .send({ notes: "Following up next week" });

      expect(res.status).toBe(200);
    });
  });
});
