// The script-tag build: everything, one file, one global.
//
// Separate from the esm build because a umd bundle cannot have several entries,
// and because a page loading this has no bundler to split for.

import { defineConfig } from 'vite';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  build: {
    target: 'es2018',
    outDir: 'dist',
    emptyOutDir: false,
    sourcemap: true,
    minify: true,
    lib: {
      entry: 'src/entry-full.ts',
      name: 'Printcraft',
      formats: ['umd'],
      fileName: () => 'printcraft.umd.js'
    }
  },
  define: {
    __PRINTCRAFT_VERSION__: JSON.stringify(pkg.version)
  }
});
