// primitives shared by the menu, the picker, and the draw overlay.
//
// every element this layer creates carries data-pc-ui, so clip jobs strip the ui
// out of their own screenshot and the menu never opens on top of itself.

import type { Env, InspectController, JobRecord, PrintcraftOptions } from '../types';

type PrintFn = (options: PrintcraftOptions, env?: Env) => Promise<JobRecord | InspectController>;

/** the ui layer talks to printcraft only through these, so it stays testable. */
export interface UiDeps {
  print: PrintFn;
  inspect: PrintFn;
  emit: (name: string, payload?: unknown) => unknown;
}

/** just under the inspector overlay, which must be able to cover the ui. */
export const Z = 2147483645;

export const FONT = 'font:13px/1.4 ui-monospace,Consolas,Menlo,monospace;';

export function defaultEnv(): Env {
  return { document, window };
}

export function el(doc: Document, tag: string, style: string, html?: string): HTMLElement {
  const e = doc.createElement(tag);
  e.setAttribute('data-pc-ui', '');
  e.setAttribute('style', style);
  if (html != null) e.innerHTML = html;
  return e;
}
