// The base every kit surface sits on: one node in the host document, a tidy
// teardown, and the keyboard behaviour people expect from something that opens
// over the page.
//
// The focus trap is hand-rolled rather than pulled in. It is forty lines and the
// alternative was 800KB on disk for a library whose headline is having no
// dependencies. It is covered by tests.

import { focusable } from './dom';
import type { Env } from '../../types';

export interface SurfaceOptions {
  env: Env;
  /** Escape closes. On by default; a confirm dialog mid-flight may not want it. */
  dismissOnEscape?: boolean;
  /** hold focus inside while open, and give it back on close */
  trapFocus?: boolean;
  /** what to focus once mounted. defaults to the first focusable thing. */
  initialFocus?: () => HTMLElement | null;
}

let openSurfaces = 0;

/**
 * Open surfaces that hold focus, in the order they opened.
 *
 * Every surface listens for keys on its document in capture, and listeners run
 * in the order they were added, so without this the one *underneath* heard a
 * key first: Escape in a dialog over the proof cancelled the proof as well, and
 * Tab in it was pulled back to the proof on every press. Only the topmost one
 * on a document answers now.
 */
const modals: Surface[] = [];
let opened = 0;

/**
 * Whether a focus-holding surface is open on this document.
 *
 * For tools that are not surfaces but listen on the document — the region
 * tool, the drawing studio — so a key meant for a dialog over them is left to
 * the dialog.
 */
export function modalOpenOn(doc: Document): boolean {
  return modals.some((m) => m.ownerDocument === doc);
}

/**
 * A mounted piece of interface. Subclasses build `node`; this handles getting it
 * into and out of the document without leaving listeners behind.
 */
export abstract class Surface {
  protected readonly doc: Document;
  protected readonly win: Window;
  protected node: HTMLElement | null = null;

  private readonly cleanups: Array<() => void> = [];
  private returnFocusTo: Element | null = null;
  private closed = false;

  constructor(protected readonly options: SurfaceOptions) {
    this.doc = options.env.document;
    this.win = options.env.window;
  }

  /** Builds the surface's root node. Called once, on mount. */
  protected abstract build(): HTMLElement;

  /** Runs after the node is in the document and focus has moved. */
  protected mounted(): void {
    /* nothing by default */
  }

  /** Runs before the node leaves the document. */
  protected unmounting(): void {
    /* nothing by default */
  }

  get isOpen(): boolean {
    return !!this.node && !this.closed;
  }

  get element(): HTMLElement | null {
    return this.node;
  }

  /** The document this surface is mounted in. */
  get ownerDocument(): Document {
    return this.doc;
  }

  private get holdsFocus(): boolean {
    return this.options.trapFocus !== false;
  }

  /** when it opened, relative to every other surface */
  private seq = 0;

  /** Whether a focus-holding surface opened over this one, on the same document. */
  protected get covered(): boolean {
    return modals.some((m) => m !== this && m.doc === this.doc && m.seq > this.seq);
  }

  open(): this {
    if (this.node) return this;

    this.returnFocusTo = this.doc.activeElement;
    this.node = this.build();
    (this.doc.body || this.doc.documentElement).appendChild(this.node);
    openSurfaces++;
    this.seq = ++opened;
    if (this.holdsFocus) modals.push(this);

    this.on(
      this.doc,
      'keydown',
      (ev) => {
        // a key is for whatever is on top
        if (!this.covered) this.onKeydown(ev as KeyboardEvent);
      },
      true
    );
    if (this.options.trapFocus !== false) this.focusFirst();
    this.mounted();
    return this;
  }

  close(): void {
    if (!this.node || this.closed) return;
    this.closed = true;

    this.unmounting();
    for (const undo of this.cleanups.splice(0)) {
      try {
        undo();
      } catch {
        /* a failing cleanup must not strand the node */
      }
    }
    this.node.remove();
    this.node = null;
    openSurfaces = Math.max(0, openSurfaces - 1);
    const at = modals.indexOf(this);
    if (at !== -1) modals.splice(at, 1);

    // put focus back where it was, if that element is still around
    const back = this.returnFocusTo as HTMLElement | null;
    if (back && typeof back.focus === 'function' && back.isConnected) {
      try {
        back.focus();
      } catch {
        /* noop */
      }
    }
  }

  /** Registers a listener and its removal in one go. */
  protected on(
    target: EventTarget,
    type: string,
    handler: (ev: Event) => void,
    capture = false
  ): void {
    target.addEventListener(type, handler, capture);
    this.cleanups.push(() => target.removeEventListener(type, handler, capture));
  }

  /** Registers arbitrary teardown work. */
  protected addCleanup(fn: () => void): void {
    this.cleanups.push(fn);
  }

  protected onKeydown(ev: KeyboardEvent): void {
    if (ev.key === 'Escape' && this.options.dismissOnEscape !== false) {
      ev.preventDefault();
      ev.stopPropagation();
      this.close();
      return;
    }
    if (ev.key === 'Tab' && this.options.trapFocus !== false) this.holdFocus(ev);
  }

  /**
   * Keeps Tab inside the surface. Without this, tabbing walks out into the page
   * behind a modal, which is both confusing and an accessibility failure.
   */
  private holdFocus(ev: KeyboardEvent): void {
    if (!this.node) return;
    const stops = focusable(this.node);
    if (!stops.length) {
      ev.preventDefault();
      return;
    }

    const first = stops[0]!;
    const last = stops[stops.length - 1]!;
    const active = this.doc.activeElement;

    // focus can be outside entirely if something removed the active element
    if (!this.node.contains(active)) {
      ev.preventDefault();
      first.focus();
      return;
    }
    if (ev.shiftKey && active === first) {
      ev.preventDefault();
      last.focus();
    } else if (!ev.shiftKey && active === last) {
      ev.preventDefault();
      first.focus();
    }
  }

  protected focusFirst(): void {
    if (!this.node) return;
    const wanted = this.options.initialFocus?.() || focusable(this.node)[0] || this.node;
    try {
      if (wanted === this.node && !this.node.hasAttribute('tabindex')) {
        this.node.setAttribute('tabindex', '-1');
      }
      wanted.focus({ preventScroll: true });
    } catch {
      /* noop */
    }
  }
}

/** How many kit surfaces are open. Used by tests and by the region tool. */
export function openSurfaceCount(): number {
  return openSurfaces;
}
