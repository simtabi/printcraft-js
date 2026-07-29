// Print backends.
//
// A page cannot start a process or open a raw socket, so silent printing and
// choosing a device need a service the user installs. This is the seam for that:
// the browser's dialog is one implementation, and swapping in another must not
// change a single caller.
//
// The rule these mostly guard: a backend receives the transformed, redacted
// output and never the live page. A backend that could fetch the content itself
// would undo the guarantee the library exists to make.

import { test, expect } from 'vitest';
import { Printcraft, dom, env, stubPrint, BLOCK } from './harness';

interface Seen {
  html: string;
  title: string;
  pages: number | null;
  sheet: { width: number; height: number; name: string };
  id: string;
  options: Record<string, unknown> | undefined;
}

/** a backend that records what it was handed and reports success */
function recorder(capabilities?: Record<string, boolean>): {
  backend: Record<string, unknown>;
  seen: Seen[];
} {
  const seen: Seen[] = [];
  return {
    seen,
    backend: {
      name: 'recorder',
      capabilities: () =>
        Promise.resolve({
          silent: true,
          selectPrinter: true,
          copies: true,
          duplex: false,
          trays: false,
          preview: false,
          ...capabilities
        }),
      printers: () => Promise.resolve([{ id: 'zebra', name: 'Zebra ZD421', isDefault: true }]),
      print: (job: Seen, options: Record<string, unknown>) => {
        seen.push({ ...job, options });
        return Promise.resolve({
          status: 'queued',
          backend: 'recorder',
          jobId: 'job-7',
          pages: job.pages ?? undefined
        });
      }
    }
  };
}

/* the default ------------------------------------------------------------ */

test('the browser is the backend until told otherwise', () => {
  expect(Printcraft.backend.name).toBe('browser');
  expect(Printcraft.backend).toBe(Printcraft.browserBackend);
});

test('the browser backend is honest about what it cannot do', async () => {
  const caps = await Printcraft.browserBackend.capabilities();

  // every one of these needs a process on the machine
  expect(caps.silent).toBe(false);
  expect(caps.selectPrinter).toBe(false);
  expect(caps.copies).toBe(false);
  expect(caps.preview, 'the one thing it can do').toBe(true);
  expect(Printcraft.browserBackend.printers, 'it cannot enumerate devices').toBeUndefined();
});

test('asking the browser backend to print silently fails loudly', () => {
  expect(() => Printcraft.browserBackend.print({ window: {} }, { silent: true })).toThrow(
    /companion service/
  );
});

test('the browser backend refuses detached markup', () => {
  expect(() => Printcraft.browserBackend.print({ html: '<p>x</p>' })).toThrow(/mounted window/);
});

/* handing off ------------------------------------------------------------ */

test('a job hands its finished document to the backend', async () => {
  const d = dom('<div id="t"><h1>Invoice 42</h1></div>');
  const { backend, seen } = recorder();

  const record = await Printcraft.print(
    { target: '#t', documentTitle: 'Invoice 42', backend, assetTimeout: 50 },
    env(d)
  );

  expect(seen).toHaveLength(1);
  expect(seen[0].title).toBe('Invoice 42');
  expect(seen[0].html).toContain('Invoice 42');
  expect(seen[0].id, 'a string, so a protocol can carry it').toBe('' + record.id);
  expect(seen[0].sheet, 'A4 in css pixels').toMatchObject({ width: 794, height: 1123 });
});

test('the backend result reaches the job record and the bus', async () => {
  const d = dom('<div id="t">x</div>');
  const { backend } = recorder();
  const events: unknown[] = [];

  const listener = (p: { status: string; jobId: string }): void => {
    events.push([p.status, p.jobId]);
  };
  Printcraft.on('backend:done', listener);
  const record = await Printcraft.print({ target: '#t', backend, assetTimeout: 50 }, env(d));
  Printcraft.off('backend:done', listener);

  expect(record.backend).toMatchObject({ status: 'queued', backend: 'recorder', jobId: 'job-7' });
  expect(events).toEqual([['queued', 'job-7']]);
});

test('backendOptions are passed straight through', async () => {
  const d = dom('<div id="t">x</div>');
  const { backend, seen } = recorder();

  await Printcraft.print(
    {
      target: '#t',
      backend,
      backendOptions: { printer: 'zebra', copies: 3, silent: true },
      assetTimeout: 50
    },
    env(d)
  );

  expect(seen[0].options).toMatchObject({ printer: 'zebra', copies: 3, silent: true });
});

test('a cancelling backend leaves the job cancelled rather than done', async () => {
  const d = dom('<div id="t">x</div>');
  const backend = {
    name: 'cancels',
    capabilities: () => Promise.resolve({}),
    print: () => Promise.resolve({ status: 'cancelled', backend: 'cancels' })
  };

  const record = await Printcraft.print({ target: '#t', backend, assetTimeout: 50 }, env(d));
  expect(record.status).toBe('cancelled');
});

test('.via() sets the backend for one job without touching the default', async () => {
  const d = dom('<div id="t">x</div>');
  const { backend, seen } = recorder();

  await Printcraft.job('#t')
    .via(backend, { printer: 'zebra' })
    .set({ assetTimeout: 50 })
    .print(env(d));

  expect(seen).toHaveLength(1);
  expect(seen[0].options).toMatchObject({ printer: 'zebra' });
  expect(Printcraft.backend.name, 'the default is untouched').toBe('browser');
});

/* the constraint that matters -------------------------------------------- */

test('a backend receives the redacted copy, never the live page', async () => {
  const d = dom(
    '<div id="t"><p class="secret">Agent Jane Doe</p><p>Contact: a@b.com</p>' +
      '<p class="ad">buy things</p></div>'
  );
  const { backend, seen } = recorder();

  await Printcraft.print(
    {
      target: '#t',
      redactSelectorList: ['.secret'],
      excludeSelectorList: ['.ad'],
      privacy: true,
      backend,
      assetTimeout: 50
    },
    env(d)
  );

  const html = seen[0].html;
  expect(html, 'redaction ran before the handoff').not.toContain('Jane Doe');
  expect(html, 'the privacy scan too').not.toContain('a@b.com');
  expect(html, 'and exclusions').not.toContain('buy things');
  expect(html, 'what is left is the bar, not the text').toContain(BLOCK);

  // the live page is untouched, as always
  expect(d.window.document.querySelector('.secret')!.textContent).toBe('Agent Jane Doe');
});

test('a backend that throws fails the job instead of printing anyway', async () => {
  const d = dom('<div id="t">x</div>');
  const backend = {
    name: 'broken',
    capabilities: () => Promise.resolve({}),
    print: () => Promise.reject(new Error('the service is not running'))
  };

  await expect(
    Printcraft.print({ target: '#t', backend, assetTimeout: 50 }, env(d))
  ).rejects.toThrow(/not running/);

  // and nothing is left mounted on the page
  expect(d.window.document.querySelector('iframe[data-pc-frame]')).toBe(null);
});

/* the default path still works ------------------------------------------- */

test('with no backend set, the browser dialog is still what runs', async () => {
  const d = dom('<div id="t">x</div>');
  const restore = stubPrint(d);

  const record = await Printcraft.print({ target: '#t', assetTimeout: 50 }, env(d));
  restore();

  expect(record.status).toBe('done');
  expect(record.backend).toMatchObject({ status: 'printed', backend: 'browser' });
});

/* the hook that sees what leaves the browser ------------------------------ */

test('beforeBackend is the last look at what leaves the browser', async () => {
  const d = dom('<div id="r">payload</div>');
  const { backend, seen } = recorder();
  let sawBackend = '';

  await Printcraft.print(
    {
      target: '#r',
      backend,
      assetTimeout: 50,
      hooks: {
        beforeBackend(ctxIn: { job: { html: string }; backend: string }) {
          sawBackend = ctxIn.backend;
          // amending is the point: a header, a signature, a redaction check
          return { ...ctxIn.job, html: ctxIn.job.html + '<!-- reviewed -->' };
        }
      }
    },
    env(d)
  );

  expect(sawBackend).toBe('recorder');
  expect(seen[0].html, 'the amendment reached the backend').toContain('<!-- reviewed -->');
});

test('beforeBackend returning false cancels rather than sending', async () => {
  const d = dom('<div id="r">payload</div>');
  const { backend, seen } = recorder();

  const record = await Printcraft.print(
    { target: '#r', backend, assetTimeout: 50, hooks: { beforeBackend: () => false } },
    env(d)
  );

  expect(seen, 'nothing was sent').toHaveLength(0);
  expect(record.cancelled).toBe(true);
});

test('beforeBackend does not fire for the browser dialog, which has no payload', async () => {
  const d = dom('<div id="r">x</div>');
  const restore = stubPrint(d);
  let fired = false;

  await Printcraft.print(
    { target: '#r', assetTimeout: 50, hooks: { beforeBackend: () => void (fired = true) } },
    env(d)
  );
  restore();
  expect(fired).toBe(false);
});
