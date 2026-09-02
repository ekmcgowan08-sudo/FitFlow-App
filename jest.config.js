/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        // Silences ts-jest's TS151002 warning about hybrid module
        // resolution (node16) needing isolatedModules — we can't turn on
        // isolatedModules project-wide because it conflicts with
        // emitDecoratorMetadata on decorated method signatures (see
        // src/rbac/rbac.decorator.ts and its tests).
        diagnostics: { ignoreCodes: [151002] },
      },
    ],
  },
  setupFiles: ["<rootDir>/tests/setup/env.ts"],
  setupFilesAfterEnv: ["<rootDir>/tests/setup/mocks.ts"],
  testMatch: ["<rootDir>/tests/**/*.test.ts"],
  // docs/artifacts/ preserves the original, pre-consolidation projects
  // verbatim, including their own __mocks__/@prisma/client.ts and test
  // files. Jest's haste map scans the whole project for manual mocks
  // regardless of testMatch, so without this it finds two
  // `__mocks__/@prisma/client.ts` files and picks one nondeterministically
  // — silently breaking every test that depends on the mock.
  modulePathIgnorePatterns: ["<rootDir>/docs/"],
  // `resetMocks` (not just `clearMocks`) so a queued `mockResolvedValueOnce`
  // that a short-circuited test never consumed can't leak into the next
  // test — see tests/setup/mocks.ts for what that requires re-establishing.
  resetMocks: true,
  verbose: true,
};
