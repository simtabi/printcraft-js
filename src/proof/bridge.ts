// Carrying a mark from the proof back to the page.
//
// The proof shows a *copy*. Annotating it and stopping there would mean the note
// belonged to a document that is thrown away the moment anything re-renders —
// change the paper from A4 to Letter and twenty minutes of marking up is gone,
// which is the worst possible behaviour for a panel whose whole job is to let
// you change your mind before printing.
//
// So a mark made on the proof is written to the source element it came from, and
// the proof is rebuilt from the source. The link is `data-prjs-id`, which the
// pipeline already writes on the source and the clone inherits — it exists to
// correlate a measurement with the node it measured, and is normally swept up at
// the end of the job. The proof holds it open instead.

import { DATA_ID, NS } from '../support';

/** The attributes a mark lives in. All three travel the same way. */
const MARK_ATTRS = ['-note', '-redact', '-drawing'].map((suffix) => 'data-' + NS + suffix);

/** The live element a proof element was cloned from, or null. */
export function sourceOf(el: Element, srcDoc: Document): Element | null {
  const id = el.getAttribute(DATA_ID);
  if (!id) return null;
  // an attribute selector rather than getElementById: the value is a counter,
  // not an id, and two jobs on one page would collide in the id space
  return srcDoc.querySelector('[' + DATA_ID + '="' + CSS.escape(id) + '"]');
}

/**
 * Copies every mark on a proof element onto the page element behind it.
 *
 * Returns false when there is nothing behind it — an element the pipeline
 * generated rather than cloned, such as a page number or a cover sheet. Those
 * are not annotatable in any useful sense: there is nowhere for the mark to live
 * once the sheet is rebuilt.
 */
export function pushMark(el: Element, srcDoc: Document): boolean {
  const source = sourceOf(el, srcDoc);
  if (!source) return false;

  for (const attr of MARK_ATTRS) {
    const value = el.getAttribute(attr);
    if (value === null) source.removeAttribute(attr);
    else source.setAttribute(attr, value);
  }
  return true;
}

/**
 * Takes the link back down.
 *
 * Run when the proof closes. The attribute is ours and invisible, but leaving it
 * on somebody's live DOM after the panel has gone is litter, and a later job
 * that measured the same tree would find stale numbers already there.
 */
export function releaseSourceLink(srcDoc: Document): number {
  const tagged = srcDoc.querySelectorAll('[' + DATA_ID + ']');
  for (const el of tagged) el.removeAttribute(DATA_ID);
  return tagged.length;
}
