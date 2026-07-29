// one test per bug fixed in 1.2.0. each names the failure it locks down, so a
// regression reads as a sentence rather than as a mystery.

import { test, expect } from 'vitest';
import { Printcraft, I, BLOCK, dom, env, stubPrint } from './harness';

/* 1 — a clone root that is itself replaced ----------------------------- */

test('printing an <img> directly with removeImages does not crash on the detached root', () => {
  const d = dom('<img id="solo" src="a.png" alt="photo">');
  const doc = d.window.document;
  const clone = doc.getElementById('solo')!.cloneNode(true) as Element;
  clone.setAttribute('data-pc-id', '1');

  const out = I.applyImageHandling(
    clone,
    I.normalizeOptions({ target: '#solo', removeImages: true }),
    { 1: { imgW: 40, imgH: 30 } },
    doc
  );
  // the root itself was swapped, so the caller gets the replacement back
  expect(out.className).toBe('pc-img-placeholder');
  expect(out.getAttribute('style')).toMatch(/width:40px/);
});

test('printing a <canvas> directly swaps the detached root for the captured image', () => {
  const d = dom('<canvas id="c" width="10" height="10"></canvas>');
  const doc = d.window.document;
  const clone = doc.getElementById('c')!.cloneNode(true) as Element;
  clone.setAttribute('data-pc-id', '1');

  const meta = { 1: { canvasData: 'data:image/png;base64,AAA', canvasW: 10, canvasH: 10 } };
  const out = I.applyCanvasCapture(clone, meta, doc);
  expect(out.tagName).toBe('IMG');
  expect((out as HTMLImageElement).getAttribute('src')).toBe('data:image/png;base64,AAA');
});

/* 2 — once() listeners are removable ----------------------------------- */

test('off() removes a listener that was registered with once()', () => {
  const em = new I.Emitter();
  const seen: string[] = [];
  const handler = () => seen.push('hit');

  em.once('e', handler);
  em.off('e', handler);
  em.emit('e');
  expect(seen).toEqual([]);
  expect(em.listenerCount('e')).toBe(0);
});

/* 3 — form state when the target is the field -------------------------- */

test('printing an input directly preserves its value', () => {
  const d = dom('<input id="solo" type="text"><textarea id="ta"></textarea>');
  const doc = d.window.document;
  (doc.getElementById('solo') as HTMLInputElement).value = 'ada';
  (doc.getElementById('ta') as HTMLTextAreaElement).value = 'notes';

  const opts = I.normalizeOptions({ target: '#solo' });
  const [input] = I.cloneTargets([doc.getElementById('solo')!], opts);
  const [area] = I.cloneTargets([doc.getElementById('ta')!], opts);

  expect(input.getAttribute('value')).toBe('ada');
  expect(area.textContent).toBe('notes');
});

/* 5 — the popup path --------------------------------------------------- */

test('a blocked popup raises instead of failing silently', () => {
  const d = dom('<div id="r">x</div>');
  const win = { ...d.window, open: () => null } as unknown as Window;

  let error: { code?: string; hint?: string } | null = null;
  try {
    I.mountWindow(win, I.normalizeOptions({ target: '#r', printInIframe: false }));
  } catch (e) {
    error = e as typeof error;
  }

  // the code is the stable part; the wording is free to improve
  expect(error?.code).toBe('PC_POPUP_BLOCKED');
  expect(error?.hint, 'and it says what to do about it').toContain('printInIframe');
});

/* 6 — concurrent jobs must not share listeners ------------------------- */

test('two concurrent jobs never see each other per-job listeners', async () => {
  const d = dom('<div id="a">a</div><div id="b">b</div>');
  const unstub = stubPrint(d);
  const scope = env(d);
  let aStarts = 0;
  let bStarts = 0;

  try {
    await Promise.all([
      Printcraft.print(
        {
          target: '#a',
          assetTimeout: 50,
          afterPrintTimeout: 200,
          on: {
            'job:start': () => {
              aStarts++;
            }
          }
        },
        scope
      ),
      Printcraft.print(
        {
          target: '#b',
          assetTimeout: 50,
          afterPrintTimeout: 200,
          on: {
            'job:start': () => {
              bStarts++;
            }
          }
        },
        scope
      )
    ]);
  } finally {
    unstub();
  }

  // before the fix both handlers hung off the global bus, so each counted twice
  expect(aStarts).toBe(1);
  expect(bStarts).toBe(1);
});

/* 7 — stylesheets are assets too --------------------------------------- */

test('waitForAssets holds for an imported stylesheet, not just images', async () => {
  const d = dom('');
  const doc = d.window.document;
  const link = doc.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://example.com/late.css';
  doc.head.appendChild(link);

  let resolved = false;
  const wait = I.waitForAssets(
    doc,
    d.window,
    I.normalizeOptions({ target: 'body', assetTimeout: 3000 })
  ).then(() => {
    resolved = true;
  });

  await new Promise((r) => setTimeout(r, 20));
  expect(resolved, 'still waiting on the stylesheet').toBe(false);

  link.dispatchEvent(new d.window.Event('load'));
  await wait;
  expect(resolved).toBe(true);
});

test('waitForAssets still resolves when an asset never loads', async () => {
  const d = dom('');
  const doc = d.window.document;
  const link = doc.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://example.com/never.css';
  doc.head.appendChild(link);

  await I.waitForAssets(doc, d.window, I.normalizeOptions({ target: 'body', assetTimeout: 30 }));
});

/* 8 — relative urls in an about:blank document -------------------------- */

test('the print document carries a base href from the source page', () => {
  const src = dom('<div id="r"><a href="/docs">d</a></div>', 'https://example.com/deep/page');
  const out = dom('');
  const clone = src.window.document.getElementById('r')!.cloneNode(true) as Element;

  I.assemblePrintDocument(
    out.window.document,
    [clone],
    I.normalizeOptions({ target: '#r' }),
    src.window.document
  );
  const base = out.window.document.querySelector('base');
  expect(base, 'a <base> is present').toBeTruthy();
  expect(base!.getAttribute('href')).toBe('https://example.com/deep/page');
});

/* 9 — overlapping selectors ------------------------------------------- */

test('overlapping target selectors resolve to one element, not two', () => {
  const d = dom('<div id="a" class="both"></div><div class="both"></div>');
  const doc = d.window.document;
  expect(I.resolveTargets(['#a', '.both'], doc).length).toBe(2);
  expect(I.resolveTargets(['#a', '#a'], doc).length).toBe(1);
  expect(I.resolveTargets([doc.getElementById('a'), '#a'], doc).length).toBe(1);
});

/* 10 — measurement never leaves tags on the live page ------------------ */

test('measurement cleanup sweeps ids left behind by an earlier failed job', () => {
  const d = dom('<div id="r"><p data-pc-id="99">stale</p><img src="a.png"></div>');
  const doc = d.window.document;
  const target = doc.getElementById('r')!;

  const measured = I.measureLiveTree([target], I.normalizeOptions({ target: '#r' }), d.window);
  measured.cleanup();

  expect(doc.querySelectorAll('[data-pc-id]').length, 'live dom is left clean').toBe(0);
});

/* 11 — privacy patterns without the global flag ------------------------ */

test('a custom privacy pattern without /g still blanks every match', () => {
  const d = dom('<div id="r">CASE-1 and CASE-2 and CASE-3</div>');
  const clone = d.window.document.getElementById('r')!.cloneNode(true) as Element;

  const hits = I.applyPrivacy(clone, { emails: false, custom: [/CASE-\d/] }, BLOCK);
  expect(hits).toBe(3);
  expect(clone.textContent).not.toMatch(/CASE-\d/);
});

/* 12 — a typo in redactSelectorList must not print the secret ---------- */

test('an invalid redact selector raises instead of silently printing the content', () => {
  const d = dom('<div id="r"><p class="ssn">123-45-6789</p></div>');
  const clone = d.window.document.getElementById('r')!.cloneNode(true) as Element;
  expect(() => I.applyRedaction(clone, ['::: not a selector'], BLOCK, 'printcraft')).toThrow(
    /invalid css selector/
  );
});

/* 13 — no dangling empty rule ------------------------------------------ */

test('pageBreakBetweenTargets false emits no rule at all', () => {
  const css = I.buildPageCss(I.normalizeOptions({ target: '#x', pageBreakBetweenTargets: false }));
  expect(css).not.toMatch(/\.pc-target \+ \.pc-target/);
});

/* 14 — the delegated trigger listener ---------------------------------- */

test('declarative triggers ignore non-primary and already-handled clicks', () => {
  const d = dom('<button data-printcraft="#r">go</button><div id="r">x</div>');
  const calls: unknown[] = [];
  const origPrint = Printcraft.print;
  Printcraft.print = (o: unknown) => {
    calls.push(o);
    return Promise.resolve({});
  };

  try {
    const teardown = Printcraft.initDeclarative(env(d));
    const button = d.window.document.querySelector('button')!;

    // middle click
    button.dispatchEvent(
      new d.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 1 })
    );
    expect(calls.length, 'middle click ignored').toBe(0);

    // a click another handler already claimed
    const claimed = new d.window.MouseEvent('click', { bubbles: true, cancelable: true });
    claimed.preventDefault();
    button.dispatchEvent(claimed);
    expect(calls.length, 'handled click ignored').toBe(0);

    // a plain primary click still works
    button.dispatchEvent(new d.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(calls.length).toBe(1);
    teardown();
  } finally {
    Printcraft.print = origPrint;
  }
});

/* 15 — no leaked matchMedia subscription ------------------------------- */

test('waitForDialogClose releases its afterprint and matchMedia listeners', async () => {
  const listeners: Record<string, number> = { added: 0, removed: 0 };
  const mediaListeners: Record<string, number> = { added: 0, removed: 0 };
  let afterPrint: (() => void) | null = null;

  const fakeWin = {
    addEventListener: (name: string, fn: () => void) => {
      if (name === 'afterprint') {
        listeners['added']!++;
        afterPrint = fn;
      }
    },
    removeEventListener: (name: string) => {
      if (name === 'afterprint') listeners['removed']!++;
    },
    matchMedia: () => ({
      addEventListener: () => {
        mediaListeners['added']!++;
      },
      removeEventListener: () => {
        mediaListeners['removed']!++;
      }
    })
  } as unknown as Window;

  const closed = I.waitForDialogClose(
    fakeWin,
    I.normalizeOptions({ target: '#x', afterPrintTimeout: 5000 })
  );
  expect(listeners['added']).toBe(1);
  expect(mediaListeners['added']).toBe(1);

  (afterPrint as unknown as () => void)();
  await closed;

  expect(listeners['removed'], 'afterprint listener released').toBe(1);
  expect(mediaListeners['removed'], 'matchMedia listener released').toBe(1);
});

/* 17 — nested frames are executable content ---------------------------- */

test('the sanitizer strips nested iframes out of the print copy', () => {
  const d = dom('<div id="r"><iframe src="https://evil.example/x"></iframe><p>keep</p></div>');
  const clone = d.window.document.getElementById('r')!.cloneNode(true) as Element;

  I.sanitizeClone(clone);
  expect(clone.querySelectorAll('iframe').length).toBe(0);
  expect(clone.querySelector('p')!.textContent).toBe('keep');
});

/* 18 — ids and names leak the redacted value --------------------------- */

test('redaction scrubs id and name, which routinely encode the value itself', () => {
  const d = dom(
    '<div id="r"><p id="patient-jane-doe" class="row">Jane Doe</p>' +
      '<input name="ssn-123-45-6789" value="x"></div>'
  );
  const clone = d.window.document.getElementById('r')!.cloneNode(true) as Element;

  I.redactElement(clone, BLOCK);
  const html = (clone as HTMLElement).outerHTML;
  expect(html).not.toMatch(/jane-doe/);
  expect(html).not.toMatch(/123-45-6789/);
  // class survives: the redaction css depends on it
  expect(clone.querySelector('.row')).toBeTruthy();
});

/* 19 — selectors are interpolated into a stylesheet -------------------- */

test('a selector that would break out of its css rule is rejected', () => {
  expect(() =>
    I.normalizeOptions({ target: '#x', avoidBreakSelectors: ['tr} body{display:none} .x'] })
  ).toThrow(/illegal character/);
  expect(() =>
    I.normalizeOptions({ target: '#x', pageBreakBeforeSelectors: ['h2 /* nope */'] })
  ).toThrow(/illegal character/);
  // ordinary selectors, including combinators and attribute values, still pass
  expect(() =>
    I.normalizeOptions({
      target: '#x',
      avoidBreakSelectors: ['table > tbody tr', 'a[href*="@"]', '.a:not(.b)']
    })
  ).not.toThrow();
});
