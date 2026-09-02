// Assembles the Express application (middleware + routers) without
// starting a listener, so the exact same app instance can be used by
// server.ts (real process) and by tests (supertest, no open socket).

import express, { Express, Router } from 'express';
import { registerFitFlowErrorMap } from './lib/zod-error-map';
import { authenticate } from './auth/auth.middleware';
import authRoutes from './auth/auth.routes';
import userRoutes from './routes/user.routes';
import memberRoutes from './routes/member.routes';
import workoutLogRoutes from './routes/workout-log.routes';
import rbacExampleRoutes from './routes/rbac-examples.routes';
import { errorHandler } from './lib/errors';

registerFitFlowErrorMap();

export function createApp(): Express {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());

  // Unauthenticated liveness/readiness probe for docker-compose and load balancers.
  app.get('/healthz', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // /v1/auth/* — no bearer token required.
  app.use('/v1', authRoutes);

  // Everything below requires a verified bearer token. `authenticate` is
  // applied exactly ONCE here, on a single shared sub-router, rather than
  // inside each route file: mounting several routers directly at the
  // same '/v1' prefix, each running its own `router.use(authenticate)`,
  // would re-run `authenticate` (and its `prisma.user.findUnique`
  // re-check) once per router a request passes through before a route
  // matches — not once per request.
  const protectedRoutes = Router();
  protectedRoutes.use(authenticate);
  protectedRoutes.use(userRoutes);
  protectedRoutes.use(memberRoutes);
  protectedRoutes.use(workoutLogRoutes);
  protectedRoutes.use(rbacExampleRoutes);
  app.use('/v1', protectedRoutes);

  // Central error handler — must be registered last.
  app.use(errorHandler);

  return app;
}

export default createApp;
