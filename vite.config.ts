import { defineConfig } from 'vite';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  build: {
    target: 'es2018',
    outDir: 'dist',
    // `npm run prebuild` clears dist. emptyOutDir here would instead wipe the
    // compiled demo css and the standalone demo on every `vite build --watch` pass.
    emptyOutDir: false,
    sourcemap: true,
    minify: true,
    lib: {
      entry: 'src/index.ts',
      name: 'Printcraft',
      formats: ['es', 'umd'],
      fileName: (format) => (format === 'es' ? 'printcraft.mjs' : 'printcraft.umd.js')
    }
  },
  define: {
    // single source of version truth: package.json
    __PRINTCRAFT_VERSION__: JSON.stringify(pkg.version)
  }
});
