// daisyUI's component CSS, prefixed so it cannot touch the host page.
//
// The library renders into somebody else's document. daisyUI's class names are
// global and unprefixed — `.btn`, `.modal`, `.input`, `.card` — so shipping its
// stylesheet as-is would restyle that page's own buttons, and collide outright
// with a host already running daisyUI at another version.
//
// So the stylesheet is taken apart and put back together with every class
// renamed: `.btn` becomes `.prjs-btn`, `.modal-box` becomes `.prjs-modal-box`.
// The kit's markup already uses those names — the anatomy was matched to
// daisyUI's in the last release — so the real component css drops straight onto
// it, and nothing unprefixed survives to reach the host.
//
// The variables it reads (`--color-base-100`, `--size-field`, `--border`,
// `--depth`) are left alone and declared on `.prjs` instead. Custom properties
// inherit downward only, so they reach every daisyUI rule inside our surfaces
// and nothing outside them.
//
//   node tools/vendor-daisyui.mjs           write src/ui/kit/daisyui-css.ts
//   node tools/vendor-daisyui.mjs --check   fail if it is out of date
//   node tools/vendor-daisyui.mjs --report  what each component costs

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { brotliCompressSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'src/ui/kit/daisyui-css.ts');
const PKG = join(root, 'node_modules/daisyui');

const check = process.argv.includes('--check');
const report = process.argv.includes('--report');

/**
 * The components whose markup the kit actually draws.
 *
 * Not the whole library — daisyUI ships sixty and a carousel is not a thing a
 * print dialog needs — and not even everything with a matching name. A component
 * only earns its bytes if our anatomy is its anatomy:
 *
 *   in     the kit renders exactly what the css expects
 *   out    same idea, different structure, so the rules would never match
 *
 *   menu     out — daisyUI's is `ul.menu > li > a`; ours is buttons in a div,
 *            because a menu item has an icon, a hint, a key cap and a submenu
 *            arrow, and an `<a>` is the wrong element for all four
 *   tooltip  out — daisyUI's is a `::before` driven by `data-tip`; ours is a
 *            real node in the top layer with anchor positioning and a caret
 *   toast    out — daisyUI's is a positioning container; ours stacks and
 *            animates its own
 *   list     out — daisyUI's is `ul.list > li.list-row`; ours is a div
 *   divider  out — the menu uses a 1px rule, not a labelled divider
 *
 * Shipping any of those would be five kilobytes of rules that match nothing.
 */
const COMPONENTS = [
  'button',
  'input',
  'select',
  'textarea',
  'range',
  'checkbox',
  'radio',
  'fieldset',
  'label',
  'modal',
  'card',
  'badge',
  'kbd'
];

//   alert    out — planned for `notify` and never wired. The class is not
//            emitted anywhere, so its rules matched nothing and cost 900 bytes.

/** The prefix every class is rewritten to carry. */
const PREFIX = 'prjs-';

/* the transform ----------------------------------------------------------- */

/**
 * Unwraps `@layer` blocks, keeping their contents.
 *
 * daisyUI wraps everything in `@layer utilities{}` and each rule's body in
 * `@layer daisyui.l1.l2.l3{}`, both for Tailwind v4's cascade ordering. We inject
 * one plain stylesheet into a host document and have no layer stack to fit into,
 * so the wrappers are noise — and `@layer` nested inside a style rule is new
 * enough that dropping it is also the safer read.
 */
function unwrapLayers(css) {
  let out = '';
  let i = 0;

  while (i < css.length) {
    const at = css.indexOf('@layer', i);
    if (at === -1) {
      out += css.slice(i);
      break;
    }
    out += css.slice(i, at);

    // skip the layer name up to its opening brace
    const open = css.indexOf('{', at);
    if (open === -1) {
      out += css.slice(at);
      break;
    }

    // a layer statement with no block (`@layer a, b;`) keeps its meaning nowhere
    const semi = css.indexOf(';', at);
    if (semi !== -1 && semi < open) {
      i = semi + 1;
      continue;
    }

    let depth = 1;
    let j = open + 1;
    while (j < css.length && depth > 0) {
      const ch = css[j];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      j++;
    }
    // recurse: layers nest inside layers
    out += unwrapLayers(css.slice(open + 1, j - 1));
    i = j;
  }
  return out;
}

/**
 * Renames every class in the sheet.
 *
 * A scan rather than a parser, but a careful one: it tracks strings, comments
 * and `url()` so a `.` inside `content: "."` or an unquoted data URI is left
 * alone. Skipping `url()` is not optional — daisyUI inlines svg with
 * `xmlns='http://www.w3.org/2000/svg'`, and a naive pass renames `.w3` and
 * `.org` inside it and breaks every icon.
 *
 * Everything else is renamed, including classes we never emit: a rule for
 * `.prose` becomes a rule for `.prjs-prose` and matches nothing, which is the
 * right outcome for a selector that was about somebody else's markup.
 *
 * A dot is a class when an identifier follows it. `1.5rem` is not one because a
 * digit is not an identifier start, so decimals need no special case; what does
 * need care is a dot *preceded* by something — `a.btn`, `:is(.x).y`,
 * `.a.b` are all chained selectors and all have to be renamed, which an earlier
 * version of this guard got wrong in three separate ways.
 */
function prefixClasses(css) {
  let out = '';
  let i = 0;
  let quote = null;
  let inComment = false;
  let urlDepth = 0;

  while (i < css.length) {
    const ch = css[i];
    const next = css[i + 1];

    if (inComment) {
      out += ch;
      if (ch === '*' && next === '/') {
        out += next;
        i += 2;
        inComment = false;
        continue;
      }
      i++;
      continue;
    }
    if (quote) {
      out += ch;
      if (ch === '\\') {
        out += next ?? '';
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      out += '/*';
      i += 2;
      inComment = true;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      out += ch;
      i++;
      continue;
    }

    // inside url(), every dot belongs to a hostname or a path
    if (urlDepth === 0 && /^url\(/i.test(css.slice(i, i + 4))) {
      out += css.slice(i, i + 4);
      i += 4;
      urlDepth = 1;
      continue;
    }
    if (urlDepth > 0) {
      out += ch;
      if (ch === '(') urlDepth++;
      else if (ch === ')') urlDepth--;
      i++;
      continue;
    }

    // a class selector: a dot followed by an identifier. a leading digit is not
    // an identifier start, so `1.5rem` never matches and decimals need no guard.
    if (ch === '.') {
      const identMatch = /^[a-zA-Z_-][\w-]*/.exec(css.slice(i + 1));
      if (identMatch) {
        const name = identMatch[0];
        out += name.startsWith(PREFIX) ? '.' + name : '.' + PREFIX + name;
        i += 1 + name.length;
        continue;
      }
    }

    out += ch;
    i++;
  }
  return out;
}

/** Collapses the whitespace the unwrapping leaves behind. */
function tidy(css) {
  return css
    .replace(/\/\*![\s\S]*?\*\//g, '')
    .replace(/\s*\n\s*/g, '')
    .replace(/;\s*}/g, '}')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/* building ---------------------------------------------------------------- */

const version = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8')).version;

const parts = [];
const sizes = [];

for (const name of COMPONENTS) {
  const file = join(PKG, 'components', name + '.css');
  if (!existsSync(file)) {
    console.error('daisyui has no component called "' + name + '"');
    process.exit(1);
  }
  const raw = readFileSync(file, 'utf8');
  const built = tidy(prefixClasses(unwrapLayers(raw)));
  parts.push(built);
  sizes.push({ name, raw: raw.length, out: built.length });
}

const css = parts.join('');

if (report) {
  console.log('\ndaisyUI ' + version + ' — the components the kit draws\n');
  for (const s of sizes) {
    console.log(
      '  ' + s.name.padEnd(12) + String(s.raw).padStart(8) + ' → ' + String(s.out).padStart(8)
    );
  }
  console.log(
    '\n  total ' +
      css.length +
      ' bytes, ' +
      brotliCompressSync(Buffer.from(css)).length +
      ' brotlied\n'
  );
  process.exit(0);
}

const module =
  '// GENERATED by tools/vendor-daisyui.mjs — do not edit.\n' +
  '//\n' +
  '// daisyUI ' +
  version +
  ', MIT, https://daisyui.com — the ' +
  COMPONENTS.length +
  ' components the\n' +
  '// kit draws, with every class renamed to carry the `prjs-` prefix so none of\n' +
  '// it can reach the host page. The variables it reads are declared on `.prjs`\n' +
  '// by `tokens()` in theme.ts.\n' +
  '//\n' +
  '// Regenerate with `npm run vendor:daisyui`.\n\n' +
  'export const DAISYUI_VERSION = ' +
  JSON.stringify(version) +
  ';\n\n' +
  'export const DAISYUI_CSS = ' +
  JSON.stringify(css) +
  ';\n';

if (check) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  if (current !== module) {
    console.error(
      'src/ui/kit/daisyui-css.ts is out of date with daisyui ' +
        version +
        '. Run `npm run vendor:daisyui`.'
    );
    process.exit(1);
  }
  console.log('daisyui css is current (' + version + ')');
  process.exit(0);
}

writeFileSync(OUT, module);
console.log(
  'wrote src/ui/kit/daisyui-css.ts — daisyui ' +
    version +
    ', ' +
    COMPONENTS.length +
    ' components, ' +
    css.length +
    ' bytes (' +
    brotliCompressSync(Buffer.from(css)).length +
    ' brotlied)'
);
