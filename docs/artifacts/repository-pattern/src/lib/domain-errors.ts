/**
 * Domain-level error classes. Repositories translate Prisma errors into these
 * so that services and routes never need to know about Prisma error codes.
 */
export class NotFoundError extends Error {
  readonly status = 404;
  constructor(message = 'Resource not found.') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends Error {
  readonly status = 409;
  constructor(message = 'Resource already exists.') {
    super(message);
    this.name = 'ConflictError';
  }
}

export function translatePrismaError(err: unknown): Error {
  const prismaErr = err as { code?: string; message?: string };
  if (prismaErr?.code === 'P2002') return new ConflictError('A record with this value already exists.');
  if (prismaErr?.code === 'P2025') return new NotFoundError();
  return err instanceof Error ? err : new Error(String(err));
}
