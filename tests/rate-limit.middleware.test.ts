// tests/rate-limit.middleware.test.ts
// Dedicated tests for rbac/rate-limit.middleware.ts, isolated from the
// auth route tests so accumulated request counts never interfere with
// each other. Each limiter is mounted on a tiny throwaway Express app.

import express, { RequestHandler } from "express";
import request from "supertest";
import { loginRateLimiter, refreshRateLimiter } from "../src/rbac/rate-limit.middleware";
import { errorHandler } from "../src/lib/errors";

function buildProbeApp(limiter: RequestHandler) {
  const app = express();
  app.use(express.json());
  app.post("/probe", limiter, (_req, res) => res.status(200).json({ ok: true }));
  app.use(errorHandler);
  return app;
}

describe("rate-limit middleware", () => {
  describe("loginRateLimiter (10 requests / 15 min, keyed by ip+email)", () => {
    it("allows the first 10 requests and blocks the 11th with 429", async () => {
      const app = buildProbeApp(loginRateLimiter);
      const payload = { email: "spammer@example.com" };

      for (let i = 0; i < 10; i++) {
        const res = await request(app).post("/probe").send(payload);
        expect(res.status).toBe(200);
      }

      const blocked = await request(app).post("/probe").send(payload);
      expect(blocked.status).toBe(429);
      expect(blocked.body.error.code).toBe("TOO_MANY_REQUESTS");
      expect(blocked.body.error.message).toMatch(/too many login attempts/i);
    });

    it("scopes the limit per email, so a different email is unaffected", async () => {
      const app = buildProbeApp(loginRateLimiter);

      for (let i = 0; i < 10; i++) {
        await request(app).post("/probe").send({ email: "victim-a@example.com" });
      }
      const blockedA = await request(app).post("/probe").send({ email: "victim-a@example.com" });
      expect(blockedA.status).toBe(429);

      const stillOkForB = await request(app).post("/probe").send({ email: "victim-b@example.com" });
      expect(stillOkForB.status).toBe(200);
    });
  });

  describe("refreshRateLimiter (30 requests / 15 min, keyed by ip)", () => {
    it("allows the first 30 requests and blocks the 31st with 429", async () => {
      const app = buildProbeApp(refreshRateLimiter);

      for (let i = 0; i < 30; i++) {
        const res = await request(app).post("/probe").send({});
        expect(res.status).toBe(200);
      }

      const blocked = await request(app).post("/probe").send({});
      expect(blocked.status).toBe(429);
      expect(blocked.body.error.message).toMatch(/too many token refresh attempts/i);
    });
  });
});
