// after/types.ts
// Thin re-export so app code under `after/` and `rbac/` share one
// canonical definition of the request-context types. See rbac/types.ts
// for the actual definitions and rationale.

export type { RequestUser, AuthenticatedRequest } from "../rbac/types";
export { isAuthenticated, hasRole } from "../rbac/types";
