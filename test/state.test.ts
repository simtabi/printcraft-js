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

/* the session ------------------------------------------------------------- */

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
