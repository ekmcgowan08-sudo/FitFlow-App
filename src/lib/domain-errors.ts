// Repositories translate Prisma errors into the shared AppError hierarchy
// (lib/errors.ts) at the repository boundary, so services and routes never
// need to know about Prisma error codes.
import { ConflictError, NotFoundError } from "./errors";

export function translatePrismaError(err: unknown): Error {
  const prismaErr = err as { code?: string; message?: string };
  if (prismaErr?.code === "P2002") return new ConflictError("A record with this value already exists.");
  if (prismaErr?.code === "P2025") return new NotFoundError();
  if (prismaErr?.code === "P2003") {
    // P2003 fires for BOTH directions of a foreign-key violation: deleting
    // a row other records still point to, AND inserting/updating a row
    // that points at a foreign key which doesn't exist (e.g. a bogus
    // exerciseId). The old message only made sense for the first case —
    // reporting a nonexistent-reference failure as "cannot be deleted"
    // would be actively misleading to the caller.
    return new ConflictError(
      "This operation references a record that does not exist, or is blocked by other data that still depends on it."
    );
  }
  return err instanceof Error ? err : new Error(String(err));
}
