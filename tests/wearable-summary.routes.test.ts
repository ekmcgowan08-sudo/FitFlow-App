// tests/wearable-summary.routes.test.ts
// Tests for src/routes/wearable-summary.routes.ts.

import request from "supertest";
import jwt from "jsonwebtoken";
import { prismaMock } from "../__mocks__/@prisma/client";
import { createApp } from "../src/app";
import { JWT_ACCESS_SECRET, JWT_ISSUER, JWT_AUDIENCE } from "../src/lib/env";

const app = createApp();

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";

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

describe("wearable-summary routes", () => {
  describe("POST /v1/wearable-summaries", () => {
    it("lets the caller sync their own daily summary", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.wearableDailySummary.upsert.mockResolvedValueOnce({
        userId: USER_ID,
        summaryDate: "2026-06-01",
        steps: 10000,
      });

      const res = await request(app)
        .post("/v1/wearable-summaries")
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`)
        .send({ userId: USER_ID, summaryDate: "2026-06-01", steps: 10000 });

      expect(res.status).toBe(201);
      expect(prismaMock.wearableDailySummary.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_summaryDate: { userId: USER_ID, summaryDate: new Date("2026-06-01") } },
        }),
      );
    });

    it("forbids syncing wearable data for someone else, even for a COACH", async () => {
      mockAuthedUser("coach-1", ["COACH"]);

      const res = await request(app)
        .post("/v1/wearable-summaries")
        .set("Authorization", `Bearer ${tokenFor("coach-1")}`)
        .send({ userId: OTHER_ID, summaryDate: "2026-06-01", steps: 10000 });

      expect(res.status).toBe(403);
      expect(prismaMock.wearableDailySummary.upsert).not.toHaveBeenCalled();
    });

    it("lets an ADMIN sync on a member's behalf", async () => {
      mockAuthedUser("admin-1", ["ADMIN"]);
      prismaMock.wearableDailySummary.upsert.mockResolvedValueOnce({ userId: OTHER_ID, summaryDate: "2026-06-01" });

      const res = await request(app)
        .post("/v1/wearable-summaries")
        .set("Authorization", `Bearer ${tokenFor("admin-1")}`)
        .send({ userId: OTHER_ID, summaryDate: "2026-06-01", steps: 5000 });

      expect(res.status).toBe(201);
    });
  });

  describe("GET /v1/wearable-summaries", () => {
    it("defaults to the caller's own userId", async () => {
      mockAuthedUser(USER_ID);
      prismaMock.wearableDailySummary.findMany.mockResolvedValueOnce([]);
      prismaMock.wearableDailySummary.count.mockResolvedValueOnce(0);

      const res = await request(app)
        .get("/v1/wearable-summaries")
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`);

      expect(res.status).toBe(200);
      expect(prismaMock.wearableDailySummary.findMany.mock.calls[0][0].where.userId).toBe(USER_ID);
    });

    it("lets a COACH read (but not write) a client's summaries", async () => {
      mockAuthedUser("coach-1", ["COACH"]);
      prismaMock.wearableDailySummary.findMany.mockResolvedValueOnce([]);
      prismaMock.wearableDailySummary.count.mockResolvedValueOnce(0);

      const res = await request(app)
        .get(`/v1/wearable-summaries?userId=${OTHER_ID}`)
        .set("Authorization", `Bearer ${tokenFor("coach-1")}`);

      expect(res.status).toBe(200);
    });

    it("rejects from after to", async () => {
      mockAuthedUser(USER_ID);

      const res = await request(app)
        .get("/v1/wearable-summaries?from=2026-06-10&to=2026-06-01")
        .set("Authorization", `Bearer ${tokenFor(USER_ID)}`);

      expect(res.status).toBe(400);
    });
  });
});
