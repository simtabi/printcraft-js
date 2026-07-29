#!/usr/bin/env node
// The binary. Everything real is in dist/cli.mjs; this resolves paths and sets
// the exit code, so the command logic stays testable without spawning a process.

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const { run } = await import(join(root, 'dist', 'cli.mjs'));

const code = await run(process.argv.slice(2), {
  bundle: join(root, 'dist', 'printcraft.umd.js'),
  version: pkg.version,
  out: (line = '') => process.stdout.write(line + '\n')
});

process.exitCode = code;
