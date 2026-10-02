// Actions, the interface that owns them, and the two working backends.
//
// The registry is the spine: the menu, the palette, the keymap and the API are
// all views of it. Most of what could go wrong is a view falling out of step
// with the registry, so these check the registry directly and then check that a
// view reflects it.

import { test, expect, vi } from 'vitest';
import { Printcraft, dom, env, I, stubPrint } from './harness';

const ui = Printcraft.ui;

function registry(...extra: Array<Record<string, unknown>>): InstanceType<typeof I.ActionRegistry> {
  const r = new I.ActionRegistry();
  for (const action of extra) r.add(action);
  return r;
}

function ctx(d: ReturnType<typeof dom>, target?: Element | null): Record<string, unknown> {
  return {
    target: target === undefined ? d.window.document.body : target,
    env: env(d),
    base: {},
    via: 'api'
  };
}

/* the registry ------------------------------------------------------------ */

test('actions keep their registration order, and can be reordered by id', () => {
  const r = registry(
    { id: 'a', label: 'A', run: () => 'a' },
    { id: 'b', label: 'B', run: () => 'b' },
    { id: 'c', label: 'C', run: () => 'c' }
  );

  expect(r.ids()).toEqual(['a', 'b', 'c']);
  r.reorder(['c', 'a']);
  expect(r.ids(), 'anything not named keeps its place after').toEqual(['c', 'a', 'b']);
});

test('adding an existing id replaces it without moving it', () => {
  const r = registry({ id: 'a', label: 'A', run: () => 1 }, { id: 'b', label: 'B', run: () => 2 });
  r.add({ id: 'a', label: 'A again', run: () => 3 });

  expect(r.ids()).toEqual(['a', 'b']);
  expect(r.get('a').label).toBe('A again');
});

test('update merges, and an unknown id is ignored rather than fatal', () => {
  const r = registry({ id: 'a', label: 'A', icon: 'printer', run: () => 1 });
  r.update('a', { label: 'Renamed' });
  r.update('nope', { label: 'x' });

  expect(r.get('a')).toMatchObject({ label: 'Renamed', icon: 'printer' });
  expect(r.has('nope')).toBe(false);
});

test('when hides an action, or disables it and says why', () => {
  const d = dom('<p>x</p>');
  const r = registry(
    { id: 'always', label: 'Always', run: () => 1 },
    { id: 'hidden', label: 'Hidden', when: () => false, run: () => 2 },
    { id: 'off', label: 'Off', when: () => 'Pick something first', run: () => 3 }
  );

  const available = r.available(ctx(d));
  expect(available.map((a) => a.id)).toEqual(['always', 'off']);
  expect(available.find((a) => a.id === 'off')!.disabledReason).toBe('Pick something first');
});

test('a hidden or disabled action does not run, and does not throw', () => {
  const d = dom('<p>x</p>');
  const ran: string[] = [];
  const r = registry(
    { id: 'ok', label: 'Ok', run: () => ran.push('ok') },
    { id: 'hidden', label: 'H', when: () => false, run: () => ran.push('hidden') },
    { id: 'off', label: 'O', when: () => 'no', run: () => ran.push('off') }
  );

  r.run('ok', ctx(d));
  r.run('hidden', ctx(d));
  r.run('off', ctx(d));
  // a keybinding fired when its action no longer applies is ordinary, not an error
  expect(() => r.run('never-registered', ctx(d))).not.toThrow();
  expect(ran).toEqual(['ok']);
});

test('checked is evaluated per context, for a toggle', () => {
  const d = dom('<p id="p">x</p>');
  const p = d.window.document.getElementById('p')!;
  const r = registry({
    id: 't',
    label: 'Toggle',
    checked: (c: { target: Element }) => c.target.hasAttribute('data-on'),
    run: () => 1
  });

  expect(r.available(ctx(d, p))[0]!.isChecked).toBe(false);
  p.setAttribute('data-on', '');
  expect(r.available(ctx(d, p))[0]!.isChecked).toBe(true);
});

test('a clone is independent of the registry it came from', () => {
  const a = registry({ id: 'x', label: 'X', run: () => 1 });
  const b = a.clone();
  b.add({ id: 'y', label: 'Y', run: () => 2 });

  expect(a.ids()).toEqual(['x']);
  expect(b.ids()).toEqual(['x', 'y']);
});

/* keybindings ------------------------------------------------------------- */

test('a binding is parsed and formatted for the platform it is read on', () => {
  const mac = env(dom(''));
  Object.defineProperty(mac.window.navigator, 'platform', {
    value: 'MacIntel',
    configurable: true
  });
  const pc = env(dom(''));
  Object.defineProperty(pc.window.navigator, 'platform', { value: 'Win32', configurable: true });

  expect(I.parseKeys('mod+shift+p')).toEqual({ key: 'p', mod: true, shift: true, alt: false });
  expect(I.formatKeys('mod+shift+p', mac)).toEqual(['⌘', '⇧', 'P']);
  expect(I.formatKeys('mod+shift+p', pc)).toEqual(['Ctrl', 'Shift', 'P']);
  expect(I.formatKeys('escape', pc)).toEqual(['Esc']);
});

test('a keystroke inside a field is ignored, so typing never fires a command', () => {
  const d = dom('<input id="f"><p id="p">x</p>');
  const doc = d.window.document;
  const ran: string[] = [];

  const r = registry(
    { id: 'plain', label: 'P', keys: 'mod+shift+y', run: () => ran.push('plain') },
    { id: 'palette', label: 'Palette', keys: 'mod+k', run: () => ran.push('palette') }
  );
  const off = I.bindKeys(r, () => ctx(d), env(d), { allowWhileTyping: ['palette'] });

  const press = (target: Element, key: string): void => {
    target.dispatchEvent(
      new d.window.KeyboardEvent('keydown', {
        key,
        ctrlKey: true,
        shiftKey: key === 'y',
        bubbles: true,
        cancelable: true
      })
    );
  };

  press(doc.getElementById('p')!, 'y');
  press(doc.getElementById('f')!, 'y');
  // the palette is the one binding that should work from inside a text field
  press(doc.getElementById('f')!, 'k');
  off();
  press(doc.getElementById('p')!, 'y');

  expect(ran).toEqual(['plain', 'palette']);
});

/* the interface ----------------------------------------------------------- */

test('an interface owns its own actions, and two do not share', () => {
  const d = dom('<div id="a">a</div><div id="b">b</div>');

  const one = ui.create({ contextMenu: false, keyboard: false }, env(d));
  const two = ui.create({ contextMenu: false, keyboard: false }, env(d));
  one.register({ id: 'only-one', label: 'One', run: () => 1 });

  expect(one.actions.has('only-one')).toBe(true);
  expect(two.actions.has('only-one'), 'instances are independent').toBe(false);

  one.destroy();
  two.destroy();
});

test('items keeps and orders, and the palette is still added', () => {
  const d = dom('<p>x</p>');
  const iface = ui.create(
    { items: ['inspect', 'print-page'], contextMenu: false, keyboard: false },
    env(d)
  );

  expect(iface.actions.ids()).toEqual(['inspect', 'print-page', 'palette']);
  iface.destroy();
});

test('destroy removes every listener it installed', () => {
  const d = dom('<p id="p">x</p>');
  const doc = d.window.document;

  const iface = ui.create({}, env(d));
  const open = (): boolean => {
    const ev = new d.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    doc.getElementById('p')!.dispatchEvent(ev);
    return ev.defaultPrevented;
  };

  expect(open(), 'the menu is installed').toBe(true);
  doc.dispatchEvent(new d.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

  iface.destroy();
  expect(open(), 'and gone again').toBe(false);
  expect(iface.isLive).toBe(false);
  // a second destroy is a no-op rather than an error
  expect(() => iface.destroy()).not.toThrow();
});

test('scope keeps an interface to its own corner of the page', () => {
  const d = dom('<div id="inside"><p id="a">a</p></div><p id="b">b</p>');
  const doc = d.window.document;

  const iface = ui.create({ scope: '#inside', keyboard: false }, env(d));
  const rightClick = (id: string): boolean => {
    const ev = new d.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    doc.getElementById(id)!.dispatchEvent(ev);
    return ev.defaultPrevented;
  };

  expect(rightClick('a'), 'inside the scope').toBe(true);
  doc.dispatchEvent(new d.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(rightClick('b'), 'outside it, the page keeps its own menu').toBe(false);

  iface.destroy();
});

/* the printed heading ----------------------------------------------------- */

test('a title and description are printed as a heading, not just used as a filename', async () => {
  const d = dom('<div id="r"><p>body copy</p></div>');
  let printed = '';

  await Printcraft.print(
    {
      target: '#r',
      documentTitle: 'Quarterly report',
      documentDescription: 'Prepared for the board, 29 July',
      assetTimeout: 50,
      hooks: {
        beforePrint(ctxIn: { document: Document }) {
          printed = ctxIn.document.body.innerHTML;
          return false;
        }
      }
    },
    env(d)
  );

  expect(printed).toContain('prjs-heading');
  expect(printed).toContain('Quarterly report');
  expect(printed).toContain('Prepared for the board');
  expect(printed.indexOf('Quarterly report'), 'above the content').toBeLessThan(
    printed.indexOf('body copy')
  );
});

test('no title and no description prints no heading at all', async () => {
  const d = dom('<div id="r"><p>body copy</p></div>');
  let printed = '';

  await Printcraft.print(
    {
      target: '#r',
      assetTimeout: 50,
      hooks: {
        beforePrint(ctxIn: { document: Document }) {
          printed = ctxIn.document.body.innerHTML;
          return false;
        }
      }
    },
    env(d)
  );
  expect(printed).not.toContain('prjs-heading');
});

test('printHeading: false leaves the title for the filename alone', async () => {
  const d = dom('<div id="r">x</div>');
  let printed = '';
  let title = '';

  await Printcraft.print(
    {
      target: '#r',
      documentTitle: 'Invoice 4417',
      printHeading: false,
      assetTimeout: 50,
      hooks: {
        beforePrint(ctxIn: { document: Document }) {
          printed = ctxIn.document.body.innerHTML;
          title = ctxIn.document.title;
          return false;
        }
      }
    },
    env(d)
  );

  expect(printed).not.toContain('prjs-heading');
  expect(title, 'the browser still names the pdf after it').toBe('Invoice 4417');
});

/* annotations ------------------------------------------------------------- */

test('every note and redaction on the page can be listed', () => {
  const d = dom(
    '<p id="a" data-printcraft-note="check with legal">clause 7</p>' +
      '<p id="b" data-printcraft-redact>secret</p>' +
      '<p id="c">ordinary</p>'
  );
  const doc = d.window.document;

  const marks = ui.annotations(doc);
  expect(marks).toHaveLength(2);
  expect(marks.find((m) => m.kind === 'note')).toMatchObject({ text: 'check with legal' });
  expect(marks.find((m) => m.kind === 'redaction')!.where, 'says where it is').toContain('#b');

  expect(ui.clearAnnotations(doc)).toBe(2);
  expect(ui.annotations(doc)).toHaveLength(0);
  expect(doc.getElementById('c')!.textContent, 'the page is otherwise untouched').toBe('ordinary');
});

/* the http backend -------------------------------------------------------- */

const JOB = {
  id: '1',
  title: 'Invoice',
  html: '<html><body>invoice</body></html>',
  sheet: { width: 794, height: 1123, name: 'A4' },
  pages: 2
};

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body)
  } as unknown as Response;
}

test('the http backend posts the rendered document, not a selector', async () => {
  const fetchMock = vi.fn().mockResolvedValue(response({ jobId: 'srv-9', status: 'queued' }));
  const backend = Printcraft.httpBackend({ url: '/api/print', fetch: fetchMock });

  const result = await backend.print(JOB, { printer: 'zebra', copies: 3 });

  expect(result).toMatchObject({ status: 'queued', backend: 'http', jobId: 'srv-9' });
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe('/api/print');

  const body = JSON.parse(init.body);
  expect(body.html, 'the assembled document travels').toContain('invoice');
  expect(body.sheet).toMatchObject({ name: 'A4' });
  expect(body.options).toMatchObject({ printer: 'zebra', copies: 3 });
});

test('headers can be a function, so a token is fresh per request', async () => {
  const fetchMock = vi.fn().mockResolvedValue(response({}));
  let calls = 0;
  const backend = Printcraft.httpBackend({
    url: '/api/print',
    fetch: fetchMock,
    headers: () => ({ authorization: 'Bearer ' + ++calls })
  });

  await backend.print(JOB);
  await backend.print(JOB);

  expect(fetchMock.mock.calls[0][1].headers.authorization).toBe('Bearer 1');
  expect(fetchMock.mock.calls[1][1].headers.authorization).toBe('Bearer 2');
});

test('a 5xx is retried and a 4xx is not', async () => {
  const flaky = vi
    .fn()
    .mockResolvedValueOnce(response(null, 503))
    .mockResolvedValueOnce(response({ jobId: 'ok' }));
  const backend = Printcraft.httpBackend({ url: '/api/print', fetch: flaky, retry: 2 });
  await expect(backend.print(JOB)).resolves.toMatchObject({ jobId: 'ok' });
  expect(flaky).toHaveBeenCalledTimes(2);

  // a refusal is an answer, and repeating it will not change it
  const refuse = vi.fn().mockResolvedValue(response(null, 422));
  const strict = Printcraft.httpBackend({ url: '/api/print', fetch: refuse, retry: 3 });
  await expect(strict.print(JOB)).rejects.toThrow(/refused the job with 422/);
  expect(refuse).toHaveBeenCalledTimes(1);
});

test('an unreachable service fails with the url and a code', async () => {
  const backend = Printcraft.httpBackend({
    url: 'https://printer.invalid/print',
    retry: 0,
    fetch: vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
  });

  let error: { code?: string; context?: { url?: string } } | null = null;
  try {
    await backend.print(JOB);
  } catch (e) {
    error = e as typeof error;
  }
  expect(error?.code).toBe('PC_BACKEND_UNSUPPORTED');
  expect(error?.context?.url).toBe('https://printer.invalid/print');
});

test('serialize reshapes the body for an endpoint with its own schema', async () => {
  const fetchMock = vi.fn().mockResolvedValue(response({}));
  const backend = Printcraft.httpBackend({
    url: '/api/print',
    fetch: fetchMock,
    serialize: (job: typeof JOB) => ({ document: job.html, name: job.title })
  });

  await backend.print(JOB);
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
    document: JOB.html,
    name: 'Invoice'
  });
});

test('printers is absent unless an endpoint was given for it', async () => {
  expect(Printcraft.httpBackend({ url: '/p' }).printers).toBeUndefined();
  expect(Printcraft.httpBackend({ url: '/p', printersUrl: '/d' }).printers).toBeTypeOf('function');
});

/* the socket backend ------------------------------------------------------ */

/** A service on the other end of the socket, for tests. */
function fakeService(handle: (frame: Record<string, unknown>) => unknown) {
  const listeners: Record<string, Array<(ev: { data?: unknown }) => void>> = {};
  const socket = {
    readyState: 1,
    send(data: string) {
      const frame = JSON.parse(data);
      const reply = handle(frame);
      if (reply === undefined) return;
      queueMicrotask(() =>
        listeners['message']?.forEach((fn) =>
          fn({ data: JSON.stringify({ id: frame.id, ...(reply as object) }) })
        )
      );
    },
    close() {
      listeners['close']?.forEach((fn) => fn({}));
    },
    addEventListener(type: string, fn: (ev: { data?: unknown }) => void) {
      (listeners[type] ||= []).push(fn);
      if (type === 'open') queueMicrotask(() => fn({}));
    }
  };
  return { socket, listeners };
}

test('the socket backend greets once, then reuses the connection', async () => {
  const seen: string[] = [];
  const { socket } = fakeService((frame) => {
    seen.push(String(frame['type']));
    if (frame['type'] === 'hello') return { type: 'welcome' };
    if (frame['type'] === 'printers')
      return { type: 'printers', printers: [{ id: 'z', name: 'Zebra' }] };
    return { type: 'ok' };
  });

  const backend = Printcraft.socketBackend({ url: 'wss://127.0.0.1:8443', socket: () => socket });

  expect(await backend.printers()).toEqual([{ id: 'z', name: 'Zebra' }]);
  await backend.printers();

  // one handshake, not one per call: a service re-verifying an origin every
  // print is a service that prompts every print
  expect(seen.filter((t) => t === 'hello')).toHaveLength(1);
  backend.close();
});

test('a print frame carries the rendered document and the destination', async () => {
  let printFrame: Record<string, unknown> | null = null;
  const { socket } = fakeService((frame) => {
    if (frame['type'] === 'hello') return { type: 'welcome' };
    if (frame['type'] === 'print') {
      printFrame = frame;
      return { type: 'printed', status: 'printed', jobId: 'svc-3' };
    }
    return { type: 'ok' };
  });

  const backend = Printcraft.socketBackend({
    url: 'wss://127.0.0.1:8443',
    printer: 'default-printer',
    socket: () => socket
  });

  const result = await backend.print(JOB, { copies: 2 });
  expect(result).toMatchObject({ status: 'printed', backend: 'socket', jobId: 'svc-3' });

  const sent = printFrame as unknown as { job: { html: string }; options: Record<string, unknown> };
  expect(sent.job.html).toContain('invoice');
  expect(sent.options).toMatchObject({ printer: 'default-printer', copies: 2, silent: true });
  backend.close();
});

test('a service that says no fails with its own message', async () => {
  const { socket } = fakeService((frame) => {
    if (frame['type'] === 'hello') return { type: 'welcome' };
    return { type: 'error', message: 'this origin is not on the allowlist' };
  });

  const backend = Printcraft.socketBackend({ url: 'wss://127.0.0.1:8443', socket: () => socket });
  await expect(backend.print(JOB)).rejects.toThrow(/not on the allowlist/);
  backend.close();
});

test('nothing listening fails with the url and what to do', async () => {
  const backend = Printcraft.socketBackend({
    url: 'wss://127.0.0.1:9999',
    timeout: 30,
    socket: () => {
      throw new Error('connection refused');
    }
  });

  let error: { code?: string; message?: string } | null = null;
  try {
    await backend.capabilities();
  } catch (e) {
    error = e as typeof error;
  }
  expect(error?.code).toBe('PC_BACKEND_UNSUPPORTED');
  expect(error?.message).toContain('wss://127.0.0.1:9999');
  expect(error?.message, 'and says it has to be installed').toMatch(/installed and running/);
});

test('sign is applied to every frame, for an unattended service', async () => {
  const signed: unknown[] = [];
  const { socket } = fakeService((frame) => {
    signed.push(frame['signature']);
    return { type: 'welcome', capabilities: {} };
  });

  const backend = Printcraft.socketBackend({
    url: 'wss://127.0.0.1:8443',
    socket: () => socket,
    sign: (payload: string) => 'sig-' + payload.length
  });

  await backend.capabilities();
  expect(signed.every((s) => typeof s === 'string' && s.startsWith('sig-'))).toBe(true);
  backend.close();
});

/* the two hooks the new stages needed -------------------------------------- */

// The splitting half of this lives in test/e2e/pages.spec.ts: jsdom has no
// layout, so scrollHeight is zero and everything fits on one sheet.

test('afterPaginate does not fire for a job that did not paginate', async () => {
  const d = dom('<div id="r">x</div>');
  let fired = false;

  await Printcraft.print(
    {
      target: '#r',
      assetTimeout: 50,
      hooks: {
        afterPaginate() {
          fired = true;
        },
        beforePrint: () => false
      }
    },
    env(d)
  );
  expect(fired).toBe(false);
});

test('no two stock actions share an id', () => {
  // `add()` replaces by id, which is what lets a host override an entry. It also
  // means a duplicate inside our own catalogue silently deletes the first one:
  // a second action registered as `draw` removed the region tool from the menu
  // and from the palette, and nothing failed.
  const ids = Printcraft.ui.buildActions().map((a: { id: string }) => a.id);
  const seen = new Set<string>();
  const doubled = ids.filter((id: string) => (seen.has(id) ? true : (seen.add(id), false)));

  expect(doubled, 'these ids appear twice and the later one wins').toEqual([]);
});

test('no two stock actions claim the same keys', () => {
  const bound = Printcraft.ui
    .buildActions()
    .filter((a: { keys?: string }) => a.keys)
    .map((a: { keys: string }) => a.keys.toLowerCase());

  const seen = new Set<string>();
  const doubled = bound.filter((k: string) => (seen.has(k) ? true : (seen.add(k), false)));

  expect(doubled, 'one binding, two actions: only one of them can ever run').toEqual([]);
});

/* remembering marks ------------------------------------------------------- */

/** a store the test can read back, holding what a previous visit saved */
function savedStore(
  marks: unknown[]
): { name: string; data: Map<string, unknown> } & Record<string, unknown> {
  const data = new Map<string, unknown>([['page|marks', marks]]);
  return {
    name: 'test',
    data,
    get: async (k: string) => (data.has(k) ? data.get(k) : null),
    set: async (k: string, v: unknown) => void data.set(k, v),
    remove: async (k: string) => void data.delete(k),
    keys: async () => [...data.keys()],
    clear: async () => data.clear()
  };
}

const anchorFor = (selector: string, text: string, tag = 'p') => ({
  selector,
  text,
  tag,
  index: 0
});

test('putting saved marks back is not an edit, so it never overwrites the lost ones', async () => {
  // The observer that saves marks was installed before restoration finished,
  // so the attributes restoration wrote were saved as fresh edits: 250ms after
  // load the store held only the marks that resolved, and every mark reported
  // lost was deleted for good.
  const d = dom('<p id="here">Still here</p>');
  const store = savedStore([
    { kind: 'note', anchor: anchorFor('#here', 'Still here'), data: 'kept', at: 1 },
    { kind: 'redaction', anchor: anchorFor('#gone', 'A paragraph from another build'), at: 1 }
  ]);
  const iface = ui.create(
    { persist: store, scopeKey: 'page', contextMenu: false, keyboard: false },
    env(d)
  );

  const report = await iface.restored();
  expect(report.restored).toHaveLength(1);
  expect(report.lost).toHaveLength(1);
  await new Promise((r) => setTimeout(r, 350));
  expect(store.data.get('page|marks'), 'the lost mark is still stored').toHaveLength(2);

  // an edit after the restore is still saved
  d.window.document.getElementById('here')!.setAttribute('data-printcraft-redact', '');
  await new Promise((r) => setTimeout(r, 350));
  const kinds = (store.data.get('page|marks') as Array<{ kind: string }>).map((m) => m.kind);
  expect(kinds).toContain('redaction');
  iface.destroy();
});

test('a restored drawing is painted on the page, not only stored on it', async () => {
  // Restoring put the attribute back and nothing drew it: the drawing printed,
  // but after a reload it was invisible on screen. `repaintAll` existed for this
  // and had no caller.
  const d = dom('<p id="total">Total 1,240</p>');
  const drawing = JSON.stringify({
    v: 1,
    shapes: [
      {
        id: 's1',
        kind: 'ellipse',
        points: [
          { x: 0.1, y: 0.1 },
          { x: 0.9, y: 0.9 }
        ],
        color: '#dc2626',
        width: 3,
        opacity: 1
      }
    ]
  });
  const store = savedStore([
    { kind: 'drawing', anchor: anchorFor('#total', 'Total 1,240'), data: drawing, at: 1 }
  ]);
  const iface = ui.create(
    { persist: store, scopeKey: 'page', contextMenu: false, keyboard: false },
    env(d)
  );
  await iface.restored();

  const host = d.window.document.getElementById('total')!;
  expect(host.getAttribute('data-printcraft-drawing')).toBe(drawing);
  expect(host.querySelector(':scope > svg.prjs-drawing'), 'the overlay is on screen').toBeTruthy();
  iface.destroy();
});

/* remembering the rest: options, activity, progress ----------------------- */

const settle = (ms = 30): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** an interface over a test store, with no menu or keymap to get in the way */
function remembering(
  d: ReturnType<typeof dom>,
  store: unknown,
  extra: Record<string, unknown> = {}
) {
  return ui.create(
    { persist: store, scopeKey: 'page', contextMenu: false, keyboard: false, ...extra },
    env(d)
  );
}

test("a printed job's paper and margins are remembered, under the host's own base", async () => {
  const d = dom('<p id="t">x</p>');
  const store = savedStore([]);
  const restore = stubPrint(d);
  const first = remembering(d, store, { base: { proof: false, assetTimeout: 50 } });
  first.configure({ setPrintSize: 'A5', pageMargin: '12mm', target: '#t' });
  const job = await first.run('print-page');
  restore();
  expect(job.status).toBe('done');
  await settle();
  // only what is worth carrying: the target and the timeout are about one job
  expect(store.data.get('page|options')).toEqual({ setPrintSize: 'A5', pageMargin: '12mm' });
  first.destroy();

  // the next visit starts from it, and a choice the host makes in code wins
  const next = remembering(d, store, { base: { pageMargin: '20mm' } });
  await settle();
  expect(next.context().base).toMatchObject({ setPrintSize: 'A5', pageMargin: '20mm' });
  next.destroy();
});

test('actions that run are remembered, and the palette offers them first', async () => {
  const d = dom('<p>x</p>');
  const store = savedStore([]);
  const ran: string[] = [];
  const first = remembering(d, store, {
    actions: [{ id: 'stamp', label: 'Stamp it', group: 'Mark up', run: () => ran.push('stamp') }]
  });
  first.run('stamp');
  await settle();
  expect(ran).toEqual(['stamp']);
  expect(store.data.get('page|recent')).toEqual(['stamp']);
  first.destroy();

  const next = remembering(d, store, {
    actions: [{ id: 'stamp', label: 'Stamp it', group: 'Mark up', run: () => {} }]
  });
  await settle();
  // jsdom has no layout, so nothing to scroll
  d.window.HTMLElement.prototype.scrollIntoView = () => {};
  next.palette();
  const rows = [...d.window.document.querySelectorAll('[data-prjs-palette] [data-prjs-item]')];
  expect(rows[0]!.getAttribute('data-prjs-item'), 'the recent action leads').toBe('stamp');
  expect(d.window.document.querySelector('[data-prjs-palette] .prjs-group')!.textContent).toBe(
    'Recently used'
  );
  next.destroy();
});

/** drags a box on the region tool's overlay */
function drag(d: ReturnType<typeof dom>, from: [number, number], to: [number, number]): void {
  const layer = d.window.document.querySelector('[data-prjs-draw]')!;
  const at = (type: string, [x, y]: [number, number]) =>
    layer.dispatchEvent(
      new d.window.MouseEvent(type, { bubbles: true, clientX: x, clientY: y }) as unknown as Event
    );
  at('pointerdown', from);
  at('pointermove', to);
  at('pointerup', to);
}

test('an unfinished region selection survives a reload, and cancelling forgets it', async () => {
  const d = dom('<p>x</p>');
  const doc = d.window.document;
  const store = savedStore([]);
  const first = remembering(d, store);
  void first.run('draw');
  drag(d, [40, 50], [240, 170]);
  await settle();
  expect(store.data.get('page|progress')).toMatchObject({
    kind: 'region',
    box: { x: 40, y: 50, w: 200, h: 120 }
  });
  first.destroy();
  // the page went away with the tool still open
  doc.querySelector('[data-prjs-draw]')!.remove();
  for (const n of doc.querySelectorAll('[data-prjs-ui]')) n.remove();

  const next = remembering(d, store);
  const done = next.run('draw') as Promise<{ action: string }>;
  await settle();
  const region = doc.querySelector('[data-prjs-region]') as HTMLElement;
  expect(region.style.display, 'the box is back').toBe('block');
  expect([region.style.left, region.style.top, region.style.width]).toEqual([
    '40px',
    '50px',
    '200px'
  ]);

  doc.dispatchEvent(new d.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect((await done).action).toBe('cancel');
  await settle();
  expect(store.data.has('page|progress'), 'cancelling forgets it').toBe(false);
  next.destroy();
});

test('storage holding something else entirely degrades to remembering nothing', async () => {
  // a different build's format, a hand-edited store, a truncated write: none of
  // it may throw, and none of it may reach a job
  const d = dom('<p id="here">Still here</p>');
  const store = savedStore([]);
  store.data.set('page|marks', 'not a list');
  store.data.set('page|options', [1, 2, 3]);
  store.data.set('page|recent', { not: 'a list' });
  store.data.set('page|progress', { kind: 'region', box: 'nowhere' });
  const iface = remembering(d, store);
  expect(await iface.restored()).toEqual({ restored: [], lost: [] });
  await settle();
  expect(iface.context().base).toEqual({});
  expect(iface.context().recent).toEqual([]);

  const done = iface.run('draw') as Promise<{ action: string }>;
  await settle();
  expect((d.window.document.querySelector('[data-prjs-region]') as HTMLElement).style.display).toBe(
    'none'
  );
  d.window.document.dispatchEvent(
    new d.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
  );
  await done;

  // and a mark list with one bad entry keeps the good one
  store.data.set('page|marks', [
    { kind: 'note', anchor: anchorFor('#here', 'Still here'), data: 'kept', at: 1 },
    { kind: 'note' },
    null
  ]);
  const again = remembering(d, store);
  expect((await again.restored()).restored).toHaveLength(1);
  iface.destroy();
  again.destroy();
});

test('a store that is full or unreachable is reported, and printing carries on', async () => {
  const d = dom('<p id="t">x</p>');
  const refused = () => Promise.reject(Object.assign(new Error('full'), { code: 'PC_STORE_FULL' }));
  const store = {
    name: 'broken',
    get: refused,
    set: refused,
    remove: refused,
    keys: refused,
    clear: refused
  };
  const errors: string[] = [];
  const onError = (p: { what: string }) => errors.push(p.what);
  Printcraft.on('state:error', onError);
  const restore = stubPrint(d);
  try {
    const iface = remembering(d, store, { base: { proof: false, assetTimeout: 50, target: '#t' } });
    expect(await iface.restored(), 'a refused read is an empty restore').toEqual({
      restored: [],
      lost: []
    });
    const job = await iface.run('print-page');
    expect(job.status).toBe('done');
    d.window.document.getElementById('t')!.setAttribute('data-printcraft-note', 'n');
    await settle(320);
    // sorted in place: built on the line above
    // oxlint-disable-next-line no-array-sort
    expect([...new Set(errors)].sort()).toEqual(['marks', 'options', 'recent']);
    iface.destroy();
  } finally {
    restore();
    Printcraft.off('state:error', onError);
  }
});

test('persist off writes nothing anywhere', async () => {
  const d = dom('<p id="t">x</p>');
  const storage = d.window.localStorage;
  const restore = stubPrint(d);
  const iface = ui.create(
    { contextMenu: false, keyboard: false, base: { proof: false, assetTimeout: 50, target: '#t' } },
    env(d)
  );
  await iface.run('print-page');
  void iface.run('draw');
  drag(d, [10, 10], [200, 120]);
  d.window.document.getElementById('t')!.setAttribute('data-printcraft-redact', '');
  await settle(320);
  restore();
  d.window.document.dispatchEvent(
    new d.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
  );
  expect(storage.length, 'nothing in localStorage').toBe(0);
  expect(await iface.memory.export()).toEqual({
    scope: expect.any(String),
    marks: null,
    options: null,
    recent: null,
    progress: null
  });
  iface.destroy();
});

test('configure() reaches the right-click menu, not only the palette and keys', async () => {
  // The menu captured `base` when it was installed, and configure() replaces
  // the object, so every job started from a right-click ignored it.
  const d = dom('<p id="t">x</p>');
  const doc = d.window.document;
  let seen: Record<string, unknown> | null = null;
  const iface = ui.create(
    {
      keyboard: false,
      actions: [
        {
          id: 'peek',
          label: 'Peek',
          run: (c: { base: Record<string, unknown> }) => (seen = c.base)
        }
      ]
    },
    env(d)
  );
  iface.configure({ documentTitle: 'Configured later' });
  doc.getElementById('t')!.dispatchEvent(
    new d.window.MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 5,
      clientY: 5
    })
  );
  (doc.querySelector('[data-prjs-menu] [data-prjs-item="peek"]') as HTMLElement).click();
  await settle();
  expect(seen).toMatchObject({ documentTitle: 'Configured later' });
  iface.destroy();
});
