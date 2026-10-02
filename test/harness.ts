// shared test harness: loads the built bundle and builds throwaway documents.

import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);

/**
 * loaded through createRequire rather than a bare import: dist/printcraft.umd.js
 * is a UMD artifact outside node_modules, and going through require avoids
 * depending on the runner's cjs interop to interpret it.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
export const Printcraft = require('../dist/printcraft.umd.js') as any;

export const I = Printcraft._internals;

/** the full block character redaction paints with. */
export const BLOCK = '█';

export function dom(html: string, url?: string): JSDOM {
  return new JSDOM(
    `<!doctype html><html><head><title>t</title></head><body>${html}</body></html>`,
    { url: url || 'https://example.com/page', pretendToBeVisual: true }
  );
}

export function env(d: JSDOM): { document: Document; window: Window } {
  return { document: d.window.document, window: d.window as unknown as Window };
}

/**
 * jsdom has no print dialog, so stub `print` on the frame the moment it lands in
 * the dom and fire `afterprint` back, which is the signal the job waits on.
 */
export function stubPrint(d: JSDOM, events?: string[]): () => void {
  const mo = new d.window.MutationObserver(() => {
    const f = d.window.document.querySelector(
      'iframe[data-prjs-frame]'
    ) as HTMLIFrameElement | null;
    const win = f?.contentWindow as (Window & { print: { _stub?: boolean } }) | null | undefined;
    if (win && !win.print?._stub) {
      const stub = Object.assign(
        () => {
          if (events) events.push('print');
          setTimeout(() => win.dispatchEvent(new d.window.Event('afterprint')), 5);
        },
        { _stub: true }
      );
      win.print = stub;
      win.focus = () => {};
    }
  });
  mo.observe(d.window.document.body, { childList: true, subtree: true });
  return () => mo.disconnect();
}
