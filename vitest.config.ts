import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/**/*.test.ts',
      'src/**/*.spec.ts',
      'src/**/__tests__/**/*.ts',
      'server/**/*.test.ts',
      'server/**/__tests__/**/*.ts',
    ],
  },
  resolve: {
    alias: {
      '@terra/event-log': resolve(__dirname, 'packages/event-log/src/index.ts'),
    },
  },
});
