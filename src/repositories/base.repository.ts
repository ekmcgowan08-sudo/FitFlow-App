/**
 * Generic base repository for Prisma-backed aggregates.
 *
 * Individual repositories (MemberRepository, WorkoutLogRepository, ...) extend
 * this class and add domain-named finder methods. See
 * docs/artifacts/repository-pattern/docs/prisma-repository-pattern.md for
 * the full rationale.
 */
import type { PrismaClient, Prisma } from '@prisma/client';

/** A PrismaClient or an active $transaction callback client. */
export type PrismaClientOrTx = PrismaClient | Prisma.TransactionClient;

/**
 * Minimal shape shared by every Prisma model delegate this base class
 * relies on. `include`/`select` are typed `any` (not `unknown`) on
 * purpose: a real generated Prisma delegate's `include`/`select` types
 * are specific per-model unions, and `unknown` isn't assignable into
 * them, which breaks the structural match between this generic interface
 * and `client.<model>` for every concrete model.
 */
export interface PrismaDelegate<TWhere, TCreateInput, TUpdateInput, TEntity> {
  findUnique(args: { where: TWhere; include?: any; select?: any }): Promise<TEntity | null>;
  findMany(args?: Record<string, unknown>): Promise<TEntity[]>;
  create(args: { data: TCreateInput; include?: any; select?: any }): Promise<TEntity>;
  update(args: { where: TWhere; data: TUpdateInput; include?: any; select?: any }): Promise<TEntity>;
  delete(args: { where: TWhere }): Promise<TEntity>;
  count(args?: Record<string, unknown>): Promise<number>;
}

export interface PageRequest {
  take?: number;
  cursor?: string;
}

export interface Page<T> {
  items: T[];
  nextCursor?: string;
}

export abstract class BaseRepository<
  TWhere,
  TCreateInput,
  TUpdateInput,
  TEntity extends { id: string },
> {
  protected constructor(
    protected readonly delegate: PrismaDelegate<TWhere, TCreateInput, TUpdateInput, TEntity>,
  ) {}

  findById(where: TWhere): Promise<TEntity | null> {
    return this.delegate.findUnique({ where });
  }

  findMany(args?: Record<string, unknown>): Promise<TEntity[]> {
    return this.delegate.findMany(args);
  }

  async findPage(args: Record<string, unknown>, page: PageRequest): Promise<Page<TEntity>> {
    const take = page.take ?? 20;
    const items = await this.delegate.findMany({
      ...args,
      take: take + 1,
      ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
    });

    const hasMore = items.length > take;
    const pageItems = hasMore ? items.slice(0, take) : items;
    return {
      items: pageItems,
      nextCursor: hasMore ? pageItems[pageItems.length - 1]?.id : undefined,
    };
  }

  create(data: TCreateInput): Promise<TEntity> {
    return this.delegate.create({ data });
  }

  update(where: TWhere, data: TUpdateInput): Promise<TEntity> {
    return this.delegate.update({ where, data });
  }

  delete(where: TWhere): Promise<TEntity> {
    return this.delegate.delete({ where });
  }

  count(args?: Record<string, unknown>): Promise<number> {
    return this.delegate.count(args);
  }
}
