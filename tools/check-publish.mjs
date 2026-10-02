// Fails when npm would rewrite package.json at publish time.
//
// npm normalises the manifest as it publishes and only *warns* about what it changed:
// on 2026-10-02 it printed `"bin[printcraft]" script name bin/printcraft.mjs was invalid
// and removed` and would have shipped 3.0.0 without its CLI. A published version can never
// be replaced, so the only safe place to catch that is before the tag. This runs the same
// normalisation as a real publish (a dry run, scripts off, nothing uploaded) and turns every
// correction npm reports into a failure, so the manifest is fixed in source instead.

import { spawnSync } from 'node:child_process';

const run = spawnSync('npm', ['publish', '--dry-run', '--ignore-scripts', '--access', 'public'], {
  encoding: 'utf8'
});
const output = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;

if (run.status !== 0) {
  process.stderr.write(output);
  console.error('check-publish: `npm publish --dry-run` failed.');
  process.exit(1);
}

// npm prints one header line, then one line per correction, all prefixed `npm warn publish`.
const corrections = output
  .split('\n')
  .filter(
    (line) => line.startsWith('npm warn publish') && !/errors corrected:|npm pkg fix/.test(line)
  )
  .map((line) => line.replace(/^npm warn publish\s*/, ''));

if (corrections.length > 0) {
  console.error('check-publish: npm would change package.json while publishing:');
  for (const line of corrections) console.error(`  - ${line}`);
  console.error('Fix package.json so the published manifest matches the source.');
  process.exit(1);
}

console.log('check-publish: npm publishes package.json unchanged.');
