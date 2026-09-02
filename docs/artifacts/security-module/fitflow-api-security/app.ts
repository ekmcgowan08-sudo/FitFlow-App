// app.ts
// Assembles the Express application (middleware + routers) without
// starting a listener, so the exact same app instance can be used by
// server.ts (real process) and by tests (supertest, no open socket).

import express, { Express } from "express";
import authRoutes from "./after/auth.routes";
import userRoutes from "./after/user.routes";
import exampleRoutes from "./rbac/example.routes";
import { rbacErrorHandler } from "./rbac/errors";

export function createApp(): Express {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());

  // Unauthenticated liveness/readiness probe for docker-compose and load balancers.
  app.get("/healthz", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  // /auth/* — no bearer token required.
  app.use("/v1", authRoutes);

  // Everything below requires a verified bearer token (see after/user.routes.ts
  // and rbac/example.routes.ts, both of which run `authenticate` first).
  app.use("/v1", userRoutes);
  app.use("/v1", exampleRoutes);

  // Central error handler — must be registered last.
  app.use(rbacErrorHandler);

  return app;
}

export default createApp;
