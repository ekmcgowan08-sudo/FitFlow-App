// Repositories translate Prisma errors into the shared AppError hierarchy
// (lib/errors.ts) at the repository boundary, so services and routes never
// need to know about Prisma error codes.
import { ConflictError, NotFoundError } from "./errors";

export function translatePrismaError(err: unknown): Error {
  const prismaErr = err as { code?: string; message?: string };
  if (prismaErr?.code === "P2002") return new ConflictError("A record with this value already exists.");
  if (prismaErr?.code === "P2025") return new NotFoundError();
  if (prismaErr?.code === "P2003") {
    return new ConflictError("This record is still referenced by other data and cannot be deleted.");
  }
  return err instanceof Error ? err : new Error(String(err));
}
