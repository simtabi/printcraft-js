// the modes that write data attributes back onto the live page. marks made here
// persist, so every later job from any surface honors them.

import { parse as parseDrawing } from '../annotate/model';
import { unmountOverlay as unmountDrawing } from '../annotate/render';
import { NS, describeElement } from '../support';
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
  // `null` and `''` both mean there is no note. This used to return early on
  // null, so `annotate(el, null)` looked like a removal and silently did
  // nothing; cancelling a prompt is handled in askForNote, which never gets
  // here, so there was nothing for the early return to protect.
  if (text == null || text === '') {
    target.removeAttribute(NOTE_ATTR);
    return null;
  }
  target.setAttribute(NOTE_ATTR, text);
  return text;
}

/** Takes the note off, if there is one. Returns what it was. */
export function removeNote(target: Element): string | null {
  const had = target.getAttribute(NOTE_ATTR);
  target.removeAttribute(NOTE_ATTR);
  return had;
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

export { describeElement };

export interface Mark {
  element: Element;
  kind: 'note' | 'redaction' | 'drawing';
  /** the note's text, or a summary of what was drawn; empty for a redaction */
  text: string;
  /** a short, readable pointer back to the element */
  where: string;
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
  for (const el of doc.querySelectorAll('[data-' + NS + '-drawing]')) {
    out.push({
      element: el,
      kind: 'drawing',
      text: summariseDrawing(el.getAttribute('data-' + NS + '-drawing')),
      where: describeElement(el)
    });
  }
  return out;
}

/**
 * What was drawn, in words.
 *
 * The panel and the notes page both list marks, and a drawing has no text of its
 * own to list. Counting the shapes by kind is the closest thing to a caption
 * that does not require rendering it.
 */
export function summariseDrawing(raw: string | null): string {
  const drawing = parseDrawing(raw);
  if (!drawing.shapes.length) return 'an empty drawing';

  const words = drawing.shapes.filter((s) => s.kind === 'text' && s.text).map((s) => s.text);
  if (words.length === drawing.shapes.length) return '“' + words.join('”, “') + '”';

  const counts = new Map<string, number>();
  for (const shape of drawing.shapes) counts.set(shape.kind, (counts.get(shape.kind) || 0) + 1);

  const names: Record<string, [string, string]> = {
    pen: ['freehand mark', 'freehand marks'],
    highlight: ['highlight', 'highlights'],
    line: ['line', 'lines'],
    arrow: ['arrow', 'arrows'],
    rect: ['box', 'boxes'],
    ellipse: ['circle', 'circles'],
    text: ['label', 'labels']
  };

  return [...counts]
    .map(([kind, n]) => n + ' ' + (names[kind] || [kind, kind])[n === 1 ? 0 : 1])
    .join(', ');
}

const KIND_ATTR: Record<Mark['kind'], string> = {
  note: '-note',
  redaction: '-redact',
  drawing: '-drawing'
};

/** Removes every note, redaction and drawing. Returns how many went. */
export function clearAnnotations(doc: Document): number {
  const marks = annotations(doc);
  for (const mark of marks) {
    mark.element.removeAttribute('data-' + NS + KIND_ATTR[mark.kind]);
    if (mark.kind === 'drawing') unmountDrawing(mark.element as HTMLElement);
  }
  return marks.length;
}
