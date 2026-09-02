// Authenticated workout-session and admin-user routes.
//
// `authenticate` is applied once, centrally, in app.ts's protected
// sub-router — not here. Every router in src/routes/ used to run its own
// `router.use(authenticate)`, which meant a single request ran
// `authenticate` (and its `prisma.user.findUnique` re-check) once per
// mounted router it passed through before a route matched, not once per
// request.

import { Router, Response } from "express";
import { prisma } from "../lib/prisma-client";
import { AuthenticatedRequest, isAuthenticated } from "../auth/types";
import { requireRole } from "../rbac/rbac.middleware";
import { ForbiddenError, NotFoundError, ValidationError } from "../lib/errors";

const router = Router();

// GET /v1/workout-sessions/:id
router.get("/workout-sessions/:id", async (req, res: Response, next) => {
  try {
    if (!isAuthenticated(req)) throw new ForbiddenError();
    const authedReq = req as AuthenticatedRequest;

    // Scoped by BOTH id and owning user id in the same `where` clause, so
    // a request for a session that exists but belongs to someone else
    // returns nothing — no BOLA/IDOR path exists here.
    const sessionId = req.params.id as string;
    const session = await prisma.workoutSession.findFirst({
      where: { id: sessionId, userId: authedReq.user.id },
      include: { sessionExercises: { include: { sets: true } } },
    });

    if (!session) {
      // A missing/not-owned resource is always 404, never 200 with a null body.
      throw new NotFoundError("Workout session not found");
    }

    return res.status(200).json(session);
  } catch (err) {
    return next(err);
  }
});

// GET /v1/workout-sessions
router.get("/workout-sessions", async (req, res: Response, next) => {
  try {
    if (!isAuthenticated(req)) throw new ForbiddenError();
    const authedReq = req as AuthenticatedRequest;

    // Every list endpoint is scoped by the authenticated user's id. There
    // is no code path that returns cross-user data by default.
    const sessions = await prisma.workoutSession.findMany({
      where: { userId: authedReq.user.id },
      orderBy: { startedAt: "desc" },
    });

    return res.status(200).json(sessions);
  } catch (err) {
    return next(err);
  }
});

// PATCH /v1/workout-sessions/:id
router.patch("/workout-sessions/:id", async (req, res: Response, next) => {
  try {
    if (!isAuthenticated(req)) throw new ForbiddenError();
    const authedReq = req as AuthenticatedRequest;

    // `userId` is never accepted from the request body — ownership can't
    // be reassigned by the client.
    const { status } = req.body as { status?: string };
    const allowedStatuses = ["in_progress", "completed", "cancelled"];
    if (status && !allowedStatuses.includes(status)) {
      throw new ValidationError("Invalid status value");
    }

    // `updateMany` with a compound `where` (id + userId) updates zero rows
    // if the caller doesn't own the record, instead of `update` blindly
    // targeting by id alone.
    const sessionId = req.params.id as string;
    const result = await prisma.workoutSession.updateMany({
      where: { id: sessionId, userId: authedReq.user.id },
      data: { ...(status ? { status: status as never } : {}) },
    });

    if (result.count === 0) {
      throw new NotFoundError("Workout session not found");
    }

    const updated = await prisma.workoutSession.findFirst({
      where: { id: sessionId, userId: authedReq.user.id },
    });
    return res.status(200).json(updated);
  } catch (err) {
    return next(err);
  }
});

// DELETE /v1/admin/users/:id  (admin-only)
// `requireRole("ADMIN")` is composed directly into the route definition,
// so the authorization requirement is visible at a glance and can't be
// "forgotten" inside a handler body.
router.delete(
  "/admin/users/:id",
  requireRole("ADMIN"),
  async (req, res: Response, next) => {
    try {
      const targetUserId = req.params.id as string;
      const existing = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { id: true },
      });
      if (!existing) {
        throw new NotFoundError("User not found");
      }

      await prisma.user.delete({ where: { id: targetUserId } });

      return res.status(204).send();
    } catch (err) {
      return next(err);
    }
  }
);

export default router;
