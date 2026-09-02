# FitFlow API Route Examples

These Express + TypeScript examples are designed to sit on top of the FitFlow Prisma schema.

## Files

- `routes.ts` — API route examples.
- `auth-middleware.ts` — JWT authentication and role middleware.

Prisma's TypeScript stack is commonly paired with route handlers that read from Prisma Client in a small service layer or directly inside routes.[web:147][web:154][web:192]

## Install

```bash
npm install express jsonwebtoken @prisma/client
npm install -D typescript tsx @types/express @types/jsonwebtoken
```

## Run

```ts
import express from 'express';
import api from './routes';

const app = express();
app.use(express.json());
app.use('/api', api);
app.listen(3000);
```

## Notes

- `authMiddleware` checks the bearer token, verifies it with `JWT_SECRET`, and attaches a typed `req.auth` object.
- `requireRole()` adds simple authorization for coach/admin-only routes.
- The route examples cover dashboard data, logs, meal plans, workout plans, exercises, check-ins, achievements, and coach assignment.

Prisma-backed APIs typically keep authentication and route handlers separate, with middleware handling identity and route handlers focusing on business logic.[web:186][web:187][web:191][web:193]


## Validation

The examples now include Zod schemas for `params`, `query`, and `body`, plus a reusable `validate()` middleware that parses and normalizes request input before the handler runs. Zod is commonly used in Express apps to validate route parameters, query strings, and request bodies with one schema source of truth.[web:198][web:201][web:203][web:209]

Additional files:

- `validation-schemas.ts` — route-level Zod schemas.
- `validation-middleware.ts` — reusable parser/validator middleware.
