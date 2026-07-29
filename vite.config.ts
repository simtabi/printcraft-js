import { defineConfig } from 'vite';
import pkg from './package.json' with { type: 'json' };

// Three esm entries and one umd bundle.
//
// The esm build splits because `static ui = {...}` is a live reference no
// bundler can drop: without the split, somebody who only calls print() ships a
// modal kit and a rasteriser they never touch. The umd stays whole, because a
// page with no bundler cannot split anything and three script tags would cost
// requests to buy nothing.
export default defineConfig({
  build: {
    target: 'es2018',
    outDir: 'dist',
    // `npm run prebuild` clears dist. emptyOutDir here would instead wipe the
    // compiled demo css and the standalone demo on every `vite build --watch` pass.
    emptyOutDir: false,
    sourcemap: true,
    minify: true,
    rollupOptions: {
      // without this rollup treats a subpath entry as side-effect-only and
      // drops its re-exports, so `import Printcraft from '.../ui'` resolves to
      // a module with no default
      preserveEntrySignatures: 'strict',
      input: {
        printcraft: 'src/index.ts',
        'printcraft.ui': 'src/entry-ui.ts',
        'printcraft.share': 'src/entry-share.ts'
      },
      output: [
        {
          format: 'es',
          entryFileNames: '[name].mjs',
          // rollup's own split is already the right one: the core in one chunk,
          // the ui in another. This only names them by what they hold, rather
          // than by whichever module rollup happened to name them after, so the
          // size budget can point at "core" and mean it.
          chunkFileNames: (chunk) =>
            'printcraft-' +
            (chunk.moduleIds.some((id) => /[\\/]src[\\/]ui[\\/]kit[\\/]/.test(id))
              ? 'ui'
              : 'core') +
            '.mjs'
        }
      ]
    }
  },
  define: {
    __PRINTCRAFT_VERSION__: JSON.stringify(pkg.version)
  }
});
