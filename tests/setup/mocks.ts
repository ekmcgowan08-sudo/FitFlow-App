// tests/setup/mocks.ts
// Runs once jest globals (beforeEach, etc.) are available — unlike
// tests/setup/env.ts, which runs before that and can only set process.env.
//
// jest.config.js sets `resetMocks: true` so a test that short-circuits
// before consuming every queued `mockResolvedValueOnce` (e.g. a Zod
// validation failure returning before the repository layer runs) can
// never leak that stale queued value into the next test. The tradeoff is
// that `resetMocks` also wipes `$transaction`'s default implementation
// before every test, so it's re-applied here on every test's behalf.
import { installPrismaMockDefaults } from "../../__mocks__/@prisma/client";

beforeEach(() => {
  installPrismaMockDefaults();
});
