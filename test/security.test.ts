// The sanitiser.
//
// The print document is a fresh same-origin browsing context, so anything inert
// on the host page (a script inside a template, an onclick in user-generated
// markup, a nested iframe) would actually run there. These are the vectors that
// matter, written as the markup that carries them.
//
// This is not a general-purpose XSS sanitiser and the tests do not pretend it
// is. It removes what can execute or navigate in a print document, which is a
// smaller and better-defined problem than sanitising arbitrary untrusted html.

import { test, expect } from 'vitest';
import { dom, I } from './harness';

/** Sanitises a fragment and hands back its markup. */
function clean(html: string): string {
  const d = dom('<div id="r">' + html + '</div>');
  const clone = d.window.document.getElementById('r')!.cloneNode(true) as Element;
  I.sanitizeClone(clone);
  return clone.innerHTML;
}

function attr(html: string, selector: string, name: string): string | null {
  const d = dom('<div id="r">' + html + '</div>');
  const clone = d.window.document.getElementById('r')!.cloneNode(true) as Element;
  I.sanitizeClone(clone);
  return clone.querySelector(selector)?.getAttribute(name) ?? null;
}

/* things that execute ----------------------------------------------------- */

const EXECUTABLE: Array<[string, string]> = [
  ['a script', '<script>alert(1)</script>'],
  ['a noscript', '<noscript><img src=x onerror=alert(1)></noscript>'],
  ['an object', '<object data="evil.swf"></object>'],
  ['an embed', '<embed src="evil.swf">'],
  ['an iframe', '<iframe src="https://evil.example"></iframe>'],
  ['a frame', '<frame src="https://evil.example">'],
  ['an applet', '<applet code="Evil.class"></applet>'],
  ['a base tag', '<base href="https://evil.example/">'],
  ['a refresh meta', '<meta http-equiv="refresh" content="0;url=https://evil.example">'],
  ['a template', '<template><script>alert(1)</script></template>']
];

for (const [name, markup] of EXECUTABLE) {
  test(name + ' is removed', () => {
    const out = clean(markup);
    expect(out).not.toContain('alert(1)');
    expect(out).not.toContain('evil.example');
    expect(out).not.toContain('evil.swf');
  });
}

test('a base tag is removed, because it would repoint every relative url', () => {
  // the print document has its own <base> pointing at the host page. a second
  // one from the content would silently rewrite every image and stylesheet.
  const out = clean('<base href="https://evil.example/"><img src="logo.png">');
  expect(out).not.toContain('base');
  expect(out, 'the legitimate content survives').toContain('logo.png');
});

test('every event handler goes, whatever its casing', () => {
  const out = clean(
    '<p onclick="a()" OnMouseOver="b()" ONFOCUS="c()" onerror="d()">text</p>' +
      '<img src="x.png" onload="e()">'
  );
  expect(out).not.toMatch(/on[a-z]+=/i);
  expect(out, 'and the content is untouched').toContain('text');
  expect(out).toContain('x.png');
});

/* urls -------------------------------------------------------------------- */

const DANGEROUS_URLS = [
  'javascript:alert(1)',
  'JavaScript:alert(1)',
  '  javascript:alert(1)',
  'java\tscript:alert(1)',
  'java\nscript:alert(1)',
  'vbscript:msgbox(1)',
  'data:text/html,<script>alert(1)</script>',
  'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
  'file:///etc/passwd'
];

for (const url of DANGEROUS_URLS) {
  test('href ' + JSON.stringify(url.slice(0, 30)) + ' is defused', () => {
    const href = attr('<a href="' + url.replace(/"/g, '&quot;') + '">link</a>', 'a', 'href');
    expect(href).toBe('#');
  });
}

test('ordinary urls are left completely alone', () => {
  for (const url of [
    'https://example.com/page',
    'http://example.com',
    '/relative/path',
    '../sibling.html',
    '#anchor',
    '?query=1',
    'mailto:someone@example.com',
    'tel:+15551234567'
  ]) {
    const href = attr('<a href="' + url + '">x</a>', 'a', 'href');
    expect(href, url + ' was rewritten').toBe(url);
  }
});

test('a data: image is kept, because it only ever draws', () => {
  const src = attr('<img src="data:image/png;base64,iVBORw0KGgo=" alt="">', 'img', 'src');
  expect(src).toContain('data:image/png');
});

test('a data: document in an image position is dropped', () => {
  const src = attr('<img src="data:text/html,<script>alert(1)</script>">', 'img', 'src');
  expect(src).toBe(null);
});

test('srcdoc is a whole document inline, so it goes', () => {
  const out = clean('<iframe srcdoc="<script>alert(1)</script>"></iframe>');
  expect(out).not.toContain('srcdoc');
  expect(out).not.toContain('alert(1)');
});

test('a form action cannot point at a script', () => {
  expect(attr('<form action="javascript:alert(1)"><input></form>', 'form', 'action')).toBe(null);
  expect(attr('<button formaction="javascript:alert(1)">go</button>', 'button', 'formaction')).toBe(
    null
  );
  // a real action survives: a printed form is still a form
  expect(attr('<form action="/submit"><input></form>', 'form', 'action')).toBe('/submit');
});

test('an svg use cannot pull in an external document', () => {
  const external = clean('<svg><use href="https://evil.example/x.svg#icon"></use></svg>');
  expect(external).not.toContain('evil.example');

  // a same-document reference is how sprites work, and stays
  const internal = clean('<svg><use href="#icon"></use></svg>');
  expect(internal).toContain('#icon');
});

test('ping, background and the rest of the fetching attributes are checked too', () => {
  expect(attr('<a href="/x" ping="javascript:alert(1)">x</a>', 'a', 'ping')).toBe(null);
  expect(attr('<td background="javascript:alert(1)">x</td>', 'td', 'background')).toBe(null);
});

/* what it does not break ------------------------------------------------- */

test('the sanitiser leaves ordinary markup exactly as it was', () => {
  const markup =
    '<h1 class="title">Invoice</h1>' +
    '<p style="color:#333">Due <strong>today</strong></p>' +
    '<table><tr><td>1</td></tr></table>' +
    '<img src="/logo.png" width="80" alt="logo">' +
    '<a href="https://example.com">terms</a>';

  const out = clean(markup);
  expect(out).toContain('class="title"');
  expect(out).toContain('style="color:#333"');
  expect(out).toContain('<strong>today</strong>');
  expect(out).toContain('/logo.png');
  expect(out).toContain('https://example.com');
});

test('sanitising runs on every job by default', async () => {
  const d = dom('<div id="r"><p>text</p><script>window.__pwned = 1</script></div>');
  let printed = '';

  await (
    await import('./harness')
  ).Printcraft.print(
    {
      target: '#r',
      assetTimeout: 50,
      hooks: {
        beforePrint(ctx: { document: Document }) {
          printed = ctx.document.documentElement.outerHTML;
          return false;
        }
      }
    },
    { document: d.window.document, window: d.window as unknown as Window }
  );

  expect(printed).not.toContain('__pwned');
  expect(printed).toContain('text');
});
