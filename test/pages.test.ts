// The two sheets that are not the content: a cover at the front, the notes at
// the back.
//
// The rule worth guarding hardest is the last one here: a redaction's content
// must not reappear on the notes page. Listing what was removed, beside a
// pointer to where it was, would undo the whole point of removing it.

import { test, expect } from 'vitest';
import { Printcraft, dom, env, stubPrint } from './harness';

/** Prints a fixture and hands back the assembled document's markup. */
async function printed(html: string, options: Record<string, unknown>): Promise<string> {
  const d = dom(html);
  const restore = stubPrint(d);
  let out = '';

  await Printcraft.print(
    {
      target: '#doc',
      assetTimeout: 50,
      ...options,
      hooks: {
        beforePrint(ctx: { document: Document }) {
          out = ctx.document.body.innerHTML;
          return false;
        }
      }
    },
    env(d)
  );
  restore();
  return out;
}

const DOC = '<div id="doc"><h2>Production</h2><p id="a">Output was steady.</p></div>';

/* the cover --------------------------------------------------------------- */

test('a cover sheet carries the title and description, on its own', async () => {
  const html = await printed(DOC, {
    documentTitle: 'Quarterly production report',
    documentDescription: 'Prepared for the board.',
    coverPage: true,
    printHeading: false
  });

  expect(html).toContain('prjs-cover');
  expect(html).toContain('Quarterly production report');
  expect(html).toContain('Prepared for the board.');
});

test('a cover and a heading are different things and can both appear', async () => {
  // printHeading puts the words above the content; coverPage gives them a sheet.
  // asking for one must not silently give the other.
  const both = await printed(DOC, {
    documentTitle: 'Report',
    coverPage: true,
    printHeading: true
  });
  expect(both).toContain('prjs-cover-title');
  expect(both).toContain('prjs-heading-title');

  const coverOnly = await printed(DOC, {
    documentTitle: 'Report',
    coverPage: true,
    printHeading: false
  });
  expect(coverOnly).toContain('prjs-cover-title');
  expect(coverOnly).not.toContain('prjs-heading-title');
});

test('a cover with nothing to say is not printed', async () => {
  // otherwise it is a blank sheet somebody has to throw away
  const html = await printed(DOC, { coverPage: true, documentTitle: '', printHeading: false });
  expect(html).not.toContain('prjs-cover');
});

test('a cover can override the title without changing the filename', async () => {
  const html = await printed(DOC, {
    documentTitle: 'invoice-4417',
    coverPage: { title: 'Invoice 4417', description: 'Due 30 days from issue.', meta: 'REF/8812' },
    printHeading: false
  });

  expect(html).toContain('Invoice 4417');
  expect(html).toContain('Due 30 days from issue.');
  expect(html).toContain('REF/8812');
});

test('a cover can be built by hand', async () => {
  const html = await printed(DOC, {
    coverPage: (doc: Document) => {
      const el = doc.createElement('div');
      el.className = 'my-own-cover';
      el.textContent = 'Anything at all';
      return el;
    }
  });

  expect(html).toContain('my-own-cover');
  expect(html).toContain('Anything at all');
});

/* the notes page ---------------------------------------------------------- */

test('the notes page lists every mark, with where it was', async () => {
  const html = await printed(
    '<div id="doc">' +
      '<p id="a" data-printcraft-note="check with legal">Clause 7</p>' +
      '<p id="b">Ordinary text</p>' +
      '</div>',
    { notesPage: true, documentTitle: 'Contract' }
  );

  expect(html).toContain('prjs-notes-page');
  expect(html).toContain('check with legal');
  expect(html, 'and a pointer back at the element').toContain('#a');
  expect(html).toContain('1 mark');
});

test('a drawing and a redaction are listed too', async () => {
  const html = await printed(
    '<div id="doc">' +
      '<p id="a" data-printcraft-redact="">Agent Jane Doe</p>' +
      '<p id="b" data-printcraft-drawing=\'{"v":1,"shapes":[{"id":"s","kind":"arrow","points":[{"x":0,"y":0},{"x":1,"y":1}],"color":"#dc2626","width":3,"opacity":1}]}\'>Variance</p>' +
      '</div>',
    { notesPage: true }
  );

  expect(html).toContain('3 marks'.replace('3', '2'));
  expect(html).toContain('Redacted');
  expect(html).toContain('Drawing');
});

test('the notes page never reprints what a redaction destroyed', async () => {
  // the failure this exists to prevent: an index at the back listing the text
  // that was blacked out on page two
  const html = await printed(
    '<div id="doc"><p id="a" data-printcraft-redact="">Agent Jane Doe</p></div>',
    { notesPage: true }
  );

  expect(html).toContain('prjs-notes-page');
  expect(html, 'the whole point of redacting it').not.toContain('Jane Doe');
  expect(html).toContain('content removed from the print copy');
});

test('notesPage on an unmarked document prints no sheet', async () => {
  const html = await printed(DOC, { notesPage: true, documentTitle: 'Report' });
  expect(html, 'an empty sheet headed "Notes" helps nobody').not.toContain('prjs-notes-page');
});

test('one element carrying three marks is three lines', async () => {
  const html = await printed(
    '<div id="doc"><p id="a" data-printcraft-note="see below" data-printcraft-redact="" ' +
      'data-printcraft-drawing=\'{"v":1,"shapes":[{"id":"s","kind":"pen","points":[{"x":0,"y":0}],"color":"#000","width":3,"opacity":1}]}\'>x</p></div>',
    { notesPage: true }
  );

  expect(html).toContain('3 marks');
});

test('neither sheet costs anything when neither was asked for', async () => {
  const html = await printed(DOC, { documentTitle: 'Report' });

  expect(html).not.toContain('prjs-cover');
  expect(html).not.toContain('prjs-notes-page');
  // and the stylesheet for them is not carried either
  const d = dom(DOC);
  const restore = stubPrint(d);
  let css = '';
  await Printcraft.print(
    {
      target: '#doc',
      assetTimeout: 50,
      hooks: {
        beforePrint(ctx: { document: Document }) {
          css = ctx.document.head.innerHTML;
          return false;
        }
      }
    },
    env(d)
  );
  restore();
  expect(css, 'a receipt should not carry cover-page css').not.toContain('prjs-cover-inner');
});

/* both, paginated --------------------------------------------------------- */

test('paginated, the cover comes first and the notes last', async () => {
  const html = await printed(
    '<div id="doc"><p id="a" data-printcraft-note="a note">Body</p></div>',
    {
      documentTitle: 'Report',
      documentDescription: 'With a cover and an index.',
      coverPage: true,
      notesPage: true,
      printHeading: false,
      paginate: true
    }
  );

  const cover = html.indexOf('prjs-cover');
  const target = html.indexOf('prjs-target');
  const notes = html.indexOf('prjs-notes-page');

  expect(cover, 'the cover was not printed').toBeGreaterThan(-1);
  expect(notes, 'the notes page was not printed').toBeGreaterThan(-1);
  expect(cover, 'the cover belongs before the content').toBeLessThan(target);
  expect(notes, 'and the notes after it').toBeGreaterThan(target);
});
