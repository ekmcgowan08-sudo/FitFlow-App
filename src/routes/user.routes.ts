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
import { RoleCode } from "@prisma/client";
import { prisma } from "../lib/prisma-client";
import { requireRole } from "../rbac/rbac.middleware";
import { validate } from "../middleware/validate";
import { grantRoleSchema, roleCodeParamsSchema, userIdParamsSchema, type GrantRoleInput } from "../validation/user.schema";
import { ForbiddenError, NotFoundError, ValidationError } from "../lib/errors";
import { translatePrismaError } from "../lib/domain-errors";
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

async function currentRoles(userId: string): Promise<{ id: string; email: string; roles: RoleCode[] }> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, email: true, roles: { select: { role: { select: { code: true } } } } },
  });
  return { id: user.id, email: user.email, roles: user.roles.map((r) => r.role.code) };
}

// POST /v1/admin/users/:id/roles (ADMIN only) — grant a role. Idempotent:
// granting a role the user already has is a no-op, not a conflict —
// there's nothing meaningfully different about "make sure this account
// is a COACH" succeeding whether or not it already was one.
//
// This (and the DELETE below) is the only way any account other than
// USER gets assigned — registration always hands out USER and nothing
// else (see auth.routes.ts), and there's deliberately no self-serve way
// to add a role, so an operator action is required. Before this
// existed, the only way to do it at all was a direct database write
// (see prisma/seed.ts, and this session's own manual testing).
router.post(
  "/admin/users/:id/roles",
  requireRole("ADMIN"),
  validate({ params: userIdParamsSchema, body: grantRoleSchema }),
  async (req, res: Response, next) => {
    try {
      const { id } = req.validated!.params as { id: string };
      const { code } = req.validated!.body as GrantRoleInput;

      const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
      if (!user) throw new NotFoundError("User not found");

      const role = await prisma.role.upsert({ where: { code }, update: {}, create: { code } });
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: id, roleId: role.id } },
        update: {},
        create: { userId: id, roleId: role.id },
      });

      res.status(200).json(await currentRoles(id));
    } catch (err) {
      next(translatePrismaError(err));
    }
  }
);

// DELETE /v1/admin/users/:id/roles/:code (ADMIN only) — revoke a role.
// Two guards beyond the obvious "user must actually have this role":
//   - Never leaves a user with zero roles: `authenticate` treats that as
//     "Account has no assigned roles" and rejects every request from
//     it, which is a confusing, hard-to-diagnose way to end up
//     effectively suspended — User.status already exists for
//     deliberately disabling an account.
//   - An ADMIN can't remove their OWN admin role — the classic
//     accidental-self-lockout footgun in any admin panel. A *different*
//     admin can still remove it; this only blocks self-service.
router.delete(
  "/admin/users/:id/roles/:code",
  requireRole("ADMIN"),
  validate({ params: roleCodeParamsSchema }),
  async (req, res: Response, next) => {
    try {
      const authedReq = req as AuthenticatedRequest;
      const { id, code } = req.validated!.params as { id: string; code: RoleCode };

      const user = await prisma.user.findUnique({
        where: { id },
        select: { id: true, roles: { select: { role: { select: { id: true, code: true } } } } },
      });
      if (!user) throw new NotFoundError("User not found");

      const assignment = user.roles.find((r) => r.role.code === code);
      if (!assignment) throw new NotFoundError("This user does not have that role.");

      if (user.roles.length === 1) {
        throw new ValidationError("Cannot remove a user's last remaining role.");
      }
      if (id === authedReq.user.id && code === RoleCode.ADMIN) {
        throw new ForbiddenError("You cannot remove your own ADMIN role. Have another admin do it.");
      }

      await prisma.userRole.delete({
        where: { userId_roleId: { userId: id, roleId: assignment.role.id } },
      });

      res.status(204).send();
    } catch (err) {
      next(translatePrismaError(err));
    }
  }
);

export default router;
