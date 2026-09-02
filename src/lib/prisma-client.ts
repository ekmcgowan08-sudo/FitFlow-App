/**
 * Singleton PrismaClient, safe to import from any file. Repositories
 * accept `PrismaClientOrTx` in their constructor rather than importing
 * this singleton directly, so they also work inside
 * `prisma.$transaction(async (tx) => ...)` blocks.
 */
import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __fitflowPrisma: PrismaClient | undefined;
}

export const prisma = global.__fitflowPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.__fitflowPrisma = prisma;
}
