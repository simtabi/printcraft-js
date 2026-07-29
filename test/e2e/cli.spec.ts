// The cli, spawned for real.
//
// These run under playwright rather than vitest because that is where a browser
// is installed. Everything not needing one is covered in test/cli.test.ts.

import { expect, test } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const exec = promisify(execFile);
const BIN = join(process.cwd(), 'bin', 'printcraft.mjs');

const FIXTURE = `<!doctype html>
<html><head><meta charset="utf-8"><title>Personnel file</title>
<style>body{font:16px/1.6 system-ui;margin:0;padding:40px}.secret{background:#fee}</style></head>
<body>
  <h1>Quarterly personnel file</h1>
  <p class="secret">Officer: Jane Marie Doe, badge 4417</p>
  <p>Contact jane.doe@example.com or call +1 (415) 555-0142.</p>
  <p>SSN 123-45-6789. Card 4111 1111 1111 1111.</p>
</body></html>`;

async function fixture(): Promise<{ dir: string; file: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'printcraft-e2e-'));
  const file = join(dir, 'fixture.html');
  await writeFile(file, FIXTURE);
  return { dir, file };
}

/** Runs the binary, returning its output and exit code rather than throwing. */
async function cli(...args: string[]): Promise<{ code: number; stdout: string }> {
  try {
    const { stdout } = await exec('node', [BIN, ...args], {
      env: { ...process.env, NO_COLOR: '1' }
    });
    return { code: 0, stdout };
  } catch (e) {
    const err = e as { code?: number; stdout?: string };
    return { code: err.code ?? 1, stdout: err.stdout ?? '' };
  }
}

test('print writes a pdf, a png and the assembled html', async () => {
  const { dir, file } = await fixture();
  const pdf = join(dir, 'out.pdf');
  const png = join(dir, 'out.png');
  const html = join(dir, 'out.html');

  const { code, stdout } = await cli('print', file, '--pdf', pdf, '--png', png, '--html', html);

  expect(code, stdout).toBe(0);
  expect(stdout).toContain('load');
  expect(stdout).toContain('render');
  expect(stdout).toContain('write');

  // real files, not empty ones
  expect((await stat(pdf)).size).toBeGreaterThan(5000);
  expect((await stat(png)).size).toBeGreaterThan(5000);
  expect((await readFile(pdf)).subarray(0, 5).toString(), 'a pdf header').toBe('%PDF-');
  expect(await readFile(html, 'utf8')).toContain('Quarterly personnel file');
});

test('redaction reaches the written output', async () => {
  const { dir, file } = await fixture();
  const html = join(dir, 'redacted.html');

  const { code } = await cli('print', file, '--html', html, '--redact', '.secret', '--privacy');
  expect(code).toBe(0);

  const written = await readFile(html, 'utf8');
  expect(written, 'the named element').not.toContain('Jane Marie Doe');
  expect(written, 'and everything the privacy scan found').not.toContain('jane.doe@example.com');
  expect(written).not.toContain('123-45-6789');
  expect(written).toContain('█');
});

test('pagination and page numbers reach the pdf', async () => {
  const { dir, file } = await fixture();
  const html = join(dir, 'paged.html');

  const { code } = await cli(
    'print',
    file,
    '--html',
    html,
    '--paginate',
    '--page-numbers',
    '--watermark',
    'CONFIDENTIAL'
  );
  expect(code).toBe(0);

  const written = await readFile(html, 'utf8');
  expect(written).toContain('pc-page-sheet');
  expect(written).toContain('Page 1 of');
  expect(written).toContain('CONFIDENTIAL');
});

test('doctor reports a planted leak and exits non-zero', async () => {
  const { file } = await fixture();
  const { code, stdout } = await cli('doctor', file);

  expect(code, 'a leak is a failure, so ci can gate on it').toBe(2);
  expect(stdout).toContain('What would leak');
  expect(stdout).toContain('email address');
  expect(stdout).toContain('social security number');
  expect(stdout).toContain('card number');
});

test('doctor is clean once the leaks are handled', async () => {
  const { file } = await fixture();
  const { code, stdout } = await cli('doctor', file, '--privacy', '--redact', '.secret');

  expect(code, stdout).toBe(0);
  expect(stdout).toContain('nothing matching the privacy patterns');
  expect(stdout).toContain('redactions applied');
});

test('a config file supplies the options', async () => {
  const { dir, file } = await fixture();
  const config = join(dir, 'printcraft.config.json');
  const html = join(dir, 'configured.html');

  await writeFile(
    config,
    JSON.stringify({ redactSelectorList: ['.secret'], privacy: true, paginate: true })
  );

  const { code } = await cli('print', file, '--html', html, '--config', config);
  expect(code).toBe(0);

  const written = await readFile(html, 'utf8');
  expect(written).not.toContain('Jane Marie Doe');
  expect(written).toContain('pc-page-sheet');
});
