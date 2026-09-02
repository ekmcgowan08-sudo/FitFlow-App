// tests/streak.routes.test.ts
// Tests for src/routes/streak.routes.ts.

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

describe("streak routes", () => {
  it("returns the caller's own streaks by default", async () => {
    mockAuthedUser(USER_ID);
    prismaMock.streak.findMany.mockResolvedValueOnce([
      { id: "s1", userId: USER_ID, streakType: "workout", currentCount: 3, bestCount: 5 },
    ]);

    const res = await request(app).get("/v1/streaks").set("Authorization", `Bearer ${tokenFor(USER_ID)}`);

    expect(res.status).toBe(200);
    expect(prismaMock.streak.findMany).toHaveBeenCalledWith({ where: { userId: USER_ID } });
    expect(res.body.streaks).toHaveLength(1);
  });

  it("forbids a plain user from requesting another member's streaks", async () => {
    mockAuthedUser(USER_ID, ["USER"]);

    const res = await request(app)
      .get(`/v1/streaks?userId=${OTHER_ID}`)
      .set("Authorization", `Bearer ${tokenFor(USER_ID)}`);

    expect(res.status).toBe(403);
    expect(prismaMock.streak.findMany).not.toHaveBeenCalled();
  });

  it("lets a COACH request a specific member's streaks", async () => {
    mockAuthedUser("coach-1", ["COACH"]);
    prismaMock.streak.findMany.mockResolvedValueOnce([]);

    const res = await request(app)
      .get(`/v1/streaks?userId=${OTHER_ID}`)
      .set("Authorization", `Bearer ${tokenFor("coach-1")}`);

    expect(res.status).toBe(200);
    expect(prismaMock.streak.findMany).toHaveBeenCalledWith({ where: { userId: OTHER_ID } });
  });

  it("rejects a non-UUID userId query param", async () => {
    mockAuthedUser(USER_ID);

    const res = await request(app)
      .get("/v1/streaks?userId=not-a-uuid")
      .set("Authorization", `Bearer ${tokenFor(USER_ID)}`);

    expect(res.status).toBe(400);
  });
});
