# FitFlow Suite — RBAC Module Guide

This module adds role-based access control on top of the existing Prisma `User` → `Role` → `UserRole` schema. It gives you two equivalent ways to protect a route — a higher-order function (HOF) for plain Express route files, and a decorator for class-based controllers — plus centralized error handling so every 401/403 response has the same shape across the API.

## 0. Related docs

- [`REFRESH_TOKEN_ROTATION.md`](./REFRESH_TOKEN_ROTATION.md) — how login/refresh/logout and rate limiting work.
- [`../openapi/openapi.yaml`](../openapi/openapi.yaml) — full request/response contracts, including the role required for each route (`x-required-roles`).

## 1. Prerequisites

1. `authenticate` middleware (`after/auth.middleware.ts`) must run before any RBAC guard. It verifies the JWT, re-reads the user's current roles and status from Prisma, and attaches a typed `RequestUser` to the request.
2. Your Prisma schema must define a `RoleCode` enum and a `UserRole` join table (see `prisma/schema.prisma`). Add new roles by extending the enum — everything downstream (`requireRole`, `@Roles`, `hasRole`) is typed against it, so the compiler will flag any call site using a role that no longer exists.
3. Register the shared error handler **after** all your routes:

   ```ts
   import { rbacErrorHandler } from "./rbac/errors";
   app.use("/v1", authenticate, apiRouter);
   app.use(rbacErrorHandler); // must be last
   ```

## 2. Protecting a route — HOF style (recommended default)

Import a guard from `rbac/rbac.middleware.ts` and drop it into the route's middleware chain, between `authenticate` and your handler:

```ts
import { requireRole } from "../rbac/rbac.middleware";

// Single role
router.post("/admin/exercises", requireRole("ADMIN"), createExerciseHandler);

// Multiple roles allowed (OR)
router.post("/coach/training-plans", requireRole("COACH", "ADMIN"), createPlanHandler);
```

Available guards:

| Guard | Behavior | Use for |
|---|---|---|
| `requireRole(...roles)` | Passes if the user holds **any** of the listed roles | Most admin/coach-gated endpoints |
| `requireAllRoles(...roles)` | Passes only if the user holds **every** listed role | Cross-cutting premium features (e.g. coach *and* subscriber) |
| `requireSelfOrRole(paramName, ...roles)` | Passes if the route param (e.g. `:userId`) matches the caller's own id, or the caller holds an elevated role | "Users manage themselves, admins manage anyone" endpoints |
| `requireCoachOfClient(paramName)` | Passes for admins, or for coaches with an active `CoachClient` relationship to the target client — verified against Prisma, not just role membership | Coach actions scoped to a specific client (notes, plan assignment) |

All guards call `next(new ForbiddenError(...))` or `next(new UnauthorizedError(...))` on failure — they never write to `res` directly, so `rbacErrorHandler` is the single place the HTTP response is constructed.

## 3. Protecting a route — decorator style

If your codebase uses class-based controllers, annotate the method with `@Roles(...)` and bridge it into Express with `withRoleGuard`:

```ts
import { Roles, withRoleGuard } from "../rbac/rbac.decorator";

class GymPartnerController {
  @Roles("GYM_PARTNER", "ADMIN")
  async verifyCheckin(req: Request, res: Response) {
    res.status(200).json({ message: "check-in verified" });
  }
}

const controller = new GymPartnerController();
router.post(
  "/gyms/:gymId/checkins/:checkinId/verify",
  withRoleGuard(controller, "verifyCheckin")
);
```

Requires `reflect-metadata` and `"experimentalDecorators": true, "emitDecoratorMetadata": true` in `tsconfig.json`. Use this style only where you already have class-based controllers — for plain Express route files, prefer the HOF style; it's simpler to trace and doesn't need decorator metadata support.

## 4. Applying roles to FitFlow Suite's actual endpoints

Based on the access control model in the FitFlow Suite technical build pack, here's the recommended guard for each endpoint group:

| Endpoint | Guard |
|---|---|
| `POST /v1/auth/*`, `GET /v1/me` | `authenticate` only — no role restriction |
| `GET/PUT /v1/me/*`, `POST /v1/food-logs`, `POST /v1/hydration-logs`, `POST /v1/workout-sessions/*` | `authenticate` only; ownership enforced by Prisma `where: { userId: req.user.id }` (not a role check — every authenticated user acts on their own data) |
| `POST /v1/coach/training-plans`, `POST /v1/coach/meal-plans` | `requireRole("COACH", "ADMIN")` |
| `POST /v1/coach/notes`, `POST /v1/coach/assignments` | `requireRole("COACH", "ADMIN")` **then** `requireCoachOfClient("clientId")` |
| `POST /v1/gyms/:id/checkins` (partner verification variant) | `requireRole("GYM_PARTNER", "ADMIN")` |
| Admin catalog management (`exercises`, `foods`, `badges`), moderation, fraud review | `requireRole("ADMIN")` |
| `GET /v1/users/:userId/profile`, account settings | `requireSelfOrRole("userId", "ADMIN")` |
| Premium-only features gated behind a paid tier | `requireRole("SUBSCRIBER")`, or `requireAllRoles("COACH", "SUBSCRIBER")` for combined gates |

## 5. Error responses

Every guard failure produces a consistent JSON shape via `rbacErrorHandler`:

```json
// 401 — not authenticated
{ "error": { "code": "UNAUTHORIZED", "message": "Authentication required" } }

// 403 — authenticated but not permitted
{
  "error": {
    "code": "FORBIDDEN",
    "message": "This action requires one of the following roles: ADMIN",
    "details": { "requiredRoles": ["ADMIN"], "userRoles": ["USER"] }
  }
}
```

`details` is safe to log and safe to show in internal tooling, but consider stripping it in production responses to end users if you don't want to reveal your role taxonomy to API clients — that's a one-line change in `rbac/errors.ts`.

## 6. Testing checklist for a new protected route

- [ ] Request with no `Authorization` header → `401 UNAUTHORIZED`
- [ ] Request with an expired or tampered token → `401 UNAUTHORIZED`
- [ ] Request from an authenticated user without the required role → `403 FORBIDDEN`
- [ ] Request from an authenticated user with the required role, but for a resource they don't own (where applicable) → `404 NOT_FOUND` (never `200`)
- [ ] Request from an authenticated user with the required role, acting on their own/assigned resource → `200`/`201`/`204` as appropriate
- [ ] Role was revoked mid-session (e.g. demoted between two requests) → the very next request is denied, since `authenticate` re-reads roles from Prisma every time rather than trusting the JWT claim
