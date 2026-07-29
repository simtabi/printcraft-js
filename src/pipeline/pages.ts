// The two sheets that are not the content: a cover at the front, and the notes
// at the back.
//
// Both exist because of the same gap. A title that only reaches the browser's
// save-as-PDF filename is invisible on paper, and a note marked on a paragraph
// prints as a chip beside it and nowhere else — so a person holding twelve
// printed sheets has no way to see that three of them were annotated, or what
// the annotations said.
//
// The cover answers the first, the notes page the second, and both are off by
// default because a one-page receipt does not want either.

import { NS } from '../support';
import type { ResolvedOptions } from '../types';

/** What a cover or notes page can be given instead of `true`. */
export interface PageSpec {
  title?: string;
  description?: string;
  /** a line under the rest: a date, a reference, a reader's name */
  meta?: string | true;
  /** build the whole sheet yourself. everything above is ignored. */
  template?: (doc: Document, options: ResolvedOptions) => Node | null;
}

export type PageOption = boolean | PageSpec | ((doc: Document, o: ResolvedOptions) => Node | null);

/** Reads whichever of the three shapes was passed. */
function toSpec(value: PageOption | undefined): PageSpec | null {
  if (!value) return null;
  if (value === true) return {};
  if (typeof value === 'function') return { template: value };
  return value;
}

function stamp(meta: string | true | undefined): string {
  if (!meta) return '';
  return meta === true ? new Date().toLocaleString() : String(meta);
}

/* the cover --------------------------------------------------------------- */

/**
 * A sheet of its own carrying the title and description.
 *
 * Distinct from `printHeading`, which puts the same words *above* the content on
 * the first sheet. A report wants a cover; an invoice wants a heading; a receipt
 * wants neither, and asking for one should not silently give the other.
 */
export function buildCoverPage(options: ResolvedOptions, doc: Document): Element | null {
  const spec = toSpec(options.coverPage as PageOption | undefined);
  if (!spec) return null;

  if (spec.template) {
    const made = spec.template(doc, options);
    if (!made) return null;
    const host = doc.createElement('section');
    host.className = 'prjs-cover';
    host.setAttribute('data-' + NS + '-cover', '');
    host.appendChild(made);
    return host;
  }

  const title = spec.title ?? options.documentTitle ?? '';
  const description = spec.description ?? options.documentDescription ?? '';
  const meta = stamp(spec.meta);

  // a cover sheet with nothing on it is a blank page somebody has to throw away
  if (!title && !description && !meta) return null;

  const cover = doc.createElement('section');
  cover.className = 'prjs-cover';
  cover.setAttribute('data-' + NS + '-cover', '');

  const inner = doc.createElement('div');
  inner.className = 'prjs-cover-inner';

  if (title) {
    const h1 = doc.createElement('h1');
    h1.className = 'prjs-cover-title';
    h1.textContent = title;
    inner.appendChild(h1);
  }
  if (description) {
    const p = doc.createElement('p');
    p.className = 'prjs-cover-desc';
    p.textContent = description;
    inner.appendChild(p);
  }
  if (meta) {
    const m = doc.createElement('p');
    m.className = 'prjs-cover-meta';
    m.textContent = meta;
    inner.appendChild(m);
  }

  cover.appendChild(inner);
  return cover;
}

/* the notes page ---------------------------------------------------------- */

/** One line of the list, gathered from the source page before anything printed. */
export interface PageNote {
  kind: 'note' | 'redaction' | 'drawing';
  /** the note's words, or what was drawn */
  text: string;
  /** a readable pointer at the element it belongs to */
  where: string;
}

const KIND_LABEL: Record<PageNote['kind'], string> = {
  note: 'Note',
  redaction: 'Redacted',
  drawing: 'Drawing'
};

/**
 * Every mark on the source page, in document order.
 *
 * Read from the live document rather than the clone, because redaction has
 * already destroyed the evidence by the time the clone exists — which is the
 * point of redaction, and the reason this has to run first.
 */
export function collectNotes(
  srcDoc: Document | null,
  describe: (el: Element, options?: { quote?: boolean }) => string
): PageNote[] {
  if (!srcDoc) return [];

  const marked = srcDoc.querySelectorAll(
    '[data-' + NS + '-note], [data-' + NS + '-redact], [data-' + NS + '-drawing]'
  );

  const out: PageNote[] = [];
  for (const el of marked) {
    // a description normally quotes the element's text, which is how a person
    // recognises which row is meant. For a redacted element that text is the
    // secret, so its line gets the structural pointer alone. Printing the quoted
    // form would put on the last sheet exactly what page two destroyed.
    const where = describe(el);
    const safeWhere = describe(el, { quote: false });

    // one element can carry all three, and each is a line of its own
    const note = el.getAttribute('data-' + NS + '-note');
    if (note != null) out.push({ kind: 'note', text: note, where });
    if (el.hasAttribute('data-' + NS + '-redact')) {
      out.push({ kind: 'redaction', text: '', where: safeWhere });
    }
    if (el.hasAttribute('data-' + NS + '-drawing')) {
      out.push({ kind: 'drawing', text: '', where: safeWhere });
    }
  }
  return out;
}

/**
 * The list, on its own sheet at the end.
 *
 * Returns null when there is nothing to list, so `notesPage: true` on a document
 * nobody marked does not print an empty sheet headed "Notes".
 */
export function buildNotesPage(
  options: ResolvedOptions,
  doc: Document,
  notes: PageNote[]
): Element | null {
  const spec = toSpec(options.notesPage as PageOption | undefined);
  if (!spec) return null;

  if (spec.template) {
    const made = spec.template(doc, options);
    if (!made) return null;
    const host = doc.createElement('section');
    host.className = 'prjs-notes-page';
    host.setAttribute('data-' + NS + '-notes-page', '');
    host.appendChild(made);
    return host;
  }

  if (!notes.length) return null;

  const page = doc.createElement('section');
  page.className = 'prjs-notes-page';
  page.setAttribute('data-' + NS + '-notes-page', '');

  const title = spec.title ?? options.documentTitle ?? '';
  const description = spec.description ?? options.documentDescription ?? '';

  if (title || description) {
    const head = doc.createElement('header');
    head.className = 'prjs-notes-head';
    if (title) {
      const h = doc.createElement('h2');
      h.className = 'prjs-notes-title';
      h.textContent = title;
      head.appendChild(h);
    }
    if (description) {
      const p = doc.createElement('p');
      p.className = 'prjs-notes-desc';
      p.textContent = description;
      head.appendChild(p);
    }
    page.appendChild(head);
  }

  const heading = doc.createElement('h3');
  heading.className = 'prjs-notes-legend';
  heading.textContent = notes.length === 1 ? '1 mark' : notes.length + ' marks';
  page.appendChild(heading);

  const list = doc.createElement('ol');
  list.className = 'prjs-notes-list';

  notes.forEach((note) => {
    const item = doc.createElement('li');
    item.className = 'prjs-notes-item';
    item.setAttribute('data-kind', note.kind);

    const kind = doc.createElement('span');
    kind.className = 'prjs-notes-kind';
    kind.textContent = KIND_LABEL[note.kind];
    item.appendChild(kind);

    const said = doc.createElement('span');
    said.className = 'prjs-notes-text';
    // a redaction has no text by definition, and printing its content on the
    // last page would undo the entire point of redacting it
    said.textContent =
      note.kind === 'redaction' ? 'content removed from the print copy' : note.text || '(no text)';
    item.appendChild(said);

    const where = doc.createElement('span');
    where.className = 'prjs-notes-where';
    where.textContent = note.where;
    item.appendChild(where);

    list.appendChild(item);
  });

  page.appendChild(list);
  return page;
}

/** The css both sheets need. Folded into the document's base stylesheet. */
export const PAGE_CSS =
  '.prjs-cover { display: flex; align-items: center; justify-content: center;' +
  ' min-height: 88vh; text-align: center; break-after: page; page-break-after: always }' +
  '.prjs-cover-inner { max-width: 34em }' +
  '.prjs-cover-title { font-size: 30px; line-height: 1.15; margin: 0 0 12px; font-weight: 600 }' +
  '.prjs-cover-desc { font-size: 15px; line-height: 1.5; margin: 0; color: #44464d }' +
  '.prjs-cover-meta { font-size: 12px; margin: 22px 0 0; color: #6b6d75 }' +
  '.prjs-notes-page { break-before: page; page-break-before: always; padding-top: 4px }' +
  '.prjs-notes-head { margin-bottom: 18px }' +
  '.prjs-notes-title { font-size: 18px; margin: 0 0 4px; font-weight: 600 }' +
  '.prjs-notes-desc { font-size: 13px; margin: 0; color: #44464d }' +
  '.prjs-notes-legend { font-size: 12px; text-transform: uppercase; letter-spacing: .06em;' +
  ' color: #6b6d75; margin: 0 0 10px; font-weight: 600 }' +
  '.prjs-notes-list { margin: 0; padding-left: 1.6em }' +
  '.prjs-notes-item { margin-bottom: 10px; break-inside: avoid; page-break-inside: avoid;' +
  ' font-size: 13px; line-height: 1.45 }' +
  '.prjs-notes-kind { display: inline-block; min-width: 5.5em; font-weight: 600 }' +
  '.prjs-notes-item[data-kind="redaction"] .prjs-notes-kind { color: #b91c1c }' +
  '.prjs-notes-item[data-kind="drawing"] .prjs-notes-kind { color: #1d4ed8 }' +
  '.prjs-notes-where { display: block; margin-left: 5.5em; color: #6b6d75; font-size: 11.5px }';
