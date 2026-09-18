import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// @testing-library/react's own auto-cleanup only registers itself when
// it detects a global `afterEach` (e.g. Vitest's `globals: true`) - this
// config uses explicit imports instead, so without this, each test's
// rendered tree stays mounted into the next one, and any query that
// expects exactly one match starts intermittently seeing duplicates.
afterEach(() => {
  cleanup();
});
