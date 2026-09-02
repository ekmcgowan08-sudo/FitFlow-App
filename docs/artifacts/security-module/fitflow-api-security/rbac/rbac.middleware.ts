// rbac/rbac.middleware.ts
// Higher-order-function RBAC guards for Express route handlers.
//
// This is the primary way to protect a route in FitFlow Suite's Express
// API. Each guard is a factory that returns Express middleware, so it
// composes directly into a route definition:
//
//   router.delete("/admin/users/:id", requireRole("ADMIN"), handler);
//
// All guards assume `authenticate` (see after/auth.middleware.ts) has
// already run and populated `req.user` with a database-confirmed
// RequestUser. They never trust role claims that weren't already verified
// by authenticate against Prisma.

import { Request, Response, NextFunction } from "express";
import { PrismaClient, RoleCode } from "@prisma/client";
import { AuthenticatedRequest, isAuthenticated, hasRole } from "./types";
import { ForbiddenError, UnauthorizedError } from "./errors";

const prisma = new PrismaClient();

/**
 * requireRole — allow the request through only if the authenticated user
 * holds at least one of the given roles.
 *
 * @example
 *   router.post("/coach/training-plans", requireRole("COACH", "ADMIN"), handler);
 */
export function requireRole(...roles: RoleCode[]) {
  return function requireRoleMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction
  ) {
    if (!isAuthenticated(req)) {
      return next(new UnauthorizedError());
    }

    if (!hasRole(req.user, ...roles)) {
      return next(
        new ForbiddenError(
          `This action requires one of the following roles: ${roles.join(", ")}`,
          { requiredRoles: roles, userRoles: req.user.roles }
        )
      );
    }

    return next();
  };
}

/**
 * requireAllRoles — stricter variant: the user must hold every listed
 * role simultaneously (e.g. a coach who must also be a verified
 * subscriber to access a premium coaching tool).
 */
export function requireAllRoles(...roles: RoleCode[]) {
  return function requireAllRolesMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction
  ) {
    if (!isAuthenticated(req)) {
      return next(new UnauthorizedError());
    }

    const missing = roles.filter((role) => !req.user.roles.includes(role));
    if (missing.length > 0) {
      return next(
        new ForbiddenError(
          `This action requires all of the following roles: ${roles.join(", ")}`,
          { missingRoles: missing }
        )
      );
    }

    return next();
  };
}

/**
 * requireSelfOrRole — allow the request if the authenticated user is
 * acting on their own resource (per a route param, e.g. :userId), OR
 * holds one of the given elevated roles. This is the common "users can
 * manage themselves, admins can manage anyone" pattern.
 *
 * @param paramName  the route param holding the target user id (default "userId")
 */
export function requireSelfOrRole(paramName = "userId", ...roles: RoleCode[]) {
  return function requireSelfOrRoleMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction
  ) {
    if (!isAuthenticated(req)) {
      return next(new UnauthorizedError());
    }

    const targetId = req.params[paramName];
    if (targetId && targetId === req.user.id) {
      return next();
    }

    if (hasRole(req.user, ...roles)) {
      return next();
    }

    return next(
      new ForbiddenError(
        "You may only access your own resources unless you hold an elevated role",
        { requiredRoles: roles }
      )
    );
  };
}

/**
 * requireCoachOfClient — domain-specific guard for FitFlow's coach ↔
 * client model. Confirms, via Prisma, that the authenticated coach is
 * actually assigned to the client referenced in the route (e.g.
 * :clientId), rather than trusting role membership alone. Admins bypass
 * the assignment check.
 *
 * @example
 *   router.post(
 *     "/coach/clients/:clientId/notes",
 *     requireRole("COACH", "ADMIN"),
 *     requireCoachOfClient("clientId"),
 *     handler
 *   );
 */
export function requireCoachOfClient(paramName = "clientId") {
  return async function requireCoachOfClientMiddleware(
    req: Request,
    _res: Response,
    next: NextFunction
  ) {
    if (!isAuthenticated(req)) {
      return next(new UnauthorizedError());
    }

    const authedReq = req as AuthenticatedRequest;

    if (hasRole(authedReq.user, "ADMIN")) {
      return next();
    }

    const clientId = req.params[paramName] as string;
    const relationship = await prisma.coachClient.findUnique({
      where: {
        coachUserId_clientUserId: {
          coachUserId: authedReq.user.id,
          clientUserId: clientId,
        },
      },
      select: { status: true },
    });

    if (!relationship || relationship.status !== "active") {
      return next(
        new ForbiddenError("You are not the assigned coach for this client")
      );
    }

    return next();
  };
}
