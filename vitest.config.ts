import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    exclude: ['node_modules/**', 'tests/fixtures/**'],
    testTimeout: 20000,
  },
});
