// The cli build.
//
// Separate from the library build because the cli runs in node and imports
// playwright on demand. Putting node built-ins in the browser entry would leave
// a bundler trying to resolve `node:fs` for a page that never calls it.

import { defineConfig } from 'vite';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  build: {
    target: 'node20',
    outDir: 'dist',
    emptyOutDir: false,
    ssr: 'src/cli/index.ts',
    minify: false,
    rollupOptions: {
      external: [/^node:/, 'playwright', 'playwright-core'],
      output: { entryFileNames: 'cli.mjs', format: 'es' }
    }
  },
  define: {
    __PRINTCRAFT_VERSION__: JSON.stringify(pkg.version)
  }
});
