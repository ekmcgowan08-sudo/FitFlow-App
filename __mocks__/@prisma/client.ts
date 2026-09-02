// __mocks__/@prisma/client.ts
// Manual Jest mock for `@prisma/client`. Jest automatically substitutes
// this file for the real package in every test (it lives in a __mocks__
// directory adjacent to node_modules — no explicit jest.mock() call
// needed anywhere application code imports `@prisma/client`).
//
// Every `new PrismaClient()` / singleton `prisma` import anywhere in the
// codebase (auth.routes, auth.middleware, user.routes, rbac.middleware,
// token.service) returns this SAME `prismaMock` object, so a test can
// configure a return value once and have every module observe it
// consistently — including calls made inside
// `prisma.$transaction(async (tx) => { ... })`.
//
// Test files import `prismaMock` directly from this file (relative path)
// rather than from "@prisma/client", so `tsc` — which has no notion of
// Jest's module-mocking indirection — can resolve the export normally.

export interface PrismaMockClient {
  user: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    delete: jest.Mock;
  };
  role: {
    upsert: jest.Mock;
  };
  refreshToken: {
    create: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  workoutSession: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    updateMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    count: jest.Mock;
  };
  workoutSet: {
    create: jest.Mock;
  };
  exercise: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    count: jest.Mock;
  };
  streak: {
    upsert: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  userProfile: {
    upsert: jest.Mock;
  };
  goal: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    count: jest.Mock;
  };
  nutritionLog: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    count: jest.Mock;
  };
  gym: {
    findMany: jest.Mock;
    create: jest.Mock;
    count: jest.Mock;
  };
  gymCheckIn: {
    findMany: jest.Mock;
    create: jest.Mock;
    count: jest.Mock;
  };
  // Renamed from the security module's `coachClient` to match the
  // canonical schema's `CoachAssignment` model — see
  // docs/architecture/canonical-schema-decisions.md.
  coachAssignment: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    upsert: jest.Mock;
    update: jest.Mock;
    create: jest.Mock;
  };
  $transaction: jest.Mock;
}

export const prismaMock: PrismaMockClient = {
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
  role: {
    upsert: jest.fn(),
  },
  refreshToken: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  workoutSession: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  workoutSet: {
    create: jest.fn(),
  },
  exercise: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    count: jest.fn(),
  },
  streak: {
    upsert: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  userProfile: {
    upsert: jest.fn(),
  },
  goal: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  nutritionLog: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  gym: {
    findMany: jest.fn(),
    create: jest.fn(),
    count: jest.fn(),
  },
  gymCheckIn: {
    findMany: jest.fn(),
    create: jest.fn(),
    count: jest.fn(),
  },
  coachAssignment: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  },
  $transaction: jest.fn(),
};

/**
 * Re-applies the `$transaction` and `PrismaClient` constructor
 * implementations. Called once at module load (below) AND from a global
 * `beforeEach` in tests/setup/mocks.ts, because jest.config.js sets
 * `resetMocks: true` — which wipes every mock's implementation
 * (including this one) before each test, not just its call history. That
 * reset is what's needed for `mockResolvedValueOnce` queues from a test
 * that exits early (e.g. a validation failure short-circuits before its
 * queued repository-layer mock is ever consumed) to never leak into the
 * next test, but it means this default implementation has to be
 * re-established every time too.
 */
export function installPrismaMockDefaults(): void {
  prismaMock.$transaction.mockImplementation(async (arg: unknown) => {
    if (typeof arg === "function") {
      return (arg as (tx: PrismaMockClient) => unknown)(prismaMock);
    }
    return Promise.all(arg as Promise<unknown>[]);
  });
}

installPrismaMockDefaults();

export const PrismaClient: any = jest.fn().mockImplementation(() => prismaMock);

// Mirrors the `RoleCode` enum generated by Prisma from prisma/schema.prisma.
export const RoleCode = {
  ADMIN: "ADMIN",
  COACH: "COACH",
  SUBSCRIBER: "SUBSCRIBER",
  USER: "USER",
  GYM_PARTNER: "GYM_PARTNER",
  SUPPORT_OPS: "SUPPORT_OPS",
} as const;

// Mirrors the `ExerciseCategory` enum.
export const ExerciseCategory = {
  strength: "strength",
  cardio: "cardio",
  mobility: "mobility",
  recovery: "recovery",
  sport: "sport",
} as const;
