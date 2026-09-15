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

  describe("registerRateLimiter (5 requests / hour by default, keyed by ip)", () => {
    const originalMax = process.env.REGISTER_RATE_LIMIT_MAX;

    afterEach(() => {
      if (originalMax === undefined) {
        delete process.env.REGISTER_RATE_LIMIT_MAX;
      } else {
        process.env.REGISTER_RATE_LIMIT_MAX = originalMax;
      }
      jest.resetModules();
    });

    // jest.resetModules() gives rate-limit.middleware (and everything it
    // imports, including lib/errors) a brand-new module instance — so
    // errorHandler must come from that SAME fresh require, not the
    // top-level import above. Otherwise the freshly-constructed
    // TooManyRequestsError fails `instanceof AppError` against the
    // *original* AppError class the top-level errorHandler checks
    // against, and every request 500s instead of 429ing.
    function buildFreshProbeApp(limiter: RequestHandler, freshErrorHandler: RequestHandler) {
      const app = express();
      app.use(express.json());
      app.post("/probe", limiter, (_req, res) => res.status(200).json({ ok: true }));
      app.use(freshErrorHandler);
      return app;
    }

    it("allows the first 5 requests and blocks the 6th with 429 when REGISTER_RATE_LIMIT_MAX is unset", async () => {
      delete process.env.REGISTER_RATE_LIMIT_MAX;
      jest.resetModules();
      const { registerRateLimiter: freshLimiter } = require("../src/rbac/rate-limit.middleware");
      const { errorHandler: freshErrorHandler } = require("../src/lib/errors");
      const app = buildFreshProbeApp(freshLimiter, freshErrorHandler);

      for (let i = 0; i < 5; i++) {
        const res = await request(app).post("/probe").send({});
        expect(res.status).toBe(200);
      }

      const blocked = await request(app).post("/probe").send({});
      expect(blocked.status).toBe(429);
      expect(blocked.body.error.message).toMatch(/too many registration attempts/i);
    });

    // This is exactly the env var that fixes CI: the E2E suite registers
    // more than 5 fresh test accounts from the single runner IP in one
    // run, which would otherwise trip the production-tuned default on
    // every single run regardless of flakiness — see ci.yml's e2e job.
    it("respects a raised REGISTER_RATE_LIMIT_MAX", async () => {
      process.env.REGISTER_RATE_LIMIT_MAX = "8";
      jest.resetModules();
      const { registerRateLimiter: freshLimiter } = require("../src/rbac/rate-limit.middleware");
      const { errorHandler: freshErrorHandler } = require("../src/lib/errors");
      const app = buildFreshProbeApp(freshLimiter, freshErrorHandler);

      for (let i = 0; i < 8; i++) {
        const res = await request(app).post("/probe").send({});
        expect(res.status).toBe(200);
      }

      const blocked = await request(app).post("/probe").send({});
      expect(blocked.status).toBe(429);
    });
  });
});
