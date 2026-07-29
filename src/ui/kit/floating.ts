// Popovers and tooltips.
//
// Both are built on the two platform features that finally made a positioning
// library optional. The popover attribute puts an element in the top layer, so
// there is no z-index arithmetic, no portal, and Escape and light-dismiss come
// free. CSS anchor positioning places it against its trigger declaratively, and
// `position-try-fallbacks` flips it when it would leave the viewport.
//
// Both reached baseline in 2026 (Chrome 125, Firefox 132, Safari 18.2). Where
// they are missing, `position.ts` does the arithmetic and an ordinary fixed
// element stands in, which is the same behaviour one release older.

import { h, root } from './dom';
import { place } from './position';
import { ensureStyles } from './theme';
import type { Env } from '../../types';

export type Side = 'top' | 'bottom' | 'left' | 'right';

/** Which `position-area` value corresponds to a side. */
const AREA: Record<Side, string> = {
  top: 'block-start',
  bottom: 'block-end',
  left: 'inline-start',
  right: 'inline-end'
};

let uid = 0;

/** Keeps a number inside a range. */
function clamp(n: number, low: number, high: number): number {
  return high < low ? low : n < low ? low : n > high ? high : n;
}

/**
 * Adds the triangle, and returns the function that keeps it pointing at the
 * anchor.
 *
 * The side is worked out from the rendered geometry rather than from what was
 * asked for. With CSS anchor positioning the browser applies
 * `position-try-fallbacks` itself, so a popover asked for `top` may well be
 * drawn below, and nothing tells us. Comparing the two rectangles after paint
 * is the only way to know which way the caret should face.
 */
function addCaret(floater: HTMLElement, anchor: Element, doc: Document): () => void {
  const caret = h(doc, 'span', { class: 'prjs-caret', attrs: { 'aria-hidden': 'true' } });
  floater.appendChild(caret);

  return function orient(): void {
    const f = floater.getBoundingClientRect();
    const a = anchor.getBoundingClientRect();
    if (!f.width || !f.height) return;

    let side: Side;
    if (f.bottom <= a.top + 1) side = 'top';
    else if (f.top >= a.bottom - 1) side = 'bottom';
    else if (f.right <= a.left + 1) side = 'left';
    else side = 'right';
    floater.setAttribute('data-side', side);

    // point at the middle of the anchor, but never past the floater's own
    // corner: a caret hanging off the end of the box looks like a rendering bug
    const inset = 12;
    const along =
      side === 'top' || side === 'bottom'
        ? clamp(a.left + a.width / 2 - f.left, inset, f.width - inset)
        : clamp(a.top + a.height / 2 - f.top, inset, f.height - inset);
    floater.style.setProperty('--prjs-caret-at', Math.round(along) + 'px');
  };
}

/** Whether the browser can place this for us. */
export function nativeAnchoring(win: Window): boolean {
  const css = (win as unknown as { CSS?: { supports(v: string): boolean } }).CSS;
  try {
    return !!css?.supports('anchor-name: --pc');
  } catch {
    return false;
  }
}

function supportsPopover(el: Element): boolean {
  return typeof (el as { showPopover?: unknown }).showPopover === 'function';
}

/**
 * Shows `floater` against `anchor`.
 *
 * Returns a function that takes it away again. The anchoring strategy is chosen
 * per call rather than once at load, because a page can be moved between windows
 * and the kit is used inside the print frame as well as the host document.
 */
function attach(floater: HTMLElement, anchor: Element, side: Side, env: Env): () => void {
  const { document: doc, window: win } = env;
  const topLayer = supportsPopover(floater);

  if (topLayer) floater.setAttribute('popover', 'manual');
  (doc.body || doc.documentElement).appendChild(floater);

  const orient = addCaret(floater, anchor, doc);
  let cleanup = (): void => {};

  if (nativeAnchoring(win)) {
    // the browser does the maths, including the flip
    const name = '--prjs-a' + ++uid;
    const previous = (anchor as HTMLElement).style.anchorName;
    (anchor as HTMLElement).style.anchorName = name;
    floater.setAttribute('data-anchored', '');
    floater.style.setProperty('--prjs-anchor', name);
    floater.style.setProperty('--prjs-area', AREA[side]);

    // the browser has not laid it out yet, and may put it on the opposite side
    // from the one asked for. read the answer back a frame later.
    const frame = win.requestAnimationFrame(() => orient());
    const watch =
      typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(() => orient()) : null;
    watch?.observe(anchor);
    win.addEventListener('scroll', orient, true);
    win.addEventListener('resize', orient);

    cleanup = () => {
      win.cancelAnimationFrame(frame);
      watch?.disconnect();
      win.removeEventListener('scroll', orient, true);
      win.removeEventListener('resize', orient);
      (anchor as HTMLElement).style.anchorName = previous;
    };
  } else {
    // one release older: measure and place, and reposition on scroll
    const reposition = (): void => {
      const box = anchor.getBoundingClientRect();
      const self = floater.getBoundingClientRect();
      const gap = 6;
      let top = box.top - self.height - gap;
      let left = box.left + box.width / 2 - self.width / 2;

      if (side === 'bottom' || top < 0) top = box.bottom + gap;
      if (side === 'left') {
        left = box.left - self.width - gap;
        top = box.top + box.height / 2 - self.height / 2;
      }
      if (side === 'right') {
        left = box.right + gap;
        top = box.top + box.height / 2 - self.height / 2;
      }

      const fitted = place(
        floater,
        { x: left, y: top },
        { innerWidth: win.innerWidth, innerHeight: win.innerHeight },
        { margin: 8 }
      );
      floater.style.left = fitted.left + 'px';
      floater.style.top = fitted.top + 'px';
      // `place` may have clamped it away from the side we asked for, so the
      // caret is oriented from the result, exactly as in the native path
      orient();
    };

    reposition();
    win.addEventListener('scroll', reposition, true);
    win.addEventListener('resize', reposition);
    cleanup = () => {
      win.removeEventListener('scroll', reposition, true);
      win.removeEventListener('resize', reposition);
    };
  }

  if (topLayer) {
    try {
      (floater as unknown as { showPopover(): void }).showPopover();
    } catch {
      /* already open, or detached */
    }
  }

  return function close(): void {
    cleanup();
    if (topLayer) {
      try {
        (floater as unknown as { hidePopover(): void }).hidePopover();
      } catch {
        /* already closed */
      }
    }
    floater.remove();
  };
}

/* tooltips ---------------------------------------------------------------- */

export interface TooltipSpec {
  /** the text; an element with no visible label needs one of these */
  text: string;
  /** shown as a key cap after the text */
  keys?: string;
  side?: Side;
  /** how long the pointer must rest before it appears */
  delay?: number;
}

/**
 * Attaches a tooltip to an element, and returns a function that removes it.
 *
 * The text also becomes `aria-label` when the element has no accessible name, so
 * an icon-only button is not silent to a screen reader. A tooltip that is the
 * only label is a bug everywhere else; here it is the common case, and worth
 * handling rather than documenting.
 */
export function tooltip(el: HTMLElement, spec: TooltipSpec, env: Env): () => void {
  const { document: doc } = env;
  ensureStyles(doc);

  const named = el.getAttribute('aria-label') || el.textContent?.trim();
  if (!named) el.setAttribute('aria-label', spec.text);

  const id = 'prjs-tip-' + ++uid;
  let close: (() => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const show = (): void => {
    if (close) return;
    const tip = root(doc, 'div', { class: 'prjs prjs-tip', attrs: { id, role: 'tooltip' } });
    tip.append(doc.createTextNode(spec.text));
    if (spec.keys) tip.appendChild(h(doc, 'span', { class: 'prjs-kbd', text: spec.keys }));

    close = attach(tip, el, spec.side || 'top', env);
    el.setAttribute('aria-describedby', id);
  };

  const hide = (): void => {
    clearTimeout(timer);
    close?.();
    close = null;
    el.removeAttribute('aria-describedby');
  };

  const enter = (): void => {
    clearTimeout(timer);
    timer = setTimeout(show, spec.delay ?? 350);
  };

  el.addEventListener('pointerenter', enter);
  el.addEventListener('pointerleave', hide);
  // keyboard users get it immediately: they have already committed to the control
  el.addEventListener('focus', show);
  el.addEventListener('blur', hide);
  el.addEventListener('click', hide);

  return function detach(): void {
    hide();
    el.removeEventListener('pointerenter', enter);
    el.removeEventListener('pointerleave', hide);
    el.removeEventListener('focus', show);
    el.removeEventListener('blur', hide);
    el.removeEventListener('click', hide);
  };
}

/* popovers ---------------------------------------------------------------- */

export interface PopoverSpec {
  title?: string;
  /** paragraphs, or a node you built yourself */
  body: string | string[] | Node;
  side?: Side;
  /** buttons along the bottom; the popover closes after one runs */
  actions?: Array<{ id: string; label: string; tone?: string; onSelect?: () => void }>;
  /** close when the pointer leaves both the trigger and the popover */
  hoverable?: boolean;
}

export interface PopoverHandle {
  close(): void;
  readonly element: HTMLElement;
}

/**
 * Opens a popover against an element.
 *
 * Unlike a tooltip this can hold interactive content, so it takes focus and
 * closes on Escape or on a click outside. With the native popover attribute the
 * browser does both; the fallback wires them up.
 */
export function popover(anchor: HTMLElement, spec: PopoverSpec, env: Env): PopoverHandle {
  const { document: doc } = env;
  ensureStyles(doc);

  const el = root(doc, 'div', { class: 'prjs prjs-pop', attrs: { role: 'dialog' } });
  const body = h(doc, 'div', { class: 'prjs-pop-body' });

  if (spec.title) body.appendChild(h(doc, 'div', { class: 'prjs-pop-title', text: spec.title }));

  if (typeof spec.body === 'string') {
    body.appendChild(h(doc, 'div', { class: 'prjs-pop-text', text: spec.body }));
  } else if (Array.isArray(spec.body)) {
    for (const line of spec.body) {
      body.appendChild(h(doc, 'div', { class: 'prjs-pop-text', text: line }));
    }
  } else {
    body.appendChild(spec.body);
  }
  el.appendChild(body);

  let close = (): void => {};

  if (spec.actions?.length) {
    const foot = h(doc, 'div', { class: 'prjs-pop-foot' });
    for (const action of spec.actions) {
      const btn = h(doc, 'button', {
        class: 'prjs-btn',
        text: action.label,
        attrs: {
          type: 'button',
          'data-prjs-action': action.id,
          ...(action.tone ? { 'data-tone': action.tone } : {})
        }
      });
      btn.addEventListener('click', () => {
        action.onSelect?.();
        close();
      });
      foot.appendChild(btn);
    }
    el.appendChild(foot);
  }

  const detach = attach(el, anchor, spec.side || 'bottom', env);

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };
  const onOutside = (e: Event): void => {
    const target = e.target as Node | null;
    if (target && !el.contains(target) && !anchor.contains(target)) close();
  };

  doc.addEventListener('keydown', onKey, true);
  // deferred: the click that opened it is still travelling
  const wire = setTimeout(() => doc.addEventListener('pointerdown', onOutside, true), 0);

  let closed = false;
  close = (): void => {
    if (closed) return;
    closed = true;
    clearTimeout(wire);
    doc.removeEventListener('keydown', onKey, true);
    doc.removeEventListener('pointerdown', onOutside, true);
    detach();
  };

  return { close, element: el };
}
