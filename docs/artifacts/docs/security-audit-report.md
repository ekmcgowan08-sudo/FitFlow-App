# FitFlow Suite — API Security Audit

**Scope:** authentication middleware, workout-session and admin API routes, and the request-context TypeScript types for FitFlow Suite's Express + Prisma backend.
**Focus areas:** JWT handling, Prisma query scoping, HTTP status code consistency, and TypeScript interface integrity for `req.user`.
**Method:** static code review against the OWASP API Security Top 10 (2023) and the JWT/Prisma/Express best-practice guidance already captured in FitFlow Suite's own technical build pack (auth, roles, audit logging, encryption in transit/at rest).
**Files reviewed:** `before/auth.middleware.ts`, `before/user.routes.ts`, `before/types.ts` (reference implementation reflecting the pattern the current stack follows). Remediated versions ship alongside this report as `after/auth.middleware.ts`, `after/user.routes.ts`, `after/types.ts`, and the new `rbac/` module.

## Summary

| # | Finding | Category | Severity | Status |
|---|---|---|---|---|
| 1 | No algorithm allow-list in `jwt.verify()` | JWT handling | High | Fixed |
| 2 | Hardcoded fallback JWT secret | JWT handling | Critical | Fixed |
| 3 | Bearer token accepted from query string | JWT handling | Medium | Fixed |
| 4 | No issuer/audience validation; role trusted from token, never re-checked against DB | JWT handling | High | Fixed |
| 5 | Missing token short-circuits to "anonymous" instead of rejecting | JWT handling / status codes | High | Fixed |
| 6 | `findUnique`/`update` scoped only by resource id, not by owning user (BOLA/IDOR) | Prisma query scoping | Critical | Fixed |
| 7 | `findMany` with no `where` clause returns all users' data | Prisma query scoping | Critical | Fixed |
| 8 | Client-supplied `userId` trusted in write payload (mass assignment) | Prisma query scoping | Critical | Fixed |
| 9 | Admin-only route has no role check | Prisma query scoping / RBAC | Critical | Fixed |
| 10 | Auth failures return 500 instead of 401, leaking library error text | HTTP status codes | Medium | Fixed |
| 11 | "Not found" returns 200 with `null` body | HTTP status codes | Low | Fixed |
| 12 | Successful delete returns 200 with empty body instead of 204 | HTTP status codes | Low | Fixed |
| 13 | `req.user?: any` via global Express augmentation | TS interface integrity | High | Fixed |
| 14 | `role` typed as free-form `string`, not a closed union/enum | TS interface integrity | Medium | Fixed |

---

## 1–5. Secure JWT handling

### Finding 1 — No algorithm allow-list

```ts
// before/auth.middleware.ts
const payload = jwt.verify(token, JWT_SECRET) as any;
```

`jwt.verify()` without an explicit `algorithms` option will accept any algorithm the token header declares that the underlying key supports. If the app ever mixes symmetric and asymmetric keys, or a library upgrade changes default behavior, this opens the door to classic **algorithm-confusion attacks** — a forged token can be accepted as valid. This maps to OWASP API2:2023 (Broken Authentication).

**Fix** — pin the exact algorithm(s) the service issues, plus issuer/audience claims:

```ts
// after/auth.middleware.ts
const payload = jwt.verify(token, JWT_ACCESS_SECRET, {
  algorithms: ["HS256"],
  issuer: JWT_ISSUER,
  audience: JWT_AUDIENCE,
  clockTolerance: 5,
}) as FitFlowAccessTokenPayload;
```

### Finding 2 — Hardcoded fallback secret

```ts
// before
const JWT_SECRET = process.env.JWT_SECRET || "fitflow-dev-secret";
```

If `JWT_SECRET` is ever unset — a staging box with a missing `.env`, a CI runner, a container that dropped its secret mount — the service silently signs and verifies tokens with a **hardcoded, source-controlled string**. Anyone who has read the repository can forge valid access tokens for any user, including admins.

**Fix** — fail at process startup, not at request time:

```ts
// after
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
const JWT_ACCESS_SECRET = requireEnv("JWT_ACCESS_SECRET");
```

### Finding 3 — Bearer token accepted from query string

```ts
// before
const token = header?.split(" ")[1] || (req.query.token as string);
```

Query strings are written to CDN/proxy access logs, browser history, and Referer headers on outbound links. Accepting a bearer token there turns a short-lived credential into something that can leak long after the request completes.

**Fix** — read the token only from the `Authorization` header:

```ts
// after
if (!header?.startsWith("Bearer ")) {
  throw new UnauthorizedError("Missing or malformed Authorization header");
}
const token = header.slice("Bearer ".length).trim();
```

### Finding 4 — Role trusted from the token payload, never re-verified

```ts
// before
req.user = payload; // whatever role claim the token carries is trusted as-is
```

A JWT's claims are only as current as the moment it was issued. If an admin is demoted, a user is banned, or a coach's client list changes, none of that takes effect until the (possibly long-lived) access token naturally expires.

**Fix** — re-read roles and account status from Prisma on every request, and treat the token only as proof of identity, not proof of current permissions:

```ts
// after
const dbUser = await prisma.user.findUnique({
  where: { id: payload.sub },
  select: { id: true, email: true, status: true, roles: { select: { role: { select: { code: true } } } } },
});
if (!dbUser || dbUser.status !== "active") throw new UnauthorizedError("Account is not active");
```

### Finding 5 — Missing token silently continues as "anonymous"

```ts
// before
if (!token) {
  return next(); // request proceeds with no req.user
}
```

This inverts the fail-safe default: every route handler is individually responsible for remembering to check `req.user` before touching sensitive data. One handler that forgets is an unauthenticated data leak. Fail closed instead — see Finding 10 for the corresponding status-code fix.

---

## 6–9. Prisma query scoping

### Finding 6 — Resource lookups scoped only by id (BOLA / IDOR)

```ts
// before
const session = await prisma.workoutSession.findUnique({ where: { id: req.params.id } });
```

This is **OWASP API1:2023 — Broken Object Level Authorization**. Any authenticated user can read (or, in the `PATCH` handler, modify) any other user's workout session simply by supplying a different UUID. There is no ownership check anywhere in the query.

**Fix** — always include the authenticated user's id as part of the `where` clause, never as a post-fetch check:

```ts
// after
const session = await prisma.workoutSession.findFirst({
  where: { id: req.params.id, userId: authedReq.user.id },
});
```

### Finding 7 — List endpoint with no scoping at all

```ts
// before
const sessions = await prisma.workoutSession.findMany(); // every user's data
```

**Fix**:

```ts
// after
const sessions = await prisma.workoutSession.findMany({
  where: { userId: authedReq.user.id },
  orderBy: { startedAt: "desc" },
});
```

### Finding 8 — Mass assignment via client-supplied `userId`

```ts
// before
const { userId, status } = req.body;
await prisma.workoutSession.update({ where: { id: req.params.id }, data: { userId, status } });
```

Accepting `userId` from the request body lets a client reassign a record's ownership, and combined with Finding 6, lets any client edit records they don't own. Never let write payloads set identity/ownership fields.

**Fix** — derive ownership from `req.user`, never from the body, and use a compound `where` on `updateMany` so zero rows are touched if the caller doesn't own the record:

```ts
// after
const { status } = req.body as { status?: string };
const result = await prisma.workoutSession.updateMany({
  where: { id: req.params.id, userId: authedReq.user.id },
  data: { ...(status ? { status } : {}) },
});
if (result.count === 0) throw new NotFoundError("Workout session not found");
```

### Finding 9 — Admin route with no role enforcement

```ts
// before
router.delete("/admin/users/:id", async (req, res) => {
  await prisma.user.delete({ where: { id: req.params.id } });
  return res.status(200).send();
});
```

`authenticate` only proves *some* valid session exists — it says nothing about the caller's role. This route is reachable by any logged-in trainee.

**Fix** — compose the role guard directly into the route definition (see the new `rbac/` module):

```ts
// after
router.delete("/admin/users/:id", requireRole("ADMIN"), handler);
```

---

## 10–12. HTTP status code consistency

| Scenario | Before | After | Why it matters |
|---|---|---|---|
| Invalid/expired/malformed token | `500` + raw library error message | `401` with `{ error: { code: "UNAUTHORIZED", message: "Authentication required" } }` | 500 implies a server bug, not a client auth problem, and breaks client retry/redirect-to-login logic. Leaking the raw error string can fingerprint the JWT library/version. |
| No token supplied | request proceeds anonymously (`200` from downstream handler) | `401` from `authenticate` itself | Fails closed instead of relying on every handler to remember to check `req.user`. |
| Resource not found / not owned by caller | `200` with `null` body | `404` with `{ error: { code: "NOT_FOUND", ... } }` | Clients can't reliably branch on body shape; some HTTP clients/caches treat `200` as cacheable success regardless of payload. |
| Missing role for an admin action | not enforced (see Finding 9) | `403` with `{ error: { code: "FORBIDDEN", ... } }` | Distinguishes "you're not logged in" (401) from "you're logged in but not allowed" (403) — critical for client UX and for security monitoring/alerting. |
| Successful delete | `200` + empty body | `204 No Content` | Matches REST convention used elsewhere in the API; empty `200` responses are ambiguous about whether a body was expected. |
| Invalid `status` value in a PATCH body | not validated | `400` with `{ error: { code: "VALIDATION_ERROR", ... } }` | Separates client input errors (400) from auth errors (401/403) so error-handling code on the client can react correctly. |

**Fix, centralized:** all remediated routes throw one of four typed errors (`UnauthorizedError` → 401, `ForbiddenError` → 403, `NotFoundError` → 404, `ValidationError` → 400) and forward them with `next(err)`. A single `rbacErrorHandler` (see `rbac/errors.ts`) is the only place that maps an error type to a status code and a JSON shape, so the contract can't drift route-by-route.

---

## 13–14. TypeScript interface integrity for the user request context

### Finding 13 — `req.user` is optional and typed `any` via global augmentation

```ts
// before/types.ts
declare global {
  namespace Express {
    interface Request { user?: any; }
  }
}
```

Two problems compound here:
- `any` disables all compiler checking on `req.user` — a typo like `req.user.rol` compiles cleanly and fails silently at runtime.
- Because the augmentation lives on `Express.Request` itself, **every** route — even ones that never run `authenticate` — type-checks as if `req.user` might be present. There is no compile-time signal that a given handler requires authentication.

**Fix** — stop augmenting the global `Request`. Introduce a distinct `AuthenticatedRequest` type and a runtime type guard, so "this handler needs an authenticated user" is visible in the function signature, not just in a comment:

```ts
// rbac/types.ts
export interface AuthenticatedRequest extends Request {
  user: RequestUser; // required, not optional
}
export function isAuthenticated(req: Request): req is AuthenticatedRequest {
  const user = (req as Partial<AuthenticatedRequest>).user;
  return !!user && typeof user.id === "string" && Array.isArray(user.roles) && user.roles.length > 0;
}
```

Every handler that needs `req.user` now calls `isAuthenticated(req)` first (a real runtime check, not just a cast) before narrowing to `AuthenticatedRequest`.

### Finding 14 — `role` typed as a free-form string

```ts
// before
export interface RequestUser { id?: string; email?: string; role?: string; }
```

`"Admin"`, `"admin"`, `" admin"`, and `"administrator"` all type-check as valid `role` values. A comparison bug (`req.user.role !== "Admin"`) or a data-entry typo in a seed script silently fails open or closed instead of being caught by the compiler.

**Fix** — source the role type directly from the Prisma-generated enum, and store roles as an array (a user can hold more than one):

```ts
// rbac/types.ts
import { RoleCode } from "@prisma/client"; // ADMIN | COACH | SUBSCRIBER | USER | GYM_PARTNER | SUPPORT_OPS
export interface RequestUser {
  id: string;
  email: string;
  roles: RoleCode[];
  tokenId: string;
}
```

Because `RoleCode` is generated from `prisma/schema.prisma`, adding, renaming, or removing a role is a single schema change that the compiler propagates everywhere `RoleCode` is used — including every `requireRole(...)` call site.

---

## Files in this package

```
fitflow-api-security/
├── SECURITY_AUDIT_REPORT.md   ← this report
├── prisma/schema.prisma       ← identity/roles slice the middleware relies on
├── before/                    ← reference implementation showing the findings above
│   ├── auth.middleware.ts
│   ├── user.routes.ts
│   └── types.ts
├── after/                     ← remediated versions of the same three files
│   ├── auth.middleware.ts
│   ├── user.routes.ts
│   └── types.ts
├── rbac/                      ← new RBAC module (see docs/RBAC_GUIDE.md)
│   ├── types.ts
│   ├── errors.ts
│   ├── rbac.middleware.ts
│   ├── rbac.decorator.ts
│   └── example.routes.ts
└── docs/
    └── RBAC_GUIDE.md
```

## Recommended follow-ups beyond this audit

- Rotate `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` immediately if the hardcoded fallback (Finding 2) has ever been deployed, since it may be considered compromised.
- Add refresh-token rotation and revocation using the `RefreshToken` model in `prisma/schema.prisma` (`revokedAt`, `replacedBy`) — not implemented in this pass, but the schema is ready for it.
- Add rate limiting on `/v1/auth/login` and `/v1/auth/refresh` to blunt credential-stuffing and refresh-token replay attempts, per the mobile API hardening guidance already captured in FitFlow's build pack.
- Add an audit log entry (actor id, action, target id, timestamp) on every `requireRole("ADMIN")`-gated mutation, consistent with the "audit logs for coach edits, check-in overrides, and plan assignments" control already planned for the product.
