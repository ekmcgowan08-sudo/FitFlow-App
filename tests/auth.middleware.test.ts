// tests/auth.middleware.test.ts
// Unit tests for src/auth/auth.middleware.ts: bearer-token verification
// and the database re-check of role/active-status on every request.

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prismaMock } from "../__mocks__/@prisma/client";
import { authenticate } from "../src/auth/auth.middleware";
import { JWT_ACCESS_SECRET, JWT_ISSUER, JWT_AUDIENCE } from "../src/lib/env";
import { AuthenticatedRequest } from "../src/auth/types";

function signToken(overrides: Partial<{ sub: string; email: string; jti: string }> = {}, opts: jwt.SignOptions = {}) {
  const { sub, ...payloadOverrides } = overrides;
  const payload = { email: "athlete@example.com", jti: "jti-1", ...payloadOverrides };
  return jwt.sign(payload, JWT_ACCESS_SECRET, {
    subject: sub ?? "user-1",
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    expiresIn: 900,
    algorithm: "HS256",
    ...opts,
  });
}

function makeReq(headers: Record<string, string> = {}) {
  return { headers } as unknown as Request;
}

function makeRes() {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function makeNext() {
  return jest.fn() as unknown as NextFunction;
}

describe("authenticate", () => {
  it("rejects a request with no Authorization header", async () => {
    const req = makeReq();
    const res = makeRes();
    await authenticate(req, res, makeNext());

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: { code: "UNAUTHORIZED", message: "Authentication required" } });
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it("rejects a malformed Authorization header (not 'Bearer <token>')", async () => {
    const req = makeReq({ authorization: "Token abc123" });
    const res = makeRes();
    await authenticate(req, res, makeNext());

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("rejects a token signed with the wrong secret", async () => {
    const badToken = jwt.sign({ email: "athlete@example.com", jti: "jti-1" }, "wrong-secret", {
      subject: "user-1",
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      expiresIn: 900,
    });
    const req = makeReq({ authorization: `Bearer ${badToken}` });
    const res = makeRes();
    await authenticate(req, res, makeNext());

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("rejects a token whose issuer/audience don't match (cross-service reuse)", async () => {
    const foreignToken = jwt.sign({ email: "athlete@example.com", jti: "jti-1" }, JWT_ACCESS_SECRET, {
      subject: "user-1",
      issuer: "some-other-service",
      audience: JWT_AUDIENCE,
      expiresIn: 900,
    });
    const req = makeReq({ authorization: `Bearer ${foreignToken}` });
    const res = makeRes();
    await authenticate(req, res, makeNext());

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("rejects a valid token for an account that is no longer active", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "user-1",
      email: "athlete@example.com",
      status: "suspended",
      roles: [{ role: { code: "USER" } }],
    });
    const req = makeReq({ authorization: `Bearer ${signToken()}` });
    const res = makeRes();
    await authenticate(req, res, makeNext());

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("rejects a valid token for an account with no assigned roles", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "user-1",
      email: "athlete@example.com",
      status: "active",
      roles: [],
    });
    const req = makeReq({ authorization: `Bearer ${signToken()}` });
    const res = makeRes();
    await authenticate(req, res, makeNext());

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("attaches a database-confirmed RequestUser and calls next() for a valid token", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "user-1",
      email: "athlete@example.com",
      status: "active",
      roles: [{ role: { code: "USER" } }, { role: { code: "COACH" } }],
    });
    const req = makeReq({ authorization: `Bearer ${signToken({ sub: "user-1" })}` });
    const res = makeRes();
    const next = makeNext();

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect((req as AuthenticatedRequest).user).toEqual({
      id: "user-1",
      email: "athlete@example.com",
      roles: ["USER", "COACH"],
      tokenId: "jti-1",
    });
  });

  it("uses the ROLE LIST FROM THE DATABASE, not from the token, even if they'd differ", async () => {
    // The JWT itself carries no role claim at all in this implementation —
    // this test pins that behavior down: roles always come from the DB
    // re-check, never from anything embedded in the token.
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "user-1",
      email: "athlete@example.com",
      status: "active",
      roles: [{ role: { code: "ADMIN" } }],
    });
    const req = makeReq({ authorization: `Bearer ${signToken()}` });
    const res = makeRes();
    const next = makeNext();

    await authenticate(req, res, next);

    expect((req as AuthenticatedRequest).user.roles).toEqual(["ADMIN"]);
  });
});
