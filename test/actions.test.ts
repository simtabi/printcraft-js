// Actions, the interface that owns them, and the two working backends.
//
// The registry is the spine: the menu, the palette, the keymap and the API are
// all views of it. Most of what could go wrong is a view falling out of step
// with the registry, so these check the registry directly and then check that a
// view reflects it.

import { test, expect, vi } from 'vitest';
import { Printcraft, dom, env, I } from './harness';

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
