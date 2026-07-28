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

  expect(win.Printcraft, 'the inlined library defined the global').toBeTruthy();
  expect(doc.body.textContent, 'no load-failure banner').not.toMatch(/failed to load/);
  expect(doc.querySelectorAll('#tickets .ticket').length, 'job tickets rendered').toBeGreaterThan(
    0
  );
  expect(doc.querySelectorAll('script[src], link[href]').length, 'nothing to fetch').toBe(0);

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

test('the repo demo links the compiled stylesheet rather than a cdn', () => {
  const html = read('demo/index.html');
  expect(html).not.toMatch(/cdn\.tailwindcss\.com/);
  expect(html).toMatch(/<!-- PRINTCRAFT:CSS -->/);
  expect(html).toMatch(/<!-- PRINTCRAFT:LIB -->/);
});
