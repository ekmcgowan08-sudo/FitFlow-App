// rbac/rbac.decorator.ts
// Decorator-based alternative to rbac.middleware.ts, for teams that write
// controllers as classes (e.g. routing-controllers, NestJS-style, or a
// custom class-based controller layer) instead of chaining Express
// middleware inline. Both approaches share the same authorization logic
// (`hasRole`) and the same error types, so behavior is identical — pick
// whichever fits your controller style.
//
// Requires: npm install reflect-metadata   (and "experimentalDecorators":
// true, "emitDecoratorMetadata": true in tsconfig.json)

import "reflect-metadata";
import { Request, Response, NextFunction } from "express";
import { RoleCode } from "@prisma/client";
import { isAuthenticated, hasRole } from "./types";
import { ForbiddenError, UnauthorizedError } from "./errors";

const ROLES_METADATA_KEY = Symbol("fitflow:required-roles");

/**
 * @Roles decorator — annotate a controller method with the roles allowed
 * to call it.
 *
 * @example
 *   class CoachController {
 *     @Roles("COACH", "ADMIN")
 *     async createTrainingPlan(req: AuthenticatedRequest, res: Response) {
 *       // ...
 *     }
 *   }
 */
export function Roles(...roles: RoleCode[]): MethodDecorator {
  return function decorate(target, propertyKey) {
    Reflect.defineMetadata(ROLES_METADATA_KEY, roles, target, propertyKey);
  };
}

function getRequiredRoles(target: object, propertyKey: string | symbol): RoleCode[] | undefined {
  return Reflect.getMetadata(ROLES_METADATA_KEY, target, propertyKey);
}

/**
 * withRoleGuard — wraps a decorated controller method into a plain Express
 * request handler that enforces whatever roles `@Roles` declared. This is
 * the bridge between the decorator metadata and Express's middleware
 * chain, since Express itself doesn't execute decorators.
 *
 * @example
 *   const controller = new CoachController();
 *   router.post(
 *     "/coach/training-plans",
 *     authenticate,
 *     withRoleGuard(controller, "createTrainingPlan")
 *   );
 */
export function withRoleGuard<T extends object>(
  controller: T,
  methodName: keyof T & string
) {
  const requiredRoles = getRequiredRoles(controller, methodName) ?? [];

  return async function guardedHandler(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      if (!isAuthenticated(req)) {
        throw new UnauthorizedError();
      }

      if (requiredRoles.length > 0 && !hasRole(req.user, ...requiredRoles)) {
        throw new ForbiddenError(
          `This action requires one of the following roles: ${requiredRoles.join(", ")}`,
          { requiredRoles, userRoles: req.user.roles }
        );
      }

      const method = controller[methodName] as unknown as (
        req: Request,
        res: Response,
        next: NextFunction
      ) => unknown;

      await method.call(controller, req, res, next);
    } catch (err) {
      next(err);
    }
  };
}
