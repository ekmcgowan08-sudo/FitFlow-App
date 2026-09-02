# FitFlow Suite Prisma Starter

This folder converts the PostgreSQL fitness app schema into Prisma models for a TypeScript backend.

## Install

```bash
npm install prisma --save-dev
npm install @prisma/client pg dotenv
```

Prisma's PostgreSQL quickstart uses a Prisma schema, a PostgreSQL datasource, and generated Prisma Client for type-safe database access.[web:147][web:149]

## Environment

Create a `.env` file:

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/fitflow?schema=public"
```

Prisma documents PostgreSQL projects around a `DATABASE_URL` connection string and `prisma migrate dev` for creating tables from the schema.[web:147]

## Generate and migrate

```bash
npx prisma generate
npx prisma migrate dev --name init
```

Prisma Migrate creates the database tables and generates a type-safe client for TypeScript projects.[web:147][web:160]

## Suggested structure

- `prisma/schema.prisma` — data model and enums.
- `prisma/client.ts` — singleton Prisma client for development-safe reuse.
- `src/` — API routes, services, and repository logic.

Prisma is designed for type-safe Node.js and TypeScript backends, and relation fields become especially useful when queried with `include` in Prisma Client.[web:149][web:153][web:157]

## Notes

- Fixed-value fields such as statuses and categories are modeled as enums because Prisma supports enums directly in the schema and they map well to PostgreSQL enum-backed domains.[web:148][web:152][web:155]
- Many-to-many or repeated descriptive values, such as coach specialties and exercise muscles, are expressed as explicit relation tables because Prisma handles relational modeling clearly through explicit linked models.[web:148][web:156]
- Column names are mapped with `@map(...)` and table names with `@@map(...)` so the Prisma layer stays idiomatic in TypeScript while still matching the SQL schema you already have.[web:148]
