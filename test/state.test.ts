// Memory: stores, anchors, sessions and where configuration came from.
//
// The rule most of these guard is the one that makes persistence safe to turn
// on: a mark whose element cannot be found again is reported, never guessed at.
// Everything else here is round-tripping.

import { test, expect } from 'vitest';
import { dom } from './harness';
import {
  Session,
  customStore,
  describe as describeEl,
  explain,
  httpStore,
  localStore,
  memoryStore,
  resolve,
  resolveConfig,
  type Store
} from '../src/state';

/* the stores -------------------------------------------------------------- */

/** Every adapter has to behave the same, so every adapter runs the same test. */
async function roundTrip(store: Store): Promise<void> {
  expect(await store.get('nothing'), 'a missing key is null, not undefined').toBeNull();

  await store.set('a', { n: 1, deep: { list: [1, 2, 3] } });
  await store.set('b', 'plain');
  expect(await store.get('a')).toEqual({ n: 1, deep: { list: [1, 2, 3] } });
  expect(await store.get('b')).toBe('plain');
  // oxlint-disable-next-line no-array-sort
  expect([...(await store.keys())].sort()).toEqual(['a', 'b']);

  await store.remove('a');
  expect(await store.get('a')).toBeNull();
  expect(await store.keys()).toEqual(['b']);

  await store.clear();
  expect(await store.keys()).toEqual([]);
}

test('the memory store round-trips', async () => {
  await roundTrip(memoryStore());
});

test('the local store round-trips, and keeps to its own prefix', async () => {
  const d = dom('');
  const win = d.window as unknown as Window;
  await roundTrip(localStore({ window: win, prefix: 'test:' }));

  // something else's key must survive our clear()
  win.localStorage.setItem('someone-elses', 'do not touch');
  const store = localStore({ window: win, prefix: 'test:' });
  await store.set('ours', 1);
  await store.clear();

  expect(win.localStorage.getItem('someone-elses'), 'clear() is ours only').toBe('do not touch');
});

test('a record past its ttl reads as absent', async () => {
  const d = dom('');
  const win = d.window as unknown as Window;

  const writer = localStore({ window: win, prefix: 'ttl:' });
  await writer.set('k', 'value');
  expect(await writer.get('k')).toBe('value');

  // the envelope carries the write time, so an expiring reader sees it as gone
  const expiring = localStore({ window: win, prefix: 'ttl:', ttl: -1 });
  expect(await expiring.get('k')).toBeNull();
  expect(await expiring.keys(), 'and it is dropped rather than left to rot').toEqual([]);
});

test('a record that will not parse is dropped rather than throwing forever', async () => {
  const d = dom('');
  const win = d.window as unknown as Window;
  win.localStorage.setItem('bad:k', 'this is not json');

  const store = localStore({ window: win, prefix: 'bad:' });
  expect(await store.get('k')).toBeNull();
  expect(win.localStorage.getItem('bad:k'), 'and it is gone').toBeNull();
});

test('a limit evicts the oldest, not the newest', async () => {
  const d = dom('');
  const store = localStore({ window: d.window as unknown as Window, prefix: 'cap:', limit: 3 });

  for (const k of ['one', 'two', 'three', 'four']) {
    // eslint-disable-next-line no-await-in-loop
    await store.set(k, k);
  }
  const left = await store.keys();

  expect(left).toHaveLength(3);
  expect(left, 'the newest write must still be there').toContain('four');
});

test('the http store speaks plain rest', async () => {
  const seen: Array<{ url: string; method: string; body?: string }> = [];
  const store = httpStore({
    url: 'https://example.test/state/',
    headers: { authorization: 'Bearer x' },
    fetch: ((url: string, init?: RequestInit) => {
      seen.push({ url, method: init?.method || 'GET', body: init?.body as string });
      if (init?.method) return Promise.resolve(new Response(null, { status: 204 }));
      if (url.endsWith('/state')) return Promise.resolve(Response.json(['marks']));
      return Promise.resolve(Response.json({ hello: true }));
    }) as unknown as typeof fetch
  });

  expect(await store.get('marks')).toEqual({ hello: true });
  await store.set('marks', [1, 2]);
  await store.remove('marks');
  expect(await store.keys()).toEqual(['marks']);

  expect(seen.map((s) => s.method)).toEqual(['GET', 'PUT', 'DELETE', 'GET']);
  expect(seen[0]!.url, 'the trailing slash is not doubled').toBe(
    'https://example.test/state/marks'
  );
  expect(seen[1]!.body).toBe('[1,2]');
});

test('a 404 is empty, and a 500 is an error with a code', async () => {
  const missing = httpStore({
    url: 'https://example.test/s',
    fetch: (() => Promise.resolve(new Response(null, { status: 404 }))) as unknown as typeof fetch
  });
  expect(await missing.get('k'), '404 means nothing is stored, not that it broke').toBeNull();

  const broken = httpStore({
    url: 'https://example.test/s',
    fetch: (() => Promise.resolve(new Response(null, { status: 500 }))) as unknown as typeof fetch
  });
  await expect(broken.get('k')).rejects.toMatchObject({ code: 'PC_STORE_FAILED' });
});

test('a write the state service cannot find is an error, not a silent no-op', async () => {
  // 404 meant "nothing stored" for every method, so a wrong url swallowed
  // every PUT and the marks were never saved anywhere.
  const missing = httpStore({
    url: 'https://example.test/wrong',
    fetch: (() => Promise.resolve(new Response(null, { status: 404 }))) as unknown as typeof fetch
  });
  await expect(missing.set('marks', [])).rejects.toMatchObject({ code: 'PC_STORE_FAILED' });
  // removing what is already gone is still fine
  await expect(missing.remove('marks')).resolves.toBeUndefined();
});

test('a record from a newer schema is left alone, not misread', async () => {
  // the envelope's version was written and never read, so a record a newer
  // build wrote in a different shape reached this one as if it were current
  const d = dom('');
  const win = d.window as unknown as Window;
  win.localStorage.setItem('v:k', JSON.stringify({ v: 99, t: Date.now(), d: { future: true } }));
  const store = localStore({ window: win, prefix: 'v:' });
  expect(await store.get('k')).toBeNull();
  expect(
    win.localStorage.getItem('v:k'),
    'and not deleted: the newer build still owns it'
  ).not.toBeNull();
});

test('a custom store needs only get and set', async () => {
  const backing = new Map<string, unknown>();
  const store = customStore({
    name: 'mine',
    get: (k) => backing.get(k),
    set: (k, v) => void backing.set(k, v)
  });

  expect(store.name).toBe('mine');
  await store.set('k', 42);
  expect(await store.get('k')).toBe(42);
  expect(await store.keys(), 'the parts it did not implement degrade quietly').toEqual([]);
});

/* anchors ----------------------------------------------------------------- */

test('an element with an id is found by it', () => {
  const d = dom('<div><p id="clause-7">The text.</p></div>');
  const doc = d.window.document;
  const el = doc.getElementById('clause-7')!;

  const anchor = describeEl(el);
  expect(anchor.selector).toBe('#clause-7');

  const found = resolve(anchor, doc);
  expect(found.element).toBe(el);
  expect(found.confidence).toBe('exact');
});

test('an element with no id is found by its path', () => {
  const d = dom('<div><p>first</p><p>second</p><p>third</p></div>');
  const doc = d.window.document;
  const second = doc.querySelectorAll('p')[1]!;

  const anchor = describeEl(second);
  expect(anchor.selector).toContain('nth-of-type(2)');
  expect(resolve(anchor, doc).element).toBe(second);
});

test('a mark whose text changed is lost, not applied to the wrong element', () => {
  // the whole reason persistence is safe to turn on. this element still matches
  // the selector, but it is not the paragraph the redaction was made against.
  const d = dom('<div><p id="p">Agent Jane Doe</p></div>');
  const anchor = describeEl(d.window.document.getElementById('p')!);

  const after = dom('<div><p id="p">Someone else entirely</p></div>');
  const found = resolve(anchor, after.window.document);

  expect(found.element, 'better to redact nothing than the wrong thing').toBeNull();
  expect(found.confidence).toBe('lost');
  expect(found.reason).toMatch(/content changed/);
});

test('an empty element that has since gained words is not the one that was marked', () => {
  // An anchor made on an element with no text was accepted on its selector
  // alone, even once that element held words — exactly the "same selector,
  // different content" case the rule above refuses.
  const d = dom('<div><p id="slot"></p></div>');
  const anchor = describeEl(d.window.document.getElementById('slot')!);
  expect(anchor.text).toBe('');

  const after = dom('<div><p id="slot">Agent Jane Doe</p></div>');
  const found = resolve(anchor, after.window.document);
  expect(found.element, 'better to redact nothing than the wrong thing').toBeNull();
  expect(found.confidence).toBe('lost');

  // unchanged, it is still found exactly
  const same = dom('<div><p id="slot"></p></div>');
  expect(resolve(anchor, same.window.document).confidence).toBe('exact');
});

test('an element that moved but kept its words is found, and marked as a guess', () => {
  const d = dom('<div><p>alpha</p><p>the one we marked</p></div>');
  const anchor = describeEl(d.window.document.querySelectorAll('p')[1]!);

  // a row was inserted above it, so nth-of-type no longer points at it
  const after = dom('<div><p>new</p><p>alpha</p><p>the one we marked</p></div>');
  const found = resolve(anchor, after.window.document);

  expect(found.element!.textContent).toBe('the one we marked');
  expect(found.confidence, 'found, but say it was not certain').toBe('likely');
});

test('text that now appears twice is refused rather than guessed between', () => {
  const d = dom('<div><p>duplicated</p></div>');
  const anchor = describeEl(d.window.document.querySelector('p')!);

  const after = dom('<div><span>x</span><p>duplicated</p><p>duplicated</p></div>');
  // remove the id-free path match by making the first p not match position
  const found = resolve({ ...anchor, selector: 'nope > nope' }, after.window.document);

  expect(found.element).toBeNull();
  expect(found.reason).toMatch(/2 elements/);
});

/* anchors with no words --------------------------------------------------- */
//
// An image, an input or an empty container has no text to fingerprint, so the
// selector alone used to decide, and an nth-of-type path points at a different
// element the moment a same-tag sibling is inserted. These carry a structural
// fingerprint instead, and the quote of the text either side of them.

const page = (html: string) => dom('<main id="doc">' + html + '</main>').window.document;

test('an image with no id is found again on the same page, exactly', () => {
  const doc = page('<p>Figure one</p><img src="/media/chart-q3.png?v=7" alt="Q3"><p>Caption</p>');
  const anchor = describeEl(doc.querySelector('img')!);
  expect(anchor.text).toBe('');
  expect(anchor.shape, 'a structural fingerprint is stored').toContain('chart-q3.png');

  const found = resolve(
    anchor,
    page('<p>Figure one</p><img src="/media/chart-q3.png?v=8" alt="Q3"><p>Caption</p>')
  );
  expect(found.confidence, 'a cache-busting query is not a different image').toBe('exact');
});

test('an unrelated image inserted beside it does not move the mark onto it', () => {
  const doc = page('<p>Intro</p><img src="logo.svg" alt="Logo"><p>Body</p>');
  const anchor = describeEl(doc.querySelector('img')!);

  const after = page(
    '<img src="banner.jpg" alt="Sale"><p>Intro</p><img src="logo.svg" alt="Logo"><p>Body</p>'
  );
  const found = resolve(anchor, after);
  expect(found.element!.getAttribute('src'), 'the logo, not the banner').toBe('logo.svg');
  expect(found.confidence).toBe('likely');
});

test('a different image at the same path is refused', () => {
  const doc = page('<p>Intro</p><img src="signature-jane.png" alt="Signed">');
  const anchor = describeEl(doc.querySelector('img')!);
  const found = resolve(anchor, page('<p>Intro</p><img src="signature-john.png" alt="Signed">'));
  expect(found.element).toBeNull();
  expect(found.confidence).toBe('lost');
});

test('an input is told apart by its name and type, not its value', () => {
  const doc = page('<label>Email <input name="email" type="email" value="a@b.co"></label>');
  const anchor = describeEl(doc.querySelector('input')!);
  expect(
    resolve(
      anchor,
      page('<label>Email <input name="email" type="email" value="other@x.io"></label>')
    ).confidence
  ).toBe('exact');
  expect(
    resolve(anchor, page('<label>Email <input name="phone" type="tel"></label>')).element
  ).toBeNull();
});

test('an empty container is told apart by what it holds', () => {
  const doc = page('<p>Chart</p><div><canvas width="400" height="200"></canvas></div>');
  const anchor = describeEl(doc.querySelector('#doc > div')!);
  expect(resolve(anchor, page('<p>Chart</p><div><img src="x.png"></div>')).element).toBeNull();
});

test('two identical images are told apart by the words around them', () => {
  const doc = page(
    '<p>Before the first</p><img src="tick.svg"><p>Between them</p><img src="tick.svg"><p>After</p>'
  );
  const second = doc.querySelectorAll('img')[1]!;
  const anchor = describeEl(second);

  // a third copy goes in at the top, so nth-of-type(2) is now the first tick
  const after = page(
    '<img src="tick.svg"><p>Before the first</p><img src="tick.svg"><p>Between them</p><img src="tick.svg"><p>After</p>'
  );
  const found = resolve(anchor, after);
  expect(found.element, 'the one between "Between them" and "After"').toBe(
    after.querySelectorAll('img')[2]
  );
});

test('an empty element with nothing to tell it apart is only trusted by id', () => {
  const doc = page('<div></div><div></div>');
  const anchor = describeEl(doc.querySelectorAll('div')[1]!);
  const found = resolve(anchor, page('<div></div><div></div>'));
  expect(found.element, 'two bare divs are indistinguishable').toBeNull();
  expect(found.reason).toMatch(/nothing/);

  const byId = page('<div id="slot"></div>');
  const idAnchor = describeEl(byId.getElementById('slot')!);
  expect(resolve(idAnchor, page('<div id="slot"></div>')).confidence).toBe('exact');
});

test("a drawing's own overlay is not part of its host's fingerprint", () => {
  // the svg is on the page while a drawing is shown and absent after a reload
  // until it is repainted; counting it would lose every drawing on an empty box
  const doc = page('<p>Sketch here</p><div data-slot="sketch"></div>');
  const host = doc.querySelector('[data-slot]')!;
  const overlay = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  overlay.setAttribute('data-prjs-ui', '');
  host.appendChild(overlay);
  const anchor = describeEl(host);
  expect(resolve(anchor, page('<p>Sketch here</p><div data-slot="sketch"></div>')).confidence).toBe(
    'exact'
  );
});

test('an anchor saved before fingerprints existed keeps the old rule', () => {
  // no `shape`: resolved on the selector alone, as 3.0 betas did
  const legacy = { selector: '#doc > img', text: '', tag: 'img', index: 0 };
  const found = resolve(legacy, page('<img src="anything.png">'));
  expect(found.confidence).toBe('exact');
});

/* the session ------------------------------------------------------------- */

test('two quick updates to the same record both land', async () => {
  // used() and rememberOptions() read, then write. Over a store that answers
  // slowly, two at once both read the old list and the second write won.
  const backing = new Map<string, unknown>();
  const slow = customStore({
    get: async (k) => {
      await new Promise((r) => setTimeout(r, 5));
      return backing.get(k) ?? null;
    },
    set: async (k, v) => {
      await new Promise((r) => setTimeout(r, 5));
      backing.set(k, v);
    }
  });
  const session = new Session({ store: slow, scope: 'p' });
  await Promise.all([session.used('a'), session.used('b')]);
  expect(await session.recent()).toEqual(['b', 'a']);
});

test('marks that were lost stay stored when the page is saved again', async () => {
  // saveMarks rewrote the record from the live page, so the first edit after a
  // restore deleted every mark that restore had reported lost
  const d = dom('<p id="here">Still here</p>');
  const doc = d.window.document;
  const store = memoryStore();
  await store.set('p|marks', [
    {
      kind: 'note',
      anchor: { selector: '#here', text: 'Still here', tag: 'p', index: 0 },
      data: 'kept',
      at: 1
    },
    {
      kind: 'redaction',
      anchor: { selector: '#gone', text: 'Another build', tag: 'p', index: 0 },
      at: 1
    }
  ]);
  const session = new Session({ store, scope: 'p' });
  expect((await session.restoreMarks(doc)).lost).toHaveLength(1);

  doc.getElementById('here')!.setAttribute('data-printcraft-redact', '');
  await session.saveMarks(doc);
  const kinds = (
    (await store.get('p|marks')) as Array<{ kind: string; anchor: { selector: string } }>
  ).map((m) => m.anchor.selector + ' ' + m.kind);
  expect(kinds).toContain('#gone redaction');

  // forgetting them is still possible
  await session.clearMarks();
  await session.saveMarks(doc);
  const after = (await store.get('p|marks')) as Array<{ anchor: { selector: string } }>;
  expect(after.some((m) => m.anchor.selector === '#gone')).toBe(false);
});

test('a restore that finishes after its page went away applies nothing', async () => {
  const d = dom('<p id="here">Still here</p>');
  const store = memoryStore();
  await store.set('p|marks', [
    {
      kind: 'note',
      anchor: { selector: '#here', text: 'Still here', tag: 'p', index: 0 },
      data: 'n',
      at: 1
    }
  ]);
  const session = new Session({ store, scope: 'p' });
  const report = await session.restoreMarks(d.window.document, () => false);
  expect(report.restored).toHaveLength(0);
  expect(d.window.document.getElementById('here')!.hasAttribute('data-printcraft-note')).toBe(
    false
  );
});

test('marks survive a reload', async () => {
  const store = memoryStore();
  const scope = 'https://app.test/invoice/1';

  const before = dom(
    '<div id="doc">' +
      '<p id="note-me" data-printcraft-note="check with legal">Clause 7</p>' +
      '<p id="hide-me" data-printcraft-redact="">Agent Jane Doe</p>' +
      '</div>'
  );
  const saved = await new Session({ store, scope }).saveMarks(before.window.document);
  expect(saved).toBe(2);

  // the same page again, with nothing marked
  const after = dom(
    '<div id="doc"><p id="note-me">Clause 7</p><p id="hide-me">Agent Jane Doe</p></div>'
  );
  const doc = after.window.document;
  const report = await new Session({ store, scope }).restoreMarks(doc);

  expect(report.restored).toHaveLength(2);
  expect(report.lost).toHaveLength(0);
  expect(doc.getElementById('note-me')!.getAttribute('data-printcraft-note')).toBe(
    'check with legal'
  );
  expect(doc.getElementById('hide-me')!.hasAttribute('data-printcraft-redact')).toBe(true);
});

test('a mark with nowhere to go is reported rather than dropped', async () => {
  const store = memoryStore();
  const scope = 'page';

  const before = dom('<p id="gone" data-printcraft-redact="">secret</p>');
  await new Session({ store, scope }).saveMarks(before.window.document);

  const after = dom('<p id="different">something else</p>');
  const report = await new Session({ store, scope }).restoreMarks(after.window.document);

  expect(report.restored).toHaveLength(0);
  expect(report.lost).toHaveLength(1);
  expect(report.lost[0]!.reason, 'and it says why').toBeTruthy();
  expect(
    after.window.document.querySelector('[data-printcraft-redact]'),
    'nothing was marked on a guess'
  ).toBeNull();
});

test('two pages in one store do not see each other', async () => {
  const store = memoryStore();

  const one = dom('<p id="a" data-printcraft-redact="">x</p>');
  await new Session({ store, scope: 'https://app.test/one' }).saveMarks(one.window.document);

  const two = dom('<p id="a">x</p>');
  const report = await new Session({ store, scope: 'https://app.test/two' }).restoreMarks(
    two.window.document
  );

  expect(report.restored, 'a different document is a different scope').toHaveLength(0);
});

test('only the options worth carrying forward are remembered', async () => {
  const session = new Session({ store: memoryStore(), scope: 'p' });

  await session.rememberOptions({
    setPrintSize: 'A4',
    pageMargin: '12mm',
    target: '#this-job-only',
    hooks: { beforePrint: () => true }
  });
  const kept = await session.options();

  expect(kept).toEqual({ setPrintSize: 'A4', pageMargin: '12mm' });
  expect(kept['target'], 'a target is about one job').toBeUndefined();
  expect(kept['hooks'], 'and a hook is a function').toBeUndefined();
});

test('recent actions are most-recent-first and never doubled', async () => {
  const session = new Session({ store: memoryStore(), scope: 'p', recentLimit: 3 });

  for (const id of ['print', 'redact', 'print', 'notes', 'screenshot']) {
    // eslint-disable-next-line no-await-in-loop
    await session.used(id);
  }

  expect(await session.recent()).toEqual(['screenshot', 'notes', 'print']);
});

test('export and import move everything at once', async () => {
  const from = new Session({ store: memoryStore(), scope: 'p' });
  const d = dom('<p id="a" data-printcraft-note="hello">x</p>');
  await from.saveMarks(d.window.document);
  await from.rememberOptions({ setPrintSize: 'letter' });

  const bundle = await from.export();
  const to = new Session({ store: memoryStore(), scope: 'elsewhere' });
  await to.import(bundle);

  expect(await to.options()).toEqual({ setPrintSize: 'letter' });
  const back = await to.restoreMarks(dom('<p id="a">x</p>').window.document);
  expect(back.restored).toHaveLength(1);
});

test('a session announces what it did', async () => {
  const heard: Array<[string, unknown]> = [];
  const session = new Session({
    store: memoryStore(),
    scope: 'p',
    bus: { emit: (n, p) => void heard.push([n, p]) }
  });

  await session.saveMarks(dom('<p data-printcraft-redact="">x</p>').window.document);
  await session.restoreMarks(dom('<p>x</p>').window.document);
  await session.forget();

  expect(heard.map(([n]) => n)).toEqual(['state:save', 'state:load', 'state:clear']);
});

/* configuration ----------------------------------------------------------- */

test('later layers win, and every value says who set it', async () => {
  const config = await resolveConfig({
    defaults: { setPrintSize: 'A4', pageMargin: '10mm' },
    backend: { pageMargin: '15mm', paginate: true },
    call: { pageMargin: '20mm' }
  });

  expect(config.values).toEqual({ setPrintSize: 'A4', pageMargin: '20mm', paginate: true });
  expect(config.from).toEqual({
    setPrintSize: 'defaults',
    pageMargin: 'call',
    paginate: 'backend'
  });
});

test('a config source can be a url, a function or a store', async () => {
  const store = memoryStore();
  await store.set('config', { fromStore: true });

  const config = await resolveConfig(
    {
      defaults: () => Promise.resolve({ fromFunction: true }),
      file: 'https://example.test/printcraft.json',
      backend: { store }
    },
    {
      fetch: (() => Promise.resolve(Response.json({ fromUrl: true }))) as unknown as typeof fetch
    }
  );

  expect(config.values).toEqual({ fromFunction: true, fromStore: true, fromUrl: true });
});

test('an unreachable layer is skipped rather than fatal', async () => {
  const failures: string[] = [];
  const config = await resolveConfig(
    { defaults: { setPrintSize: 'A4' }, backend: 'https://down.test/config.json' },
    {
      fetch: (() => Promise.reject(new Error('offline'))) as unknown as typeof fetch,
      onError: (layer) => failures.push(layer)
    }
  );

  expect(config.values, 'a config server being down must not stop a page printing').toEqual({
    setPrintSize: 'A4'
  });
  expect(failures).toEqual(['backend']);
});

test('explain names the layer for every setting', async () => {
  const config = await resolveConfig({
    defaults: { setPrintSize: 'A4' },
    call: { pageMargin: '20mm' }
  });

  expect(explain(config)).toEqual(['pageMargin = 20mm  (call)', 'setPrintSize = A4  (defaults)']);
});
