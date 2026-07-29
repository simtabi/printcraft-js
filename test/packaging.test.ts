// structural guards on the shipped artifacts. these do not test behaviour: they
// test that what gets published is what we think it is.

import { test, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';
import { Printcraft } from './harness';

const at = (rel: string): string => fileURLToPath(new URL('../' + rel, import.meta.url));
const read = (rel: string): string => readFileSync(at(rel), 'utf8');

/** Every .ts under a directory, so a scan cannot miss a file nobody remembered. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (rel: string): void => {
    for (const entry of readdirSync(at(rel), { withFileTypes: true })) {
      const next = rel + '/' + entry.name;
      if (entry.isDirectory()) walk(next);
      else if (entry.name.endsWith('.ts')) out.push(at(next));
    }
  };
  walk(dir);
  return out;
}

/* the bundle ----------------------------------------------------------- */

test('the bundle reports the package.json version', () => {
  const pkg = JSON.parse(read('package.json')) as { version: string };
  expect(Printcraft.version).toBe(pkg.version);
});

test('the static event bus is exposed', () => {
  // dropped once during the typescript migration and had to be restored; the
  // per-job listener test depends on being able to inspect it
  expect(Printcraft._bus).toBeTruthy();
  expect(typeof Printcraft._bus.listenerCount).toBe('function');
});

test('the declaration bundle exports the real option type, not a Record', () => {
  const dts = read('dist/types/index.d.ts');
  expect(dts).toMatch(/PrintcraftOptions/);
  expect(dts).not.toMatch(/Options\s*=\s*Record<string,\s*any>/);
});

test('every exports condition points at a file that exists', () => {
  const pkg = JSON.parse(read('package.json')) as {
    exports: Record<string, Record<string, Record<string, string>>>;
  };
  const entry = pkg.exports['.']!;

  for (const [condition, targets] of Object.entries(entry)) {
    for (const [kind, rel] of Object.entries(targets)) {
      expect(existsSync(at(rel)), `${condition}.${kind} -> ${rel}`).toBe(true);
    }
  }
});

test('the CJS declarations use export =, matching module.exports = Printcraft', () => {
  // the umd bundle assigns the class straight onto module.exports. typed as a
  // default export, node16-from-CJS would demand a `.default` that is not there
  expect(read('dist/printcraft.umd.js')).not.toMatch(/__esModule/);
  expect(read('dist/types/index.d.cts')).toMatch(/export = Printcraft;/);
  expect(read('dist/types/index.d.mts')).toMatch(/export \{ default \}/);
});

/* the standalone demo -------------------------------------------------- */

test('the standalone demo has no external references at all', () => {
  const html = read('dist/demo-standalone.html');

  expect(html, 'no tailwind play cdn').not.toMatch(/cdn\.tailwindcss\.com/);
  expect(html, 'no absolute or protocol-relative asset urls').not.toMatch(
    /<(script|link)[^>]+(src|href)=["']?(https?:)?\/\//i
  );
  expect(html, 'the stylesheet is inlined').toMatch(
    /<style>[\s\S]*--color-process-c[\s\S]*<\/style>/
  );
});

test('the standalone demo boots offline and runs a print job', async () => {
  // jsdom has no canvas, so the demo chart logs errors that do not apply to real
  // browsers. silence the virtual console rather than chase them.
  const virtualConsole = new VirtualConsole();
  const d = new JSDOM(read('dist/demo-standalone.html'), {
    url: 'file:///demo-standalone.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole
  });
  const doc = d.window.document;
  const win = d.window as unknown as Window & { Printcraft?: typeof Printcraft };

  // the demo script defers its work to DOMContentLoaded, so nothing is rendered
  // at the moment the JSDOM constructor returns
  await new Promise<void>((resolve) => {
    if (doc.readyState !== 'loading') resolve();
    else doc.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
  });

  expect(win.Printcraft, 'the inlined library defined the global').toBeTruthy();
  // assert on the banner element, not on body text: textContent includes the
  // source of every inlined script, which discusses the failure case in a comment
  expect(doc.querySelectorAll('.prjs-load-error').length, 'no load-failure banner').toBe(0);
  expect(
    doc.querySelectorAll('#tickets .prjs-ticket').length,
    'job tickets rendered'
  ).toBeGreaterThan(0);
  // a data: URI is not a fetch, so the favicon link is allowed to remain a link
  const fetched = [...doc.querySelectorAll('script[src], link[href]')].filter((el) => {
    const url = el.getAttribute('src') || el.getAttribute('href') || '';
    return !url.startsWith('data:');
  });
  expect(
    fetched.map((el) => el.outerHTML),
    'nothing to fetch'
  ).toEqual([]);
  expect(doc.querySelector('link[rel="icon"]')?.getAttribute('href'), 'favicon inlined').toMatch(
    /^data:image\/svg\+xml/
  );

  // and a real job completes end to end inside that single file
  const frames: HTMLIFrameElement[] = [];
  const mo = new d.window.MutationObserver(() => {
    const f = doc.querySelector('iframe[data-prjs-frame]') as HTMLIFrameElement | null;
    const frameWin = f?.contentWindow as
      (Window & { print: { _stub?: boolean } }) | null | undefined;
    if (f && frameWin && !frameWin.print?._stub) {
      frames.push(f);
      frameWin.print = Object.assign(
        () => {
          setTimeout(() => frameWin.dispatchEvent(new d.window.Event('afterprint')), 5);
        },
        { _stub: true }
      );
      frameWin.focus = () => {};
    }
  });
  mo.observe(doc.body, { childList: true, subtree: true });

  try {
    const job = await win.Printcraft!.print(
      {
        target: '#report',
        assetTimeout: 100,
        afterPrintTimeout: 300
      },
      { document: doc, window: d.window as unknown as Window }
    );
    expect(job.status).toBe('done');
    expect(frames.length, 'a print frame was mounted').toBe(1);
    expect(doc.querySelectorAll('iframe[data-prjs-frame]').length, 'and torn down').toBe(0);
  } finally {
    mo.disconnect();
    d.window.close();
  }
});

/* the demo source ------------------------------------------------------ */

test('the demo markup carries no inline script or style', () => {
  const html = read('demo/index.html');

  expect(html, 'no tailwind play cdn').not.toMatch(/cdn\.tailwindcss\.com/);
  // an inline <style> block, or a <script> with a body rather than a src
  expect(html, 'no <style> block').not.toMatch(/<style[\s>]/i);
  expect(html, 'no style attribute').not.toMatch(/\sstyle=["']/i);
  expect(html, 'no inline script body').not.toMatch(/<script(?![^>]*\ssrc=)[^>]*>[\s\S]*?\S/i);

  for (const marker of ['ICON', 'CSS', 'CONFIG', 'LIB', 'DEMO']) {
    expect(html, `${marker} markers`).toMatch(new RegExp(`<!-- PRINTCRAFT:${marker} -->`));
  }
});

test('every asset the demo references is produced by the build', () => {
  const html = read('demo/index.html');
  const refs = [...html.matchAll(/(?:src|href)="(\.\.\/dist\/[^"]+)"/g)].map((m) => m[1]!);

  expect(refs.length, 'the demo references built assets').toBeGreaterThan(0);
  for (const ref of refs) {
    expect(existsSync(at(ref.replace('../', ''))), ref).toBe(true);
  }
});

test('the favicon set is complete and real', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  expect(readFileSync(at('dist/assets/favicon/icon-192.png')).subarray(0, 4)).toEqual(png);
  expect(readFileSync(at('dist/assets/favicon/apple-touch-icon.png')).subarray(0, 4)).toEqual(png);

  // ICO header: reserved 0, type 1 (icon), then the image count
  const ico = readFileSync(at('dist/assets/favicon/favicon.ico'));
  expect(ico.readUInt16LE(0)).toBe(0);
  expect(ico.readUInt16LE(2)).toBe(1);
  expect(ico.readUInt16LE(4), 'three sizes packed').toBe(3);

  const manifest = JSON.parse(read('dist/assets/favicon/site.webmanifest')) as {
    icons: { src: string }[];
  };
  for (const icon of manifest.icons) {
    expect(existsSync(at('dist/assets/favicon/' + icon.src)), icon.src).toBe(true);
  }
});

test('the compiled stylesheet carries both the utility and component layers', () => {
  const css = read('dist/assets/css/demo.css');
  expect(css, 'tailwind theme tokens').toMatch(/--color-process-c/);
  expect(css, 'sass components').toMatch(/\.prjs-ticket/);
  expect(css, 'sass mixin output').toMatch(/\.prjs-run/);
});

/* the subpath split ------------------------------------------------------- */
//
// `static ui = {...}` is a live reference no bundler can drop, so without a
// split everybody who only calls print() would ship a modal kit and a rasteriser
// they never open. These pin the split down, because the failure mode is silent:
// the wrong import graph still works, it is just twice the size.

/**
 * Everything an entry pulls in *statically*, followed through the chunks.
 *
 * Reading one file is not the question. The bundler splits shared code into
 * numbered chunks and the entry becomes a shim over them, so a check against
 * `printcraft-core.mjs` alone was reading a re-export list and passing on it.
 * Dynamic imports are deliberately not followed: something loaded on demand is
 * exactly what the split is for.
 */
function staticGraph(entry: string): string {
  const seen = new Set<string>();
  let text = '';

  const walk = (file: string): void => {
    if (seen.has(file) || !existsSync(at(file))) return;
    seen.add(file);
    const body = read(file);
    text += body;

    // every relative specifier that is not the argument to `import(`. Matching
    // the import *statement* is hopeless against minified output, which writes
    // half a dozen shapes of it; matching the specifier and asking how it was
    // reached is one rule. Dynamic imports are skipped on purpose — something
    // loaded on demand is exactly what the split is for.
    for (const m of body.matchAll(/["'](\.\/[\w.-]+\.mjs)["']/g)) {
      const before = body.slice(Math.max(0, m.index - 8), m.index);
      if (/import\s*\($/.test(before)) continue;
      walk('dist/' + m[1]!.slice(2));
    }
  };
  walk(entry);
  return text;
}

test('the core bundle contains no interface code', () => {
  // `printcraft.mjs` is what `exports["."]` points at. `printcraft-core.mjs` is
  // a shared chunk that happens to be named like an entry, and reading it was
  // what this test used to do — it passed because that chunk once held the
  // paginator, not because the split was right.
  const core = staticGraph('dist/printcraft.mjs');

  expect(core, 'no modal kit').not.toContain('prjs-modal-box');
  expect(core, 'no toolbar').not.toContain('prjs-toolbar');
  expect(core, 'no context menu').not.toContain('prjs-menu');
  expect(core, 'no colour picker').not.toContain('clr-picker');
  // and it does still hold the things a print needs
  expect(core).toContain('prjs-page-sheet');
  expect(core).toContain('prjs-redacted');
});

test('the proof sheet is loaded on demand, not carried by core', () => {
  // it reaches the whole component kit, so a static import would put a modal
  // library in front of everyone who only calls print()
  const core = staticGraph('dist/printcraft.mjs');
  expect(core, 'the proof panel must not be in the static graph').not.toContain('prjs-proof-rail');
});

test('the interface chunk is where the kit actually lives', () => {
  const ui = staticGraph('dist/printcraft.ui.mjs');
  expect(ui).toContain('prjs-modal-box');
});

test('every subpath in exports resolves to a file that exists', () => {
  const pkg = JSON.parse(read('package.json'));

  for (const [subpath, conditions] of Object.entries(pkg.exports)) {
    if (typeof conditions === 'string') {
      expect(existsSync(at(conditions)), subpath).toBe(true);
      continue;
    }
    for (const [mode, entry] of Object.entries(conditions as Record<string, unknown>)) {
      for (const file of Object.values(entry as Record<string, string>)) {
        expect(existsSync(at(file)), subpath + ' → ' + mode).toBe(true);
      }
    }
  }
});

test('typesVersions covers every subpath, for resolvers that predate exports', () => {
  const pkg = JSON.parse(read('package.json'));
  const subpaths = Object.keys(pkg.exports)
    .filter((k) => k !== '.' && k !== './package.json')
    .map((k) => k.replace('./', ''));

  for (const subpath of subpaths) {
    expect(pkg.typesVersions['*'][subpath], subpath + ' is missing').toBeTruthy();
    expect(existsSync(at(pkg.typesVersions['*'][subpath][0])), subpath + ' points at nothing').toBe(
      true
    );
  }
});

test('the umd bundle still carries everything, because a script tag cannot split', () => {
  const umd = read('dist/printcraft.umd.js');
  expect(umd).toContain('prjs-modal-box');
  expect(umd).toContain('prjs-page-sheet');
});

/* the surfaces that drift ------------------------------------------------- */

test('every event the code emits is in the public union', () => {
  // Five had drifted out of it before this test existed: the whole `state:*`
  // family, which the memory subsystem announces through a variable rather than
  // a literal, and `job:restart`. A name missing from the union is one a
  // TypeScript caller cannot subscribe to without a cast.
  const sources = sourceFiles('src');
  const emitted = new Set<string>();

  for (const file of sources) {
    const body = readFileSync(file, 'utf8');
    for (const m of body.matchAll(/(?:emit|fire|announce)\(\s*'([a-z]+:[a-z]+|trigger|hotkey)'/g)) {
      emitted.add(m[1]!);
    }
  }

  const types = readFileSync(at('src/types.ts'), 'utf8');
  const start = types.indexOf('export type PrintcraftEvent');
  const union = types.slice(start, types.indexOf(';', start));
  const declared = new Set([...union.matchAll(/'([a-z:]+)'/g)].map((m) => m[1]!));

  // sorted in place: both arrays are built on the line above
  // oxlint-disable-next-line no-array-sort
  const missing = [...emitted].filter((e) => !declared.has(e));
  missing.sort();
  // oxlint-disable-next-line no-array-sort
  const stale = [...declared].filter((e) => !emitted.has(e));
  stale.sort();

  expect(emitted.size, 'the scan found nothing, so it is broken').toBeGreaterThan(20);
  expect(missing, 'emitted but not declared').toEqual([]);
  expect(stale, 'declared but never emitted').toEqual([]);
});

test('every option is documented', () => {
  // `proof`, `coverPage` and `notesPage` all shipped undocumented.
  const types = readFileSync(at('src/types.ts'), 'utf8');
  const iface = types.slice(
    types.indexOf('export interface PrintcraftOptions'),
    types.indexOf('export interface ResolvedOptions')
  );
  const options = [...iface.matchAll(/^ {2}([a-zA-Z]\w*)\??:/gm)].map((m) => m[1]!);
  const docs = readFileSync(at('docs/tools/options.md'), 'utf8');

  expect(options.length, 'the scan found nothing, so it is broken').toBeGreaterThan(40);
  expect(
    options.filter((o) => !docs.includes(o)),
    'in PrintcraftOptions but not in docs/tools/options.md'
  ).toEqual([]);
});
