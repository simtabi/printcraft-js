// Checks that our mirror of daisyUI's design tokens has not gone stale.
//
// The library cannot ship daisyUI. Its class names are global and unprefixed, so
// injecting `.btn` and `.modal` into somebody else's page would restyle their
// buttons. What it does instead is mirror daisyUI's *token* names under a
// `--prjs-` prefix, which gives the same vocabulary with none of the collisions.
//
// A mirror is only useful while it matches. daisyUI renaming `--rounded-box` to
// `--radius-box`, which is exactly what happened between 4 and 5, would leave us
// quietly describing a system nobody else uses any more. So: read the tokens
// daisyUI actually declares, read the ones we emit, and report the difference.
//
//   node tools/vendor-audit.mjs            report, exit 0 unless drift
//   node tools/vendor-audit.mjs --json     machine-readable, for CI
//   node tools/vendor-audit.mjs --write    update vendor.lock.json to what is installed

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCK = join(root, 'vendor.lock.json');

const argv = new Set(process.argv.slice(2));
const asJson = argv.has('--json');
const write = argv.has('--write');

/* what daisyUI declares --------------------------------------------------- */

/** The token names any daisyUI theme sets, read from the installed package. */
function daisyTokens() {
  const pkgPath = require.resolve('daisyui/package.json', { paths: [root] });
  const version = JSON.parse(readFileSync(pkgPath, 'utf8')).version;
  const dir = dirname(pkgPath);

  // themes live beside the plugin; the built-in light theme declares the full
  // set, which is what makes it the reference
  const candidates = [
    join(dir, 'theme/index.css'),
    join(dir, 'themes.css'),
    join(dir, 'theme.css'),
    join(dir, 'daisyui.css')
  ];

  const found = new Set();
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    for (const [, name] of readFileSync(file, 'utf8').matchAll(
      /(--(?:color|radius|size)-[a-z0-9-]+|--border|--depth|--noise)\s*:/g
    )) {
      found.add(name);
    }
    if (found.size) break;
  }
  const tokens = [...found];
  // oxlint-disable-next-line no-array-sort
  tokens.sort();
  return { version, tokens };
}

/* what we emit ------------------------------------------------------------ */

/** The `--prjs-` tokens our stylesheet declares, read from the source. */
function ourTokens() {
  const src = readFileSync(join(root, 'src/ui/kit/theme.ts'), 'utf8');
  const found = new Set();

  // the literal declarations
  for (const [, name] of src.matchAll(
    /--prjs-((?:color|radius|size)-[a-z0-9-]+|border|depth|noise)\s*:/g
  )) {
    found.add('--' + name);
  }
  // and the ones built from the TONES list, which never appear literally
  const tones = /export const TONES = \[([\s\S]*?)\] as const/.exec(src);
  if (tones) {
    for (const [, name] of tones[1].matchAll(/'([a-z]+)'/g)) {
      found.add('--color-' + name);
      found.add('--color-' + name + '-content');
    }
  }
  const out = [...found];
  // oxlint-disable-next-line no-array-sort
  out.sort();
  return out;
}

/* the comparison ---------------------------------------------------------- */

const daisy = daisyTokens();
const ours = new Set(ourTokens());
const theirs = new Set(daisy.tokens);

// only the tokens a theme is expected to carry. daisyUI declares plenty of
// internal ones we have no business mirroring.
const relevant = [...theirs].filter(
  (t) =>
    /^--color-(base-\d00|base-content|primary|secondary|accent|neutral|info|success|warning|error)(-content)?$/.test(
      t
    ) ||
    /^--(radius|size)-(selector|field|box)$/.test(t) ||
    /^--(border|depth|noise)$/.test(t)
);

const missing = relevant.filter((t) => !ours.has(t));
const extra = [...ours].filter((t) => !theirs.has(t) && !/^--(depth|noise)$/.test(t));

const lock = existsSync(LOCK) ? JSON.parse(readFileSync(LOCK, 'utf8')) : null;
const moved = lock && lock.daisyui?.version !== daisy.version;

const report = {
  vendor: 'daisyui',
  installed: daisy.version,
  auditedAgainst: lock?.daisyui?.version ?? null,
  versionChanged: !!moved,
  tokensTheyDeclare: relevant.length,
  tokensWeMirror: ours.size,
  missing,
  extra,
  drift: missing.length > 0
};

if (write) {
  writeFileSync(
    LOCK,
    JSON.stringify({ daisyui: { version: daisy.version, tokens: relevant } }, null, 2) + '\n'
  );
  console.log('vendor.lock.json now records daisyui ' + daisy.version);
  process.exit(0);
}

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const line = (a, b) => console.log('  ' + a.padEnd(22) + b);
  console.log('\ndaisyUI token audit\n');
  line('installed', daisy.version);
  line('audited against', report.auditedAgainst ?? '(never)');
  line('they declare', relevant.length + ' theme tokens');
  line('we mirror', ours.size + ' under --prjs-');

  if (missing.length) {
    console.log('\n  MISSING — they declare these and we do not:');
    for (const t of missing) console.log('    ' + t);
    console.log('\n  Add them to Theme and tokens() in src/ui/kit/theme.ts.');
  }
  if (extra.length) {
    console.log('\n  ours only (fine — these are ours, not theirs):');
    for (const t of extra) console.log('    ' + t);
  }
  if (moved) {
    console.log(
      '\n  daisyUI moved from ' +
        report.auditedAgainst +
        ' to ' +
        daisy.version +
        '. Re-run with --write once the tokens above are dealt with.'
    );
  }
  if (!missing.length && !moved) console.log('\n  in step.\n');
}

// drift is a failure worth stopping CI for; a version bump with no token change
// is not
process.exit(report.drift ? 1 : 0);
