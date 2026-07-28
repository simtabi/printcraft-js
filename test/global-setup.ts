import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * the suites exercise the shipped umd bundle, not the source: that is the artifact
 * consumers actually load, and it is what caught a `</script>` inside a comment
 * once before. `npm test` runs `pretest` first; this is the guard for anyone
 * running vitest directly.
 */
export default function setup(): void {
  const bundle = fileURLToPath(new URL('../dist/printcraft.umd.js', import.meta.url));
  if (!existsSync(bundle)) {
    throw new Error('dist/printcraft.umd.js is missing — run `npm run build` before vitest');
  }
}
