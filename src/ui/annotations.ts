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

export interface Mark {
  element: Element;
  kind: 'note' | 'redaction';
  /** the note's text; empty for a redaction */
  text: string;
  /** a short, readable pointer back to the element */
  where: string;
}

/** A readable description of where an element is, for a list. */
export function describeElement(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const id = el.id ? '#' + el.id : '';
  const cls = el.classList.length ? '.' + [...el.classList].slice(0, 2).join('.') : '';
  const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  return tag + id + cls + (text ? ' · ' + text + (text.length >= 40 ? '…' : '') : '');
}

/**
 * Every note and redaction currently marked on the page.
 *
 * Both are stored as attributes on the live element, which is what makes them
 * survive between jobs. It also means this is the only way to see them all:
 * without it, a note added twenty minutes ago is invisible until something
 * prints.
 */
export function annotations(doc: Document): Mark[] {
  const out: Mark[] = [];

  for (const el of doc.querySelectorAll('[data-' + NS + '-note]')) {
    out.push({
      element: el,
      kind: 'note',
      text: el.getAttribute('data-' + NS + '-note') || '',
      where: describeElement(el)
    });
  }
  for (const el of doc.querySelectorAll('[data-' + NS + '-redact]')) {
    out.push({ element: el, kind: 'redaction', text: '', where: describeElement(el) });
  }
  return out;
}

/** Removes every note and redaction. Returns how many went. */
export function clearAnnotations(doc: Document): number {
  const marks = annotations(doc);
  for (const mark of marks) {
    mark.element.removeAttribute('data-' + NS + (mark.kind === 'note' ? '-note' : '-redact'));
  }
  return marks.length;
}
