// tests/rbac.decorator.test.ts
// Unit tests for src/rbac/rbac.decorator.ts: the @Roles decorator and the
// withRoleGuard bridge that turns a decorated class method into a plain
// Express handler. Verifies the decorator-based path enforces exactly
// the same authorization rules as rbac.middleware.ts, using a small
// throwaway controller class.

import "reflect-metadata";
import { Request, Response, NextFunction } from "express";
import { Roles, withRoleGuard } from "../src/rbac/rbac.decorator";
import { ForbiddenError, UnauthorizedError } from "../src/lib/errors";
import { RequestUser } from "../src/auth/types";

function makeUser(overrides: Partial<RequestUser> = {}): RequestUser {
  return {
    id: "user-1",
    email: "athlete@example.com",
    roles: ["USER"] as RequestUser["roles"],
    tokenId: "jti-1",
    ...overrides,
  };
}

function makeReq(user?: RequestUser) {
  return { user } as unknown as Request;
}

const res = {} as Response;

function makeNext() {
  return jest.fn() as unknown as NextFunction;
}

class TrainingPlanController {
  public calledWith: { req: Request; res: Response } | null = null;

  @Roles("COACH", "ADMIN")
  async createTrainingPlan(req: Request, res: Response) {
    this.calledWith = { req, res };
    return "created";
  }

  // No @Roles at all — withRoleGuard should treat this as "any
  // authenticated user may call it" (requiredRoles defaults to []).
  async listOwnWorkouts(req: Request, res: Response) {
    this.calledWith = { req, res };
    return "listed";
  }

  @Roles("ADMIN")
  async explode() {
    throw new Error("boom");
  }
}

describe("@Roles + withRoleGuard", () => {
  let controller: TrainingPlanController;

  beforeEach(() => {
    controller = new TrainingPlanController();
  });

  it("forwards an UnauthorizedError when there is no authenticated user", async () => {
    const next = makeNext();
    const handler = withRoleGuard(controller, "createTrainingPlan");

    await handler(makeReq(undefined), res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect((next as jest.Mock).mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);
    expect(controller.calledWith).toBeNull();
  });

  it("forwards a ForbiddenError when the user lacks every role declared by @Roles", async () => {
    const next = makeNext();
    const handler = withRoleGuard(controller, "createTrainingPlan");
    const req = makeReq(makeUser({ roles: ["USER"] }));

    await handler(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = (next as jest.Mock).mock.calls[0][0];
    expect(err).toBeInstanceOf(ForbiddenError);
    expect(err.message).toMatch(/COACH, ADMIN/);
    expect(err.details).toEqual({ requiredRoles: ["COACH", "ADMIN"], userRoles: ["USER"] });
    expect(controller.calledWith).toBeNull();
  });

  it("invokes the underlying method, bound to the controller instance, when the role matches", async () => {
    const next = makeNext();
    const handler = withRoleGuard(controller, "createTrainingPlan");
    const req = makeReq(makeUser({ roles: ["COACH"] }));

    await handler(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(controller.calledWith).toEqual({ req, res });
  });

  it("allows any authenticated user through for a method with no @Roles decorator", async () => {
    const next = makeNext();
    const handler = withRoleGuard(controller, "listOwnWorkouts");
    const req = makeReq(makeUser({ roles: ["USER"] }));

    await handler(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(controller.calledWith).toEqual({ req, res });
  });

  it("still requires authentication for a method with no @Roles decorator", async () => {
    const next = makeNext();
    const handler = withRoleGuard(controller, "listOwnWorkouts");

    await handler(makeReq(undefined), res, next);

    expect((next as jest.Mock).mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);
    expect(controller.calledWith).toBeNull();
  });

  it("catches an error thrown inside the wrapped method and forwards it to next()", async () => {
    const next = makeNext();
    const handler = withRoleGuard(controller, "explode");
    const req = makeReq(makeUser({ roles: ["ADMIN"] }));

    await handler(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = (next as jest.Mock).mock.calls[0][0];
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("boom");
  });
});
