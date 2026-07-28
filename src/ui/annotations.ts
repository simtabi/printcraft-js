// the modes that write data attributes back onto the live page. marks made here
// persist, so every later job from any surface honors them.

import { NS } from '../support';
import { promptFor } from './kit';
import type { ClipRect, Env } from '../types';

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

const NOTE_ATTR = 'data-' + NS + '-note';

/**
 * Attaches a note. Pass the text to set it, an empty string to clear it.
 *
 * Synchronous, and never asks the user anything: `askForNote` is the version
 * that opens a dialog. Splitting the two keeps this callable from a transform,
 * a test, or a keyboard shortcut without dragging the UI layer along.
 */
export function annotate(target: Element, text: string | null): string | null {
  if (text == null) return null;
  if (text === '') {
    target.removeAttribute(NOTE_ATTR);
    return '';
  }
  target.setAttribute(NOTE_ATTR, text);
  return text;
}

export function noteOn(target: Element): string {
  return target.getAttribute(NOTE_ATTR) || '';
}

/**
 * Asks for a note and attaches it. Resolves with the new text, or null if the
 * dialog was dismissed.
 *
 * This used to be `window.prompt`, which blocks the event loop, cannot be
 * themed, and is silently ignored inside a cross-origin frame.
 */
export async function askForNote(target: Element, env?: Env): Promise<string | null> {
  const scope = env || {
    document: target.ownerDocument as Document,
    window: target.ownerDocument?.defaultView as Window & typeof globalThis
  };

  const text = await promptFor(
    {
      title: 'Note for this element',
      label: 'Note',
      value: noteOn(target),
      hint: 'Printed as a chip beside the element. Clear it to remove the note.',
      placeholder: 'verify with legal before release',
      multiline: true
    },
    scope
  );

  if (text == null) return null;
  return annotate(target, text);
}
