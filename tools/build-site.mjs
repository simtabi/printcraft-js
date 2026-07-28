#!/usr/bin/env node
/* Assembles _site/ for GitHub Pages.
 *
 * The published page is the *repo* demo, not the standalone: separate stylesheet,
 * script, favicon and config files, exactly as a real consumer would wire it up.
 * That way the hosted demo exercises the non-inlined path, and the standalone is
 * offered next to it as a download.
 *
 * Run after `npm run build`.
 */

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const site = join(root, '_site');

rmSync(site, { recursive: true, force: true });
mkdirSync(site, { recursive: true });

/* the demo, with its ../dist/ paths flattened to the site root */

const html = readFileSync(join(root, 'demo', 'index.html'), 'utf8')
  .replace(/\.\.\/dist\//g, '')
  .replace(
    '</head>',
    '<link rel="canonical" href="https://simtabi.github.io/printcraft-js/">\n</head>'
  );

if (html.includes('../dist/')) throw new Error('a ../dist/ path survived the rewrite');
writeFileSync(join(site, 'index.html'), html);

/* everything the page asks for */

cpSync(join(dist, 'assets'), join(site, 'assets'), { recursive: true });
cpSync(join(dist, 'printcraft.umd.js'), join(site, 'printcraft.umd.js'));
cpSync(join(dist, 'printcraft.mjs'), join(site, 'printcraft.mjs'));
cpSync(join(dist, 'demo-standalone.html'), join(site, 'standalone.html'));

// Pages runs Jekyll by default, which ignores files and folders beginning with
// an underscore and would happily mangle the rest
writeFileSync(join(site, '.nojekyll'), '');

console.log('built _site/ (index.html + assets/ + bundles + standalone.html)');
