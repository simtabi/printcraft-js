// unit tests for printcraft: option handling, target resolution, clone
// transforms, and document assembly. the OS print dialog cannot run in jsdom, so
// the lifecycle test stubs the frame's print().

import { test } from 'vitest';
import { Printcraft, I, dom } from './harness';
import {
  expect_eq,
  expect_deep,
  expect_match,
  expect_ok,
  expect_throws,
  expect_no_throw
} from './assertions';

/* option normalization */

test('requires a target or html', () => {
  expect_throws(() => I.normalizeOptions({}), /required/);
  expect_no_throw(() => I.normalizeOptions({ target: '#x' }));
  expect_no_throw(() => I.normalizeOptions({ html: '<p>hi</p>' }));
});

test('string shorthand becomes a target', () => {
  const o = I.normalizeOptions('#report');
  expect_eq(o.target, '#report');
});

test('rejects bad exposeLinkUrls values', () => {
  expect_throws(
    () => I.normalizeOptions({ target: '#x', exposeLinkUrls: 'some' }),
    /exposeLinkUrls/
  );
});

test('clamps watermark opacity to 0..1', () => {
  expect_eq(I.normalizeOptions({ target: '#x', watermarkOpacity: 3 }).watermarkOpacity, 1);
  expect_eq(I.normalizeOptions({ target: '#x', watermarkOpacity: -1 }).watermarkOpacity, 0);
  expect_eq(I.normalizeOptions({ target: '#x', watermarkOpacity: 'nope' }).watermarkOpacity, 0);
});

test('removeInlineStyles legacy alias disables keepInlineStyles', () => {
  const o = I.normalizeOptions({ target: '#x', removeInlineStyles: true });
  expect_eq(o.keepInlineStyles, false);
});

test('Printcraft.defaults are merged under per-call options', () => {
  Printcraft.defaults = { footerText: 'global footer' };
  try {
    const o = I.normalizeOptions({ target: '#x' });
    expect_eq(o.footerText, 'global footer');
    const o2 = I.normalizeOptions({ target: '#x', footerText: 'local' });
    expect_eq(o2.footerText, 'local');
  } finally {
    Printcraft.defaults = {};
  }
});

/* target resolution */

test('resolves selectors and elements, rejects forbidden tags', () => {
  const d = dom(
    '<div id="a"></div><div class="b"></div><div class="b"></div><script id="s"></script>'
  );
  const doc = d.window.document;
  expect_eq(I.resolveTargets('#a', doc).length, 1);
  expect_eq(I.resolveTargets('.b', doc).length, 2);
  expect_eq(I.resolveTargets(['#a', '.b'], doc).length, 3);
  expect_eq(I.resolveTargets(doc.getElementById('a'), doc).length, 1);
  expect_throws(() => I.resolveTargets('#missing', doc), /no elements match/);
  expect_throws(() => I.resolveTargets('#s', doc), /cannot be a print target/);
});

/* form state */

test('clone bakes in live form state', () => {
  const d = dom(`
    <form id="f">
      <input type="text" id="name">
      <input type="checkbox" id="chk">
      <textarea id="ta"></textarea>
      <select id="sel"><option value="1">1</option><option value="2">2</option></select>
      <input type="password" id="pw">
    </form>`);
  const doc = d.window.document;
  doc.getElementById('name').value = 'ada';
  doc.getElementById('chk').checked = true;
  doc.getElementById('ta').value = 'notes';
  doc.getElementById('sel').value = '2';
  doc.getElementById('pw').value = 'secret';

  const [clone] = I.cloneTargets([doc.getElementById('f')], I.normalizeOptions({ target: '#f' }));
  expect_eq(clone.querySelector('#name').getAttribute('value'), 'ada');
  expect_eq(clone.querySelector('#chk').hasAttribute('checked'), true);
  expect_eq(clone.querySelector('#ta').textContent, 'notes');
  expect_eq(clone.querySelector('#sel option[value="2"]').hasAttribute('selected'), true);
  // passwords never get serialized into markup
  expect_eq(clone.querySelector('#pw').getAttribute('value'), null);
});

/* exclusions */

test('excludeSelectorList removes matching elements, including the root', () => {
  const d = dom(
    '<div id="r"><p class="keep">a</p><p class="drop">b</p><span class="drop">c</span></div>'
  );
  const doc = d.window.document;
  const clone = doc.getElementById('r').cloneNode(true);
  I.applyExclusions(clone, I.normalizeOptions({ target: '#r', excludeSelectorList: ['.drop'] }));
  expect_eq(clone.querySelectorAll('.drop').length, 0);
  expect_eq(clone.querySelectorAll('.keep').length, 1);
});

/* link exposure */

test('exposeLinkUrls all rewrites link text with template', () => {
  const d = dom(
    '<div id="r"><a href="/docs">Docs</a><a href="#anchor">skip</a><a href="mailto:x@y.z">skip2</a></div>'
  );
  const doc = d.window.document;
  const clone = doc.getElementById('r').cloneNode(true);
  const o = I.normalizeOptions({ target: '#r', exposeLinkUrls: 'all' });
  I.applyLinkExposure(clone, o, d.window.location);
  const links = clone.querySelectorAll('a');
  expect_eq(links[0].textContent, 'Docs [https://example.com/docs]');
  expect_eq(links[1].textContent, 'skip');
  expect_eq(links[2].textContent, 'skip2');
});

test('exposeLinkUrls external skips same-host links and honors custom template', () => {
  const d = dom(
    '<div id="r"><a href="/local">Local</a><a href="https://other.io/x">Other</a></div>'
  );
  const doc = d.window.document;
  const clone = doc.getElementById('r').cloneNode(true);
  const o = I.normalizeOptions({
    target: '#r',
    exposeLinkUrls: 'external',
    linkTextTemplate: '{url} <- {title}'
  });
  I.applyLinkExposure(clone, o, d.window.location);
  const links = clone.querySelectorAll('a');
  expect_eq(links[0].textContent, 'Local');
  expect_eq(links[1].textContent, 'https://other.io/x <- Other');
});

/* image handling */

test('removeImages swaps img for a bordered placeholder sized from live layout', () => {
  const d = dom('<div id="r"><img src="a.png" alt="photo"></div>');
  const doc = d.window.document;
  const clone = doc.getElementById('r').cloneNode(true);
  clone.querySelector('img').setAttribute('data-prjs-id', '1');
  const meta = { 1: { imgW: 120, imgH: 90 } };
  I.applyImageHandling(clone, I.normalizeOptions({ target: '#r', removeImages: true }), meta, doc);
  expect_eq(clone.querySelectorAll('img').length, 0);
  const ph = clone.querySelector('.prjs-img-placeholder');
  expect_ok(ph);
  expect_match(ph.getAttribute('style'), /width:120px/);
  expect_match(ph.getAttribute('style'), /border:1px solid/);
  expect_eq(ph.getAttribute('title'), 'photo');
});

test('forceLazyImages pins currentSrc and drops srcset', () => {
  const d = dom('<div id="r"><img src="a.png" srcset="a2.png 2x" loading="lazy"></div>');
  const doc = d.window.document;
  const clone = doc.getElementById('r').cloneNode(true);
  clone.querySelector('img').setAttribute('data-prjs-id', '1');
  const meta = { 1: { currentSrc: 'https://example.com/a2.png' } };
  I.applyImageHandling(clone, I.normalizeOptions({ target: '#r' }), meta, doc);
  const img = clone.querySelector('img');
  expect_eq(img.getAttribute('loading'), 'eager');
  expect_eq(img.hasAttribute('srcset'), false);
  expect_eq(img.src, 'https://example.com/a2.png');
});

/* scrollable expansion */

test('scrollable expansion sets overflow visible, or max-height cap when configured', () => {
  const d = dom('<div id="r"><div data-prjs-id="1" style="height:100px"></div></div>');
  const doc = d.window.document;
  const clone = doc.getElementById('r').cloneNode(true);
  const meta = { 1: { scrollable: true } };
  I.applyScrollableExpansion(
    clone,
    I.normalizeOptions({ target: '#r', extendScrollableAreas: true }),
    meta
  );
  expect_match(clone.firstElementChild.getAttribute('style'), /overflow:visible/);

  const clone2 = doc.getElementById('r').cloneNode(true);
  I.applyScrollableExpansion(
    clone2,
    I.normalizeOptions({
      target: '#r',
      extendScrollableAreas: true,
      scrollableAreasMaxHeight: 400
    }),
    meta
  );
  expect_match(clone2.firstElementChild.getAttribute('style'), /max-height:400px/);
});

/* inline style stripping */

test('strips inline styles everywhere including root', () => {
  const d = dom('<div id="r" style="color:red"><p style="margin:0">x</p></div>');
  const clone = d.window.document.getElementById('r').cloneNode(true);
  I.applyInlineStyleStrip(clone);
  expect_eq(clone.hasAttribute('style'), false);
  expect_eq(clone.querySelector('p').hasAttribute('style'), false);
});

/* custom transforms */

test('modern transforms can mutate, replace, or remove elements', () => {
  const d = dom('<div id="r"><em>a</em><em class="kill">b</em><b>c</b></div>');
  const doc = d.window.document;
  const clone = doc.getElementById('r').cloneNode(true);
  const o = I.normalizeOptions({
    target: '#r',
    transforms: [
      { selector: 'em.kill', fn: () => null },
      {
        selector: 'em',
        fn: (el) => {
          el.textContent = el.textContent.toUpperCase();
          return el;
        }
      },
      {
        selector: 'b',
        fn: (el) => {
          const s = el.ownerDocument.createElement('i');
          s.textContent = el.textContent;
          return s;
        }
      }
    ]
  });
  I.applyCustomTransforms(clone, o);
  expect_eq(clone.querySelectorAll('em').length, 1);
  expect_eq(clone.querySelector('em').textContent, 'A');
  expect_eq(clone.querySelectorAll('b').length, 0);
  expect_eq(clone.querySelector('i').textContent, 'c');
});

test('legacy customMethodMap chains functions and allows arrow functions', () => {
  const d = dom('<div id="r"><span>x</span></div>');
  const clone = d.window.document.getElementById('r').cloneNode(true);
  const calls = [];
  const o = I.normalizeOptions({
    target: '#r',
    footerText: 'ctx',
    customMethodMap: {
      span: [
        (el, opts) => {
          calls.push('first:' + opts.footerText);
          el.textContent += '1';
          return el;
        },
        (el) => {
          calls.push('second');
          el.textContent += '2';
          return el;
        }
      ]
    }
  });
  I.applyCustomTransforms(clone, o);
  expect_deep(calls, ['first:ctx', 'second']);
  expect_eq(clone.querySelector('span').textContent, 'x12');
});

/* page css */

test('page css includes size, margin, breaks, and exclusions of dark mode', () => {
  const css = I.buildPageCss(
    I.normalizeOptions({
      target: '#x',
      setPrintSize: 'A4 landscape',
      pageMargin: '15mm',
      pageBreakBeforeSelectors: ['h2'],
      avoidBreakSelectors: ['tr'],
      stripDarkMode: true
    })
  );
  expect_match(css, /@page \{size: A4 landscape; margin: 15mm;\}/);
  expect_match(css, /h2 \{ break-before: page/);
  expect_match(css, /tr \{ break-inside: avoid/);
  expect_match(css, /color-scheme: light/);
});

/* watermark */

test('text watermark renders escaped svg with angle and opacity in css', () => {
  const d = dom('<div></div>');
  const o = I.normalizeOptions({
    target: '#x',
    watermarkText: '<Draft> & "Co"',
    watermarkAngle: -45,
    watermarkOpacity: 0.5
  });
  const node = I.buildWatermarkNode(o, d.window.document);
  expect_ok(node.querySelector('svg'));
  expect_match(node.innerHTML, /&lt;Draft&gt;/);
  expect_match(node.innerHTML, /rotate\(-45/);
  expect_match(I.buildPageCss(o), /opacity: 0\.5/);
});

test('image watermark uses an img tag', () => {
  const d = dom('<div></div>');
  const o = I.normalizeOptions({ target: '#x', watermarkImageURL: 'https://example.com/wm.png' });
  const node = I.buildWatermarkNode(o, d.window.document);
  expect_ok(node.querySelector('img'));
});

/* document assembly */

test('assemblePrintDocument wires header/footer table, targets, and custom style', () => {
  const src = dom('<style>.s{color:red}</style><div id="r">hello</div>');
  const out = dom('');
  const doc = out.window.document;
  const clone = src.window.document.getElementById('r').cloneNode(true);
  const o = I.normalizeOptions({
    target: '#r',
    headerText: 'TOP',
    footerText: 'BOTTOM',
    keepSourceCSS: true,
    injectCustomStyle: '.z{display:none}',
    documentTitle: 'My print'
  });
  I.assemblePrintDocument(doc, [clone], o, src.window.document);
  expect_eq(doc.title, 'My print');
  expect_ok(doc.querySelector('table.prjs-sheet thead td'));
  expect_eq(doc.querySelector('thead td').textContent, 'TOP');
  expect_eq(doc.querySelector('tfoot td').textContent, 'BOTTOM');
  expect_ok(doc.querySelector('tbody .prjs-target #r'));
  const styles = Array.from(doc.querySelectorAll('style'))
    .map((s) => s.textContent)
    .join('\n');
  expect_match(styles, /\.s\{color:red\}/);
  expect_match(styles, /\.z\{display:none\}/);
});

test('multiple targets each get their own slot and page break css by default', () => {
  const src = dom('<div id="a">A</div><div id="b">B</div>');
  const out = dom('');
  const doc = out.window.document;
  const clones = [
    src.window.document.getElementById('a').cloneNode(true),
    src.window.document.getElementById('b').cloneNode(true)
  ];
  const o = I.normalizeOptions({ target: ['#a', '#b'] });
  I.assemblePrintDocument(doc, clones, o, src.window.document);
  expect_eq(doc.querySelectorAll('.prjs-target').length, 2);
  expect_match(I.buildPageCss(o), /\.prjs-target \+ \.prjs-target\{ break-before: page/);
});

/* full lifecycle with stubbed print */

test('end-to-end job in iframe resolves promise and fires callbacks in order', async () => {
  const d = dom('<div id="r"><p>content</p><a href="/x">l</a></div>');
  const events = [];

  const jobPromise = new Promise((resolve, reject) => {
    const opts = {
      target: '#r',
      exposeLinkUrls: 'all',
      assetTimeout: 200,
      afterPrintTimeout: 300,
      beforePrintCb: () => events.push('before'),
      afterPrintCb: () => {
        events.push('after');
      },
      onError: reject
    };
    Printcraft.print(opts, { document: d.window.document, window: d.window }).then(resolve, reject);
  });

  // stub print the moment the iframe hits the dom, before the library can call it
  const mo = new d.window.MutationObserver(() => {
    const f = d.window.document.querySelector('iframe');
    if (f && f.contentWindow && (!f.contentWindow.print || !f.contentWindow.print._stub)) {
      const stub = () => {
        events.push('print');
        setTimeout(() => f.contentWindow.dispatchEvent(new d.window.Event('afterprint')), 10);
      };
      stub._stub = true;
      f.contentWindow.print = stub;
      f.contentWindow.focus = () => {};
    }
  });
  mo.observe(d.window.document.body, { childList: true, subtree: true });

  try {
    await jobPromise;
  } finally {
    mo.disconnect();
  }
  expect_deep(events, ['before', 'print', 'after']);
  // iframe is cleaned up
  expect_eq(d.window.document.querySelectorAll('iframe').length, 0);
});

test('onError swallows failures and resolve still happens', async () => {
  const d = dom('<div></div>');
  let caught = null;
  await Printcraft.print(
    {
      target: '#nope',
      onError: (e) => {
        caught = e;
      }
    },
    { document: d.window.document, window: d.window }
  );
  expect_match(String(caught), /no elements match/);
});

test('printHTML builds a job from a raw string', () => {
  const o = I.normalizeOptions({ html: '<h1>hi</h1>' });
  expect_eq(o.html, '<h1>hi</h1>');
});

test('hotkey binding intercepts ctrl+p and unbind restores it', () => {
  const d = dom('<div id="r">x</div>');
  let fired = 0;
  const origPrint = Printcraft.print;
  Printcraft.print = () => {
    fired++;
    return Promise.resolve();
  };
  try {
    const unbind = Printcraft.bindHotkey(
      { target: '#r' },
      { document: d.window.document, window: d.window }
    );
    const ev = new d.window.KeyboardEvent('keydown', { key: 'p', ctrlKey: true, cancelable: true });
    d.window.dispatchEvent(ev);
    expect_eq(fired, 1);
    expect_eq(ev.defaultPrevented, true);
    unbind();
    d.window.dispatchEvent(
      new d.window.KeyboardEvent('keydown', { key: 'p', ctrlKey: true, cancelable: true })
    );
    expect_eq(fired, 1);
  } finally {
    Printcraft.print = origPrint;
  }
});
