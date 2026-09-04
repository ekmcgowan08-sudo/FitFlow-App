// Admin-user routes.
//
// The self-only, un-scoped workout-session GET/GET-list/PATCH routes
// that used to live here (from the original example wiring) have been
// superseded by src/routes/workout-session.routes.ts, which adds
// ADMIN/assigned-COACH scoping, a real start/add-exercise/log-set/
// complete/cancel lifecycle instead of a free-form status PATCH, and the
// streak side-effect on completion. See that file's header for the full
// route surface; single-session listing lives at GET /v1/workout-logs
// (workout-log.routes.ts), which already covers both ad-hoc and live
// sessions since they share the same WorkoutSession table.
//
// `authenticate` is applied once, centrally, in app.ts's protected
// sub-router — not here. Every router in src/routes/ used to run its own
// `router.use(authenticate)`, which meant a single request ran
// `authenticate` (and its `prisma.user.findUnique` re-check) once per
// mounted router it passed through before a route matched, not once per
// request.

import { Router, Response } from "express";
import { prisma } from "../lib/prisma-client";
import { requireRole } from "../rbac/rbac.middleware";
import { NotFoundError } from "../lib/errors";
import { AuthenticatedRequest } from "../auth/types";

const router = Router();

// GET /v1/users/me — the caller's own id/email/roles. `authenticate`
// already re-reads roles from the database into `req.user` on every
// request (see auth.middleware.ts), so this is a plain read of context
// that's already there, not an extra query. Exists because nothing in
// the JWT or the login/register response carries roles (deliberately —
// see token.service.ts: the access token only ever holds email/jti/sub,
// so a client can never present a stale or forged role from an old
// token), which otherwise leaves a caller with no way to know its own
// roles without this endpoint — needed by the web dashboard (web/) to
// decide what navigation/pages to show for the signed-in account.
router.get("/users/me", (req, res: Response) => {
  const { id, email, roles } = (req as AuthenticatedRequest).user;
  res.json({ id, email, roles });
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
