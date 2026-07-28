// the 1.1 feature set: sanitizer, redaction, privacy auto-redaction, printer
// marks, annotations, clip-rect printing, the fluent builder, and the ui layer.

import { test } from 'vitest';
import { Printcraft, I, BLOCK, dom, env } from './harness';
import {
  expect_eq,
  expect_deep,
  expect_match,
  expect_ok,
  expect_throws,
  expect_no_throw
} from './assertions';

/* sanitizer */

test('sanitizer strips scripts, inline handlers, and javascript: urls', () => {
  const d = dom(`<div id="r">
    <script>alert(1)</script>
    <p onclick="steal()" onmouseover="x()">text</p>
    <a href="javascript:alert(2)">bad link</a>
    <a href="/fine">good link</a>
    <img src="ok.png" onerror="pwn()">
    <object data="x"></object><embed src="y">
  </div>`);
  const clone = d.window.document.getElementById('r').cloneNode(true);
  I.sanitizeClone(clone);
  expect_eq(clone.querySelectorAll('script, object, embed').length, 0);
  expect_eq(clone.querySelector('p').hasAttribute('onclick'), false);
  expect_eq(clone.querySelector('p').hasAttribute('onmouseover'), false);
  expect_eq(clone.querySelector('img').hasAttribute('onerror'), false);
  expect_eq(clone.querySelectorAll('a')[0].getAttribute('href'), '#');
  expect_eq(clone.querySelectorAll('a')[1].getAttribute('href'), '/fine');
});

/* redaction */

test('redactElement destroys text, media, and identifying attributes', () => {
  const d = dom(`<div id="r" title="secret title">
    <p>Agent <b>Smith</b>, badge 42</p>
    <img src="face.jpg" alt="the agent" width="120" height="80">
    <a href="https://secret.example/dossier">dossier</a>
  </div>`);
  const clone = d.window.document.getElementById('r').cloneNode(true);
  I.redactElement(clone, BLOCK);
  const text = clone.textContent;
  expect_eq(/[A-Za-z0-9]/.test(text), false, 'no readable characters remain');
  expect_ok(text.indexOf(BLOCK) !== -1);
  expect_eq(clone.querySelectorAll('img').length, 0, 'image replaced');
  const media = clone.querySelector('.pc-redacted-media');
  expect_match(media.getAttribute('style'), /width:120px/);
  expect_eq(clone.getAttribute('title'), null, 'root attrs scrubbed');
  expect_eq(clone.querySelector('a').getAttribute('href'), null, 'href scrubbed');
  expect_ok(clone.classList.contains('pc-redacted'));
});

test('applyRedaction covers selectors and the data attribute', () => {
  const d = dom(`<div id="r">
    <p class="ssn">123-45-6789</p>
    <p data-printcraft-redact>classified paragraph</p>
    <p>public paragraph</p>
  </div>`);
  const clone = d.window.document.getElementById('r').cloneNode(true);
  I.applyRedaction(clone, ['.ssn'], BLOCK, 'printcraft');
  const ps = clone.querySelectorAll('p');
  expect_eq(/\d/.test(ps[0].textContent), false);
  expect_eq(/[a-z]/.test(ps[1].textContent), false);
  expect_eq(ps[2].textContent, 'public paragraph');
});

test('redaction css paints bars black', () => {
  const css = I.buildPageCss(I.normalizeOptions({ target: '#x' }));
  expect_match(css, /\.pc-redacted, \.pc-redacted \* \{ background: #000 !important/);
});

/* privacy auto-redaction */

test('privacy=true blanks emails, phones, ssn, and card numbers', () => {
  const d = dom(`<div id="r">
    Contact jane.doe@example.com or +1 (415) 555-0142.
    SSN 123-45-6789. Card 4111 1111 1111 1111. Order #A17 stays.
  </div>`);
  const clone = d.window.document.getElementById('r').cloneNode(true);
  const hits = I.applyPrivacy(clone, true, BLOCK);
  const text = clone.textContent;
  expect_ok(hits >= 4, 'at least four matches, got ' + hits);
  expect_eq(text.indexOf('jane.doe@example.com'), -1);
  expect_eq(text.indexOf('123-45-6789'), -1);
  expect_eq(text.indexOf('4111 1111 1111 1111'), -1);
  expect_eq(text.indexOf('555-0142'), -1);
  expect_ok(text.indexOf('Order #A17 stays') !== -1, 'unrelated text untouched');
});

test('privacy custom patterns and selective flags', () => {
  const d = dom('<div id="r">token ABC-999 and mail x@y.zz</div>');
  const clone = d.window.document.getElementById('r').cloneNode(true);
  I.applyPrivacy(clone, { emails: false, custom: [/ABC-\d+/g] }, BLOCK);
  expect_eq(clone.textContent.indexOf('ABC-999'), -1);
  expect_ok(clone.textContent.indexOf('x@y.zz') !== -1, 'emails flag off leaves email');
});

/* printer marks */

test('printerMarks: true normalizes to crop + 3mm bleed, css and markup emitted', () => {
  const o = I.normalizeOptions({ target: '#x', printerMarks: true });
  expect_eq(o.printerMarks.crop, true);
  expect_eq(o.printerMarks.bleed, '3mm');
  const css = I.buildPageCss(o);
  expect_match(css, /body \{ padding: 3mm/);
  expect_match(css, /\.pc-mark-tl/);

  const src = dom('<div id="r">x</div>');
  const out = dom('');
  const clone = src.window.document.getElementById('r').cloneNode(true);
  I.assemblePrintDocument(out.window.document, [clone], o, src.window.document);
  expect_eq(out.window.document.querySelectorAll('.pc-mark').length, 4);
});

test('printerMarks custom bleed and color pass through', () => {
  const o = I.normalizeOptions({ target: '#x', printerMarks: { bleed: '5mm', markColor: '#f0f' } });
  const css = I.marksCss(o.printerMarks);
  expect_match(css, /padding: 5mm/);
  expect_match(css, /#f0f/);
});

/* annotations */

test('annotations render note chips from options and data attributes', () => {
  const d = dom(`<div id="r">
    <p id="total">$1,204</p>
    <p data-printcraft-note="check with legal">clause 7</p>
  </div>`);
  const doc = d.window.document;
  const clone = doc.getElementById('r').cloneNode(true);
  const o = I.normalizeOptions({
    target: '#r',
    annotations: [{ selector: '#total', text: 'verify with finance' }]
  });
  I.applyAnnotations(clone, o, doc);
  const notes = clone.querySelectorAll('.pc-note');
  expect_eq(notes.length, 2);
  expect_eq(notes[0].textContent, 'verify with finance');
  expect_eq(notes[1].textContent, 'check with legal');
  expect_match(I.buildPageCss(o), /\.pc-note \{ display: inline-block/);
});

/* clip rect */

test('clipRect validates and builds a clipped whole-body clone', () => {
  expect_throws(() => I.normalizeOptions({ clipRect: { x: 1, y: 2 } }), /numeric/);
  expect_throws(
    () => I.normalizeOptions({ clipRect: { x: 0, y: 0, width: 1, height: 1 } }),
    /too small/
  );
  const o = I.normalizeOptions({ clipRect: { x: 40, y: 100, width: 300, height: 200 } });
  expect_eq(o.keepSourceCSS, true, 'clip jobs keep page css by default');

  const d = dom(`<div id="a">alpha</div><div data-pc-ui>toolbar</div><script>x()</script>
    <input id="f" type="text">`);
  d.window.document.getElementById('f').value = 'typed';
  const clip = I.buildClipClone(d.window.document, o.clipRect, o);
  expect_eq(clip.className, 'pc-clip-viewport');
  expect_match(clip.getAttribute('style'), /width:300px;height:200px/);
  const inner = clip.querySelector('.pc-clip-inner');
  expect_match(inner.getAttribute('style'), /left:-40px;top:-100px/);
  expect_ok(inner.querySelector('#a'), 'page content present');
  expect_eq(inner.querySelectorAll('[data-pc-ui], script').length, 0, 'ui and scripts stripped');
  expect_eq(inner.querySelector('#f').getAttribute('value'), 'typed', 'form state preserved');
});

test('a clipRect job runs end-to-end and cancels cleanly via hook', async () => {
  const d = dom('<h1>title</h1><p>body copy</p>');
  let sawViewport = false;
  const job = await Printcraft.print(
    {
      clipRect: { x: 0, y: 0, width: 200, height: 120 },
      assetTimeout: 100,
      hooks: {
        beforePrint(ctx) {
          sawViewport = !!ctx.document.querySelector('.pc-clip-viewport');
          return false; // cancel, no dialog under jsdom
        }
      }
    },
    env(d)
  );
  expect_eq(job.status, 'cancelled');
  expect_eq(sawViewport, true);
  expect_eq(job.name, 'clip region');
});

/* fluent api */

test('fluent builder chains into a complete options object', () => {
  const b = Printcraft.job('#invoice')
    .name('monthly invoice')
    .title('Invoice #42')
    .pageSize('A4 portrait')
    .margins('18mm')
    .exclude('.ads', 'nav')
    .redact('.ssn')
    .privacy({ emails: true })
    .watermark('DRAFT', 0.1)
    .header('ACME')
    .footer('page bottom')
    .marks({ bleed: '4mm' })
    .annotate('#total', 'verify')
    .avoidBreak('tr')
    .breakBefore('h2')
    .links('external', '{url}')
    .keepCss()
    .revealHidden()
    .expandScroll('table', 500)
    .style('h1{color:red}')
    .transform('h3', (el) => el)
    .set({ extraDelay: 5 })
    .debug(false);
  const o = b.toOptions();
  expect_eq(o.target, '#invoice');
  expect_eq(o.jobName, 'monthly invoice');
  expect_eq(o.documentTitle, 'Invoice #42');
  expect_eq(o.setPrintSize, 'A4 portrait');
  expect_deep(o.excludeSelectorList, ['.ads', 'nav']);
  expect_deep(o.redactSelectorList, ['.ssn']);
  expect_deep(o.privacy, { emails: true });
  expect_eq(o.watermarkText, 'DRAFT');
  expect_eq(o.watermarkOpacity, 0.1);
  expect_eq(o.printerMarks.bleed, '4mm');
  expect_deep(o.annotations, [{ selector: '#total', text: 'verify' }]);
  expect_deep(o.avoidBreakSelectors, ['tr']);
  expect_eq(o.exposeLinkUrls, 'external');
  expect_eq(o.keepSourceCSS, true);
  expect_eq(o.extendScrollableAreas, 'table');
  expect_eq(o.scrollableAreasMaxHeight, 500);
  expect_eq(o.injectCustomStyle, 'h1{color:red}');
  expect_eq(o.transforms.length, 1);
  expect_eq(o.extraDelay, 5);
  expect_eq(o.debug, false);
});

test('fluent print() runs the pipeline with instance listeners', async () => {
  const d = dom('<div id="r"><span class="pii">a@b.co</span></div>');
  const events = [];
  const job = await Printcraft.job('#r')
    .privacy(true)
    .on('job:start', () => events.push('start'))
    .hook('beforePrint', () => false)
    .print(env(d));
  expect_eq(job.status, 'cancelled');
  expect_deep(events, ['start']);
  expect_ok(job.redactions >= 1, 'privacy scan counted a redaction');
});

test('builder validation still fires at terminal time, not construction', () => {
  const b = Printcraft.job(); // no target yet: fine
  expect_throws(() => b.toOptions(), /required/);
  b.target('#x');
  expect_no_throw(() => b.toOptions());
});

/* ui layer */

test('computeRect maps client points + scroll into a page rect', () => {
  const r = I.computeRect(300, 200, 100, 500, 10, 40);
  expect_deep(r, { x: 110, y: 240, width: 200, height: 300 });
});

test('toggleRedact and annotate write the data attributes the pipeline reads', () => {
  const d = dom('<p id="p">text</p>');
  const p = d.window.document.getElementById('p');
  expect_eq(Printcraft.ui.toggleRedact(p), true);
  expect_ok(p.hasAttribute('data-printcraft-redact'));
  expect_eq(Printcraft.ui.toggleRedact(p), false);
  expect_eq(p.hasAttribute('data-printcraft-redact'), false);
  expect_eq(Printcraft.ui.annotate(p, 'check me'), 'check me');
  expect_eq(p.getAttribute('data-printcraft-note'), 'check me');
  expect_eq(Printcraft.ui.annotate(p, ''), '');
  expect_eq(p.hasAttribute('data-printcraft-note'), false);
});

test('context menu opens on right-click with all items and tabler icons', () => {
  const d = dom('<main><p id="p">content</p></main>');
  const disable = Printcraft.ui.contextMenu({}, env(d));
  try {
    const p = d.window.document.getElementById('p');
    const ev = new d.window.MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 50,
      clientY: 60
    });
    p.dispatchEvent(ev);
    expect_eq(ev.defaultPrevented, true, 'native menu suppressed');
    const menu = d.window.document.querySelector('[data-pc-menu]');
    expect_ok(menu, 'menu rendered');
    const items = menu.querySelectorAll('[data-pc-item]');
    expect_eq(items.length, 7);
    expect_ok(menu.querySelectorAll('svg').length >= 7, 'icons present');
    // escape closes
    d.window.document.dispatchEvent(
      new d.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );
    expect_eq(d.window.document.querySelector('[data-pc-menu]'), null);
  } finally {
    disable();
  }
  // after disable, right-click no longer intercepted
  const ev2 = new d.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true });
  d.window.document.getElementById('p').dispatchEvent(ev2);
  expect_eq(ev2.defaultPrevented, false);
});

test('context menu redact item toggles the attribute on the clicked element', () => {
  const d = dom('<p id="p">secret</p>');
  const disable = Printcraft.ui.contextMenu({ items: ['redact'] }, env(d));
  try {
    const p = d.window.document.getElementById('p');
    p.dispatchEvent(
      new d.window.MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 5,
        clientY: 5
      })
    );
    const item = d.window.document.querySelector('[data-pc-item="redact"]');
    expect_ok(item, 'filtered menu shows only requested item');
    expect_eq(d.window.document.querySelectorAll('[data-pc-item]').length, 1);
    item.dispatchEvent(new d.window.MouseEvent('click', { bubbles: true }));
    expect_ok(p.hasAttribute('data-printcraft-redact'));
  } finally {
    disable();
  }
});

test('picker selects elements and redact action stamps them', async () => {
  const d = dom('<section id="a"><p>one</p></section><section id="b"><p>two</p></section>');
  const doc = d.window.document;
  const done = Printcraft.ui.pickSections({}, env(d));
  // toolbar present
  expect_ok(doc.querySelector('[data-pc-act="print"]'));
  // click both sections
  doc
    .querySelector('#a p')
    .dispatchEvent(new d.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  doc
    .querySelector('#b p')
    .dispatchEvent(new d.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  doc
    .querySelector('[data-pc-act="redact"]')
    .dispatchEvent(new d.window.MouseEvent('click', { bubbles: true }));
  const result = await done;
  expect_eq(result.action, 'redact');
  expect_eq(result.elements.length, 2);
  expect_ok(doc.querySelector('#a p').hasAttribute('data-printcraft-redact'));
  // toolbar cleaned up
  expect_eq(doc.querySelector('[data-pc-act="print"]'), null);
});

test('draw overlay cancels on escape and cleans up', async () => {
  const d = dom('<div>page</div>');
  const doc = d.window.document;
  const done = Printcraft.ui.drawArea({}, env(d));
  expect_ok(doc.querySelector('[data-pc-draw]'), 'overlay mounted');
  doc.dispatchEvent(new d.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  const result = await done;
  expect_eq(result.action, 'cancel');
  expect_eq(doc.querySelector('[data-pc-draw]'), null, 'overlay removed');
});

/* pipeline integration of security defaults */

test('sanitize runs by default inside a job; opt-out keeps handlers', async () => {
  const d = dom('<div id="r"><p onclick="x()">t</p></div>');
  let sanitized = null,
    kept = null;
  await Printcraft.print(
    {
      target: '#r',
      assetTimeout: 50,
      hooks: {
        beforePrint(ctx) {
          sanitized = ctx.document.querySelector('p').hasAttribute('onclick');
          return false;
        }
      }
    },
    env(d)
  );
  await Printcraft.print(
    {
      target: '#r',
      sanitize: false,
      assetTimeout: 50,
      hooks: {
        beforePrint(ctx) {
          kept = ctx.document.querySelector('p').hasAttribute('onclick');
          return false;
        }
      }
    },
    env(d)
  );
  expect_eq(sanitized, false);
  expect_eq(kept, true);
});
