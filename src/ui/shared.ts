// primitives shared by the menu, the picker, and the draw overlay.
//
// every element this layer creates carries data-prjs-ui, so clip jobs strip the ui
// out of their own screenshot and the menu never opens on top of itself.

import { DEFAULT_THEME } from './kit/theme';
import type { Env, InspectController, JobRecord, PrintcraftOptions } from '../types';

type PrintFn = (options: PrintcraftOptions, env?: Env) => Promise<JobRecord | InspectController>;

/** the ui layer talks to printcraft only through these, so it stays testable. */
export interface UiDeps {
  print: PrintFn;
  inspect: PrintFn;
  emit: (name: string, payload?: unknown) => unknown;
}

/** just under the inspector overlay, which must be able to cover the ui. */
/**
 * Where a tool overlay sits: above the page, below its own toolbar.
 *
 * Derived from the theme's base rather than hard-coded. It used to be
 * 2147483645, which sat above the toolbar's declared value and only worked
 * because that value exceeded the 32-bit ceiling and clamped to 2147483647 —
 * two higher, by accident. Lowering the base to make room for the whole stack
 * put the overlay back on top of the controls that drive it.
 *
 * The order, and the reason for each: proof 30 (a panel things open over),
 * **overlay 40**, toolbar 50 (the overlay's own controls, over it), modal 55,
 * menu 60, toast 70.
 */
export const Z = DEFAULT_THEME.z + 40;

/**
 * Every print a person starts goes through the proof sheet.
 *
 * Choose what to print, look at the assembled document, annotate it or think
 * better of it, and only then print. One helper, used at every handoff the ui
 * makes, so a new surface cannot forget it. A host still opts a surface out with
 * `proof: false` in its base options.
 *
 * `Printcraft.print()` from code is deliberately not routed this way — an
 * unattended job must not sit waiting for somebody who is not there.
 */
export function viaProof<T extends PrintcraftOptions>(options: T): T {
  return { proof: true, ...options };
}

export const FONT = 'font:13px/1.4 ui-monospace,Consolas,Menlo,monospace;';

export function defaultEnv(): Env {
  return { document, window };
}

export function el(doc: Document, tag: string, style: string, html?: string): HTMLElement {
  const e = doc.createElement(tag);
  e.setAttribute('data-prjs-ui', '');
  e.setAttribute('style', style);
  if (html != null) e.innerHTML = html;
  return e;
}

/**
 * Stops the browser's own context menu inside a tool overlay.
 *
 * A modal overlay covers the page. The native menu there is always wrong — its
 * entries are about a document the user cannot currently see, over a selection
 * it knows nothing about, and it appears *on top of* our surface. The region
 * tool shows its own menu instead; the others simply swallow it.
 *
 * Returns the function that stops suppressing it.
 */
export function suppressNativeMenu(layer: Element): () => void {
  const block = (ev: Event): void => {
    ev.preventDefault();
    ev.stopPropagation();
  };
  layer.addEventListener('contextmenu', block);
  return () => layer.removeEventListener('contextmenu', block);
}
