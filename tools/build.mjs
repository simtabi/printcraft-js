#!/usr/bin/env node
/* Generates dist/demo-standalone.html: the whole demo as one file that runs
 * from file:// with an empty network panel.
 *
 * Every external reference in demo/index.html sits between a marker pair, and
 * each one is replaced by its inlined equivalent here — stylesheet, library,
 * behaviour, favicon, and the page defaults, which become an inline JSON block
 * because a file:// page cannot fetch a sibling file.
 *
 * Run after `vite build`, `npm run build:types`, and `npm run build:assets`.
 */

import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(root, 'dist');
const assets = join(distDir, 'assets');

const outPath = join(distDir, 'demo-standalone.html');
const umdPath = join(distDir, 'printcraft.umd.js');
const cssPath = join(assets, 'css', 'demo.css');
const jsPath = join(assets, 'js', 'demo.js');
const iconPath = join(assets, 'favicon', 'favicon.svg');
const configPath = join(assets, 'data', 'printcraft.config.json');

function read(path, hint) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    console.error(`${path} is missing; ${hint}`);
    process.exit(1);
  }
}

/**
 * An inlined asset containing a literal closing script tag would truncate the
 * page at that point. This has bitten the project once already, through a code
 * comment, so every asset is checked rather than trusted.
 */
function assertInlineable(source, what) {
  // split deliberately: this file must not contain the sequence it checks for
  // oxlint-disable-next-line no-useless-concat
  if (source.includes('</scr' + 'ipt>')) {
    throw new Error(`${what} contains a closing script tag and cannot be inlined`);
  }
}

function replaceMarked(html, marker, replacement) {
  const re = new RegExp(`<!-- ${marker} -->[\\s\\S]*?<!-- /${marker} -->`);
  if (!re.test(html)) throw new Error(`demo/index.html is missing the ${marker} markers`);
  return html.replace(re, replacement);
}

/* read -------------------------------------------------------------------- */

const lib = read(umdPath, 'run `vite build` first').replace(/\/\/# sourceMappingURL=.*$/m, '');
const css = read(cssPath, 'run `npm run build:assets` first');
const js = read(jsPath, 'run `npm run build:assets` first');
const icon = read(iconPath, 'the favicon source is required');
const config = read(configPath, 'the demo config is required');

assertInlineable(lib, 'the umd bundle');
assertInlineable(css, 'the compiled stylesheet');
assertInlineable(js, 'the demo script');
assertInlineable(config, 'the demo config');

JSON.parse(config); // fail loudly rather than ship a page with a broken config

/* assemble ---------------------------------------------------------------- */

const iconHref = 'data:image/svg+xml;utf8,' + encodeURIComponent(icon.trim());

let html = read(join(root, 'demo', 'index.html'), 'the demo source is required');
html = replaceMarked(
  html,
  'PRINTCRAFT:ICON',
  `<link rel="icon" href="${iconHref}" type="image/svg+xml">`
);
html = replaceMarked(html, 'PRINTCRAFT:CSS', '<style>\n' + css + '\n</style>');
html = replaceMarked(
  html,
  'PRINTCRAFT:CONFIG',
  '<script type="application/json" data-printcraft-config>\n' + config.trim() + '\n</script>'
);
html = replaceMarked(html, 'PRINTCRAFT:LIB', '<script>\n' + lib + '\n</script>');
html = replaceMarked(html, 'PRINTCRAFT:DEMO', '<script>\n' + js + '\n</script>');

/* verify ------------------------------------------------------------------ */

const externalRef = html.match(/<(?:script|link)[^>]+(?:src|href)=["']?(?!data:)[^"'>\s]+[^>]*>/i);
if (externalRef) {
  throw new Error(`the standalone demo still references a file: ${externalRef[0]}`);
}
if (html.includes('data-config=')) {
  throw new Error('the standalone demo still points at a fetched config file');
}

writeFileSync(outPath, html);

const kb = (f) => Math.round(statSync(f).size / 102.4) / 10;
console.log(
  `built dist/demo-standalone.html (${kb(outPath)}KB: ${kb(cssPath)}KB css + ` +
    `${kb(jsPath)}KB demo + ${kb(umdPath)}KB lib, no external requests)`
);
