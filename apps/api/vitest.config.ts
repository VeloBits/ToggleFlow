import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integration tests share the dev Postgres on :5434 and truncate between
    // suites — files must not run concurrently.
    fileParallelism: false,
  },
});
