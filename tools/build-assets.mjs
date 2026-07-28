#!/usr/bin/env node
/* Builds the demo's assets into dist/assets/.
 *
 * Two compilers, one output. Sass owns the component layer — tokens, mixins,
 * nesting — and Tailwind owns the utilities and the design tokens the markup
 * reaches for. Running them separately and concatenating keeps each tool doing
 * what it is good at; trying to feed `@import "tailwindcss"` through Sass does
 * not work, because Sass resolves bare imports as Sass files.
 *
 * Sass output goes last, so the unlayered component rules win over Tailwind's
 * layered utilities on equal specificity.
 */

import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'demo', 'assets');
const out = join(root, 'dist', 'assets');

const bin = (name) => join(root, 'node_modules', '.bin', name);
const kb = (bytes) => (bytes / 1024).toFixed(1) + 'KB';

function run(name, args) {
  execFileSync(bin(name), args, { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] });
}

for (const dir of ['css', 'js', 'favicon', 'data', 'img']) {
  mkdirSync(join(out, dir), { recursive: true });
}

/* css: tailwind + sass ---------------------------------------------------- */

const twOut = join(out, 'css', '.tailwind.css');
const sassOut = join(out, 'css', '.components.css');

run('tailwindcss', ['-i', join(src, 'css', 'tailwind.css'), '-o', twOut, '--minify']);
run('sass', [
  join(src, 'scss', 'main.scss'),
  sassOut,
  '--style=compressed',
  '--no-source-map',
  '--load-path=' + join(src, 'scss')
]);

const css =
  '/* printcraft demo — tailwind utilities, then sass components. generated. */\n' +
  readFileSync(twOut, 'utf8').trim() +
  '\n' +
  readFileSync(sassOut, 'utf8').trim() +
  '\n';

const cssPath = join(out, 'css', 'demo.css');
writeFileSync(cssPath, css);
rmSync(twOut);
rmSync(sassOut);

if (!css.includes('--color-process-c')) {
  throw new Error('the compiled stylesheet is missing its theme tokens — did @source resolve?');
}
if (!css.includes('.pc-ticket')) {
  throw new Error('the compiled stylesheet is missing the sass component layer');
}

/* js ---------------------------------------------------------------------- */

/**
 * The watermark lives in assets/img as real, editable SVG and is inlined here as
 * a data URI. The standalone demo has to run with no network at all, and an
 * off-origin — or even same-origin — fetch would break the guarantee the build
 * asserts about it.
 */
const watermark =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(readFileSync(join(src, 'img', 'watermark.svg'), 'utf8').trim());

/**
 * The demo config, inlined so a file:// page behaves the same as a served one.
 * It cannot fetch its own siblings, and silently running without the page
 * defaults is worse than not offering them at all.
 */
const demoConfig = readFileSync(join(src, 'data', 'printcraft.config.json'), 'utf8');
JSON.parse(demoConfig); // fail here rather than in the browser

const js = readFileSync(join(src, 'js', 'demo.js'), 'utf8')
  .replace(/'__WATERMARK_DATA_URI__'/g, JSON.stringify(watermark))
  .replace(/'__DEMO_CONFIG__'/g, demoConfig.trim());

for (const placeholder of ['__WATERMARK_DATA_URI__', '__DEMO_CONFIG__']) {
  if (js.includes(placeholder)) {
    throw new Error(`the ${placeholder} placeholder was not substituted`);
  }
}

const jsPath = join(out, 'js', 'demo.js');
writeFileSync(jsPath, js);

/* static assets ----------------------------------------------------------- */

cpSync(join(src, 'favicon'), join(out, 'favicon'), { recursive: true });
cpSync(join(src, 'img'), join(out, 'img'), { recursive: true });
cpSync(join(src, 'data'), join(out, 'data'), { recursive: true });

console.log(
  `built dist/assets (css ${kb(statSync(cssPath).size)}, js ${kb(statSync(jsPath).size)}, favicon + img + data copied)`
);
