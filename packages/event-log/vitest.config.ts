import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/event-log/tests/**/*.test.ts'],
  },
});
