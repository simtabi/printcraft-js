// The command line.
//
// `run` returns an exit code rather than calling process.exit, so everything
// except the browser work is testable without spawning anything. The commands
// that do need a browser are covered by a spawned run in test/e2e, where
// Playwright is already installed.

import { test, expect } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const cli = require('../dist/cli.mjs') as never as {
  run(
    argv: string[],
    ctx: { bundle: string; version: string; out: (s?: string) => void }
  ): Promise<number>;
};

/** Runs one invocation and collects everything it printed. */
async function run(...argv: string[]): Promise<{ code: number; out: string }> {
  const lines: string[] = [];
  const code = await cli.run(argv, {
    bundle: join(process.cwd(), 'dist', 'printcraft.umd.js'),
    version: '9.9.9',
    out: (line = '') => lines.push(line)
  });
  return { code, out: lines.join('\n') };
}

/* help and version -------------------------------------------------------- */

test('bare invocation prints usage and succeeds', async () => {
  const { code, out } = await run();
  expect(code).toBe(0);
  expect(out).toContain('printcraft');
  expect(out).toContain('print');
  expect(out).toContain('doctor');
  expect(out).toContain('init');
});

test('--version prints only the version', async () => {
  const { code, out } = await run('--version');
  expect(code).toBe(0);
  expect(out.trim()).toBe('9.9.9');
});

test('per-command help lists every flag, generated from the same schema', async () => {
  const { code, out } = await run('print', '--help');
  expect(code).toBe(0);

  for (const flag of [
    '--pdf',
    '--png',
    '--html',
    '--target',
    '--paginate',
    '--redact',
    '--privacy'
  ]) {
    expect(out, flag + ' is missing from help').toContain(flag);
  }
  expect(out, 'and the short forms').toContain('-t, --target');
  expect(out, 'and defaults where there are any').toContain('1280x900');
  expect(out).toContain('Examples');
});

test('help for each command is reachable both ways', async () => {
  const names = ['print', 'doctor', 'init'];
  const pairs = await Promise.all(
    names.map(async (name) => [await run(name, '--help'), await run('help', name)] as const)
  );

  for (const [viaFlag, viaHelp] of pairs) {
    expect(viaFlag.out).toBe(viaHelp.out);
    expect(viaFlag.code).toBe(0);
  }
});

/* mistakes ---------------------------------------------------------------- */

test('an unknown command suggests the one that was meant', async () => {
  const { code, out } = await run('prnt');
  expect(code).toBe(1);
  expect(out).toContain('no "prnt" command');
  expect(out).toContain('printcraft print');
});

test('an unknown flag suggests the one that was meant, and does not run', async () => {
  const { code, out } = await run('print', 'file.html', '--pdff', 'out.pdf');
  expect(code).toBe(1);
  expect(out).toContain('Unknown option --pdff');
  expect(out).toContain('--pdf');
});

test('several unknown flags are all reported at once', async () => {
  const { out } = await run('print', 'file.html', '--nope', '--alsonope');
  expect(out).toContain('--nope');
  expect(out).toContain('--alsonope');
});

test('printing with nowhere to put it says so before opening a browser', async () => {
  const { code, out } = await run('print', 'file.html');
  expect(code).toBe(1);
  expect(out).toContain('--pdf');
});

test('printing nothing says so', async () => {
  const { code, out } = await run('print', '--pdf', 'out.pdf');
  expect(code).toBe(1);
  expect(out).toContain('Nothing to print');
});

test('a file that does not exist fails with the path, not a stack', async () => {
  const { code, out } = await run('print', 'definitely-not-here.html', '--pdf', 'out.pdf');
  expect(code).toBe(1);
  expect(out).toContain('no such file: definitely-not-here.html');
  expect(out, 'no stack trace in the user-facing output').not.toContain('    at ');
});

/* init -------------------------------------------------------------------- */

test('init writes a config that parses and holds real options', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'printcraft-cli-'));
  const file = join(dir, 'printcraft.config.json');

  const { code, out } = await run('init', '--out', file);
  expect(code).toBe(0);
  expect(out).toContain('wrote');

  const config = JSON.parse(await readFile(file, 'utf8'));
  expect(config).toMatchObject({ setPrintSize: 'A4', hideBrowserHeaderFooter: true });
  expect(Array.isArray(config.excludeSelectorList)).toBe(true);
});

test('init refuses to overwrite without --force', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'printcraft-cli-'));
  const file = join(dir, 'config.json');
  await writeFile(file, '{"mine":true}');

  const refused = await run('init', '--out', file);
  expect(refused.code).toBe(1);
  expect(refused.out).toContain('already exists');
  expect(JSON.parse(await readFile(file, 'utf8')), 'untouched').toEqual({ mine: true });

  const forced = await run('init', '--out', file, '--force');
  expect(forced.code).toBe(0);
  expect(JSON.parse(await readFile(file, 'utf8'))).toHaveProperty('setPrintSize');
});
