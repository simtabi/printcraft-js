// the modes that write data attributes back onto the live page. marks made here
// persist, so every later job from any surface honors them.

import { NS } from '../support';
import type { ClipRect } from '../types';

/** pure: a page-coordinate rectangle from two pointer points plus the scroll offset. */
export function computeRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  scrollX: number,
  scrollY: number
): ClipRect {
  return {
    x: Math.min(x1, x2) + scrollX,
    y: Math.min(y1, y2) + scrollY,
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1)
  };
}

/** marks or unmarks an element for redaction. returns the new state. */
export function toggleRedact(target: Element): boolean {
  const attr = 'data-' + NS + '-redact';
  if (target.hasAttribute(attr)) {
    target.removeAttribute(attr);
    return false;
  }
  target.setAttribute(attr, '');
  return true;
}

/** attaches a note. omit `text` to prompt for it; an empty string clears it. */
export function annotate(target: Element, text?: string | null): string | null {
  const attr = 'data-' + NS + '-note';
  let value = text;

  if (value == null) {
    try {
      const view = target.ownerDocument?.defaultView;
      value = view ? view.prompt('Note for this element:', target.getAttribute(attr) || '') : null;
    } catch {
      value = null;
    }
  }
  if (value == null) return null;
  if (value === '') {
    target.removeAttribute(attr);
    return '';
  }
  target.setAttribute(attr, value);
  return value;
}
