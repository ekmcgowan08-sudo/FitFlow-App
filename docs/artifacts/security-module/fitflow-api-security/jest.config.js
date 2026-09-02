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
        // rbac/rbac.decorator.ts and its tests).
        diagnostics: { ignoreCodes: [151002] },
      },
    ],
  },
  setupFiles: ["<rootDir>/tests/setup/env.ts"],
  testMatch: ["<rootDir>/tests/**/*.test.ts"],
  clearMocks: true,
  verbose: true,
};
