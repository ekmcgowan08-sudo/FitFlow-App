// tests/rbac.middleware.test.ts
// Unit tests for rbac/rbac.middleware.ts: requireRole, requireAllRoles,
// requireSelfOrRole, and requireCoachOfClient. These are plain
// higher-order Express middleware, so they're exercised directly against
// fake req/res/next objects rather than through the full app/supertest —
// faster and pins down exact behavior (which error type, which details
// payload) without HTTP serialization noise.

import { Request, Response, NextFunction } from "express";
import { prismaMock } from "../__mocks__/@prisma/client";
import {
  requireRole,
  requireAllRoles,
  requireSelfOrRole,
  requireCoachOfClient,
} from "../rbac/rbac.middleware";
import { ForbiddenError, UnauthorizedError } from "../rbac/errors";
import { RequestUser } from "../rbac/types";

function makeUser(overrides: Partial<RequestUser> = {}): RequestUser {
  return {
    id: "user-1",
    email: "athlete@example.com",
    roles: ["USER"] as RequestUser["roles"],
    tokenId: "jti-1",
    ...overrides,
  };
}

function makeReq(opts: { user?: RequestUser; params?: Record<string, string> } = {}) {
  return {
    user: opts.user,
    params: opts.params ?? {},
  } as unknown as Request;
}

const res = {} as Response;

function makeNext() {
  return jest.fn() as unknown as NextFunction;
}

describe("requireRole", () => {
  it("calls next() with an UnauthorizedError when there is no authenticated user", () => {
    const next = makeNext();
    requireRole("ADMIN")(makeReq(), res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect((next as jest.Mock).mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);
  });

  it("calls next() with a ForbiddenError when the user lacks every listed role", () => {
    const next = makeNext();
    const req = makeReq({ user: makeUser({ roles: ["USER"] }) });

    requireRole("ADMIN", "COACH")(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = (next as jest.Mock).mock.calls[0][0];
    expect(err).toBeInstanceOf(ForbiddenError);
    expect(err.message).toMatch(/ADMIN, COACH/);
    expect(err.details).toEqual({ requiredRoles: ["ADMIN", "COACH"], userRoles: ["USER"] });
  });

  it("calls next() with no arguments when the user holds at least one of the listed roles", () => {
    const next = makeNext();
    const req = makeReq({ user: makeUser({ roles: ["COACH", "USER"] }) });

    requireRole("ADMIN", "COACH")(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });
});

describe("requireAllRoles", () => {
  it("calls next() with an UnauthorizedError when there is no authenticated user", () => {
    const next = makeNext();
    requireAllRoles("COACH", "SUBSCRIBER")(makeReq(), res, next);

    expect((next as jest.Mock).mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);
  });

  it("calls next() with a ForbiddenError listing exactly the missing roles", () => {
    const next = makeNext();
    const req = makeReq({ user: makeUser({ roles: ["COACH"] }) });

    requireAllRoles("COACH", "SUBSCRIBER")(req, res, next);

    const err = (next as jest.Mock).mock.calls[0][0];
    expect(err).toBeInstanceOf(ForbiddenError);
    expect(err.details).toEqual({ missingRoles: ["SUBSCRIBER"] });
  });

  it("calls next() with no arguments when the user holds every listed role", () => {
    const next = makeNext();
    const req = makeReq({ user: makeUser({ roles: ["COACH", "SUBSCRIBER", "USER"] }) });

    requireAllRoles("COACH", "SUBSCRIBER")(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });
});

describe("requireSelfOrRole", () => {
  it("calls next() with an UnauthorizedError when there is no authenticated user", () => {
    const next = makeNext();
    requireSelfOrRole("userId", "ADMIN")(makeReq({ params: { userId: "user-1" } }), res, next);

    expect((next as jest.Mock).mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);
  });

  it("allows a user acting on their own resource even without an elevated role", () => {
    const next = makeNext();
    const req = makeReq({
      user: makeUser({ id: "user-1", roles: ["USER"] }),
      params: { userId: "user-1" },
    });

    requireSelfOrRole("userId", "ADMIN")(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it("allows a different user through when they hold one of the elevated roles", () => {
    const next = makeNext();
    const req = makeReq({
      user: makeUser({ id: "admin-1", roles: ["ADMIN"] }),
      params: { userId: "someone-else" },
    });

    requireSelfOrRole("userId", "ADMIN")(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it("forbids a different user with no elevated role", () => {
    const next = makeNext();
    const req = makeReq({
      user: makeUser({ id: "user-2", roles: ["USER"] }),
      params: { userId: "someone-else" },
    });

    requireSelfOrRole("userId", "ADMIN")(req, res, next);

    const err = (next as jest.Mock).mock.calls[0][0];
    expect(err).toBeInstanceOf(ForbiddenError);
    expect(err.details).toEqual({ requiredRoles: ["ADMIN"] });
  });

  it("uses a custom param name when provided", () => {
    const next = makeNext();
    const req = makeReq({
      user: makeUser({ id: "coach-1", roles: ["COACH"] }),
      params: { coachId: "coach-1" },
    });

    requireSelfOrRole("coachId", "ADMIN")(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });
});

describe("requireCoachOfClient", () => {
  it("calls next() with an UnauthorizedError when there is no authenticated user", async () => {
    const next = makeNext();
    await requireCoachOfClient("clientId")(makeReq({ params: { clientId: "client-1" } }), res, next);

    expect((next as jest.Mock).mock.calls[0][0]).toBeInstanceOf(UnauthorizedError);
  });

  it("lets an ADMIN through without querying the coach/client relationship", async () => {
    const next = makeNext();
    const req = makeReq({
      user: makeUser({ id: "admin-1", roles: ["ADMIN"] }),
      params: { clientId: "client-1" },
    });

    await requireCoachOfClient("clientId")(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(prismaMock.coachClient.findUnique).not.toHaveBeenCalled();
  });

  it("allows a coach with an active assignment to the client", async () => {
    prismaMock.coachClient.findUnique.mockResolvedValueOnce({ status: "active" });
    const next = makeNext();
    const req = makeReq({
      user: makeUser({ id: "coach-1", roles: ["COACH"] }),
      params: { clientId: "client-1" },
    });

    await requireCoachOfClient("clientId")(req, res, next);

    expect(prismaMock.coachClient.findUnique).toHaveBeenCalledWith({
      where: {
        coachUserId_clientUserId: { coachUserId: "coach-1", clientUserId: "client-1" },
      },
      select: { status: true },
    });
    expect(next).toHaveBeenCalledWith();
  });

  it("forbids a coach with no relationship record for the client", async () => {
    prismaMock.coachClient.findUnique.mockResolvedValueOnce(null);
    const next = makeNext();
    const req = makeReq({
      user: makeUser({ id: "coach-1", roles: ["COACH"] }),
      params: { clientId: "someone-elses-client" },
    });

    await requireCoachOfClient("clientId")(req, res, next);

    const err = (next as jest.Mock).mock.calls[0][0];
    expect(err).toBeInstanceOf(ForbiddenError);
    expect(err.message).toMatch(/not the assigned coach/i);
  });

  it("forbids a coach whose assignment to the client is inactive", async () => {
    prismaMock.coachClient.findUnique.mockResolvedValueOnce({ status: "ended" });
    const next = makeNext();
    const req = makeReq({
      user: makeUser({ id: "coach-1", roles: ["COACH"] }),
      params: { clientId: "client-1" },
    });

    await requireCoachOfClient("clientId")(req, res, next);

    const err = (next as jest.Mock).mock.calls[0][0];
    expect(err).toBeInstanceOf(ForbiddenError);
  });

  it("defaults to the 'clientId' route param when none is specified", async () => {
    prismaMock.coachClient.findUnique.mockResolvedValueOnce({ status: "active" });
    const next = makeNext();
    const req = makeReq({
      user: makeUser({ id: "coach-1", roles: ["COACH"] }),
      params: { clientId: "client-1" },
    });

    await requireCoachOfClient()(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });
});
