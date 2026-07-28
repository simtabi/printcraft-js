import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    // the suites build their own isolated JSDOM per test, so the runner itself
    // stays in node and never installs a single ambient document
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text', 'html', 'lcov']
    }
  }
});
