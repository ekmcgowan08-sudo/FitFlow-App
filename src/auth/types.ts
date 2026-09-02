// Canonical, strongly-typed request context shared by authentication and
// the RBAC layer: one closed definition, used everywhere, instead of an
// ad-hoc `req.user?: any` scattered across files.

import { Request } from "express";
import { RoleCode } from "@prisma/client";

export interface RequestUser {
  id: string;
  email: string;
  roles: RoleCode[];
  tokenId: string;
}

// A distinct type from Express's `Request`, not a global augmentation.
// Handlers that need an authenticated user declare `AuthenticatedRequest`
// explicitly, so forgetting to run `authenticate` first is a compile-time
// type error at the call site, not a runtime `undefined` surprise.
export interface AuthenticatedRequest extends Request {
  user: RequestUser;
}

export function isAuthenticated(req: Request): req is AuthenticatedRequest {
  const user = (req as Partial<AuthenticatedRequest>).user;
  return (
    !!user &&
    typeof user.id === "string" &&
    Array.isArray(user.roles) &&
    user.roles.length > 0
  );
}

export function hasRole(user: RequestUser, ...roles: RoleCode[]): boolean {
  return roles.some((role) => user.roles.includes(role));
}
