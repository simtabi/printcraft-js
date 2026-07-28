// structural guards on the shipped artifacts. these do not test behaviour — they
// test that what gets published is what we think it is.

import { test, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';
import { Printcraft } from './harness';

const at = (rel: string): string => fileURLToPath(new URL('../' + rel, import.meta.url));
const read = (rel: string): string => readFileSync(at(rel), 'utf8');

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
  expect(doc.querySelectorAll('.pc-load-error').length, 'no load-failure banner').toBe(0);
  expect(
    doc.querySelectorAll('#tickets .pc-ticket').length,
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
    const f = doc.querySelector('iframe[data-pc-frame]') as HTMLIFrameElement | null;
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
    expect(doc.querySelectorAll('iframe[data-pc-frame]').length, 'and torn down').toBe(0);
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
  expect(css, 'sass components').toMatch(/\.pc-ticket/);
  expect(css, 'sass mixin output').toMatch(/\.pc-run/);
});
