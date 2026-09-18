import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Separate from vite.config.ts (the dev-server/build config) rather than
// merged into it - unit tests never need the dev-server settings there,
// and keeping this file build-tool-agnostic means it isn't touched by
// changes to how the app itself is served or bundled.
//
// Playwright's own e2e/ suite (test:e2e) covers real browser behavior
// end to end; this config is for fast, isolated unit tests of pure
// logic and component behavior that don't need a real browser or
// network - see src/auth/AuthContext.test.tsx for the motivating case.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['e2e/**', 'node_modules/**'],
  },
});
