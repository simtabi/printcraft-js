// Watermarks.
//
// The old one was a single `position: fixed` element on the body. Measured on a
// 5089px document it produced a 794×1123 box, so it marked page one and stopped;
// under pagination it sat outside the sheets entirely, giving six sheets one
// mark between them. These pin down the replacement.

import { test, expect } from 'vitest';
import { Printcraft, dom, env, I } from './harness';

const { resolveWatermark, buildWatermarkLayer, needsPages, normalizeOptions } = I;

/* resolving ------------------------------------------------------------- */

test('a bare string is the shorthand for text', () => {
  const wm = resolveWatermark({ watermark: 'DRAFT' });
  expect(wm.text).toBe('DRAFT');
  expect(wm.repeat).toBe('first-page');
  expect(wm.position).toBe('center');
});

test('nothing to draw resolves to nothing', () => {
  expect(resolveWatermark({})).toBe(null);
  expect(resolveWatermark({ watermark: {} })).toBe(null);
  expect(resolveWatermark({ watermark: { opacity: 0.5 } })).toBe(null);
});

test('the old flat options still work', () => {
  const wm = resolveWatermark({
    watermarkText: 'COPY',
    watermarkOpacity: 0.5,
    watermarkAngle: -45
  });
  expect(wm.text).toBe('COPY');
  expect(wm.opacity).toBe(0.5);
  expect(wm.rotate).toBe(-45);
});

test('the object form wins key by key, so moving across is gradual', () => {
  const wm = resolveWatermark({
    watermarkText: 'OLD',
    watermarkOpacity: 0.9,
    watermark: { text: 'NEW' }
  });
  expect(wm.text, 'the new key wins').toBe('NEW');
  expect(wm.opacity, 'the old one still applies where the new is silent').toBe(0.9);
});

test('opacity is clamped rather than trusted', () => {
  expect(resolveWatermark({ watermark: { text: 'x', opacity: 4 } }).opacity).toBe(1);
  expect(resolveWatermark({ watermark: { text: 'x', opacity: -2 } }).opacity).toBe(0);
});

test('a size can be a percentage, a length or a number of pixels', () => {
  expect(resolveWatermark({ watermark: { text: 'x', size: '40%' } }).size).toBe('40%');
  expect(resolveWatermark({ watermark: { text: 'x', size: '60mm' } }).size).toBe('60mm');
  expect(resolveWatermark({ watermark: { text: 'x', size: 220 } }).size).toBe('220px');
});

test('an unknown position falls back to the centre instead of breaking the layout', () => {
  expect(resolveWatermark({ watermark: { text: 'x', position: 'nowhere' } }).position).toBe(
    'center'
  );
  expect(
    resolveWatermark({ watermark: { text: 'x', position: { x: '25%', y: '75%' } } }).position
  ).toEqual({ x: '25%', y: '75%' });
});

/* pagination ------------------------------------------------------------ */

test('a repeating mark needs sheets, so it turns pagination on', () => {
  expect(needsPages(resolveWatermark({ watermark: { text: 'x', repeat: 'every-page' } }))).toBe(
    true
  );
  expect(needsPages(resolveWatermark({ watermark: { text: 'x', repeat: 'tile' } }))).toBe(true);
  expect(needsPages(resolveWatermark({ watermark: { text: 'x' } }))).toBe(false);
  expect(needsPages(null)).toBe(false);
});

test('normalizeOptions switches pagination on for a repeating mark', () => {
  const every = normalizeOptions({
    target: 'body',
    watermark: { text: 'CONFIDENTIAL', repeat: 'every-page' }
  });
  expect(every.paginate, 'one fixed element cannot reach page two').toBe(true);

  const once = normalizeOptions({ target: 'body', watermark: 'DRAFT' });
  expect(once.paginate, 'a first-page mark changes nothing').toBeFalsy();
});

test('an explicit paginate setting is not overwritten', () => {
  const o = normalizeOptions({
    target: 'body',
    paginate: { orphans: 3 },
    watermark: { text: 'x', repeat: 'tile' }
  });
  expect(o.paginate).toEqual({ orphans: 3 });
});

/* the mark itself -------------------------------------------------------- */

const A4 = { width: 794, height: 1123 };

function layerFor(spec: Record<string, unknown>, doc: Document): Element {
  return buildWatermarkLayer(resolveWatermark({ watermark: spec }), doc, A4);
}

test('text becomes an svg sized to the share of the sheet asked for', () => {
  const d = dom('');
  const layer = layerFor({ text: 'DRAFT', size: '50%' }, d.window.document);
  const svg = layer.querySelector('svg')!;

  expect(svg.getAttribute('width')).toBe('397');
  // `textLength` makes the glyphs fill the box whatever font is available, so
  // the mark is the width asked for rather than the width the font happened to be
  expect(svg.querySelector('text')!.getAttribute('textLength')).toBeTruthy();
  expect(svg.querySelector('text')!.getAttribute('lengthAdjust')).toBe('spacingAndGlyphs');
  expect(svg.textContent).toBe('DRAFT');
});

test('an image mark is used instead of text when both are given', () => {
  const d = dom('');
  const layer = layerFor(
    { text: 'ignored', image: 'https://example.com/stamp.png', size: '30%' },
    d.window.document
  );
  const img = layer.querySelector('img')!;
  expect(img.getAttribute('src')).toBe('https://example.com/stamp.png');
  expect(img.getAttribute('style')).toContain('width:238px');
  expect(layer.querySelector('svg')).toBe(null);
});

test('colour, font, weight and rotation reach the mark', () => {
  const d = dom('');
  const layer = layerFor(
    { text: 'VOID', color: '#e5007d', font: 'Georgia', weight: 400, rotate: 12 },
    d.window.document
  );
  const text = layer.querySelector('text')!;
  expect(text.getAttribute('fill')).toBe('#e5007d');
  expect(text.getAttribute('font-family')).toBe('Georgia');
  expect(text.getAttribute('font-weight')).toBe('400');
  expect(layer.firstElementChild!.getAttribute('style')).toContain('rotate(12deg)');
});

test('text is escaped, because a watermark is caller-supplied', () => {
  const d = dom('');
  const layer = layerFor({ text: '</text><script>alert(1)</script>' }, d.window.document);
  expect(layer.querySelector('script'), 'no script survived').toBe(null);
  expect(layer.querySelector('text')!.textContent).toContain('<script>');
});

test('each named position lands where it says', () => {
  const d = dom('');
  const at = (position: string): string =>
    layerFor(
      { text: 'x', position, margin: '10mm' },
      d.window.document
    ).firstElementChild!.getAttribute('style')!;

  expect(at('center')).toContain('translate(-50%,-50%)');
  expect(at('top-left')).toContain('top:10mm');
  expect(at('top-left')).toContain('left:10mm');
  expect(at('bottom-right')).toContain('bottom:10mm');
  expect(at('bottom-right')).toContain('right:10mm');
  expect(at('middle-left')).toContain('translateY(-50%)');
  expect(at('top-center')).toContain('translateX(-50%)');
});

test('tiling covers the sheet, and starts outside it so the corners are not bare', () => {
  const d = dom('');
  const layer = layerFor(
    { text: 'COPY', repeat: 'tile', size: '20%', tile: { gap: '5%', stagger: false } },
    d.window.document
  );

  // 20% + 5% of 794 is a ~199px step: enough columns and rows to overhang A4
  const marks = layer.querySelectorAll('svg');
  expect(marks.length).toBeGreaterThan(30);

  const lefts = [...layer.children].map((c) =>
    parseInt(/left:(-?\d+)px/.exec(c.getAttribute('style')!)![1]!, 10)
  );
  expect(Math.min(...lefts), 'the grid starts off the left edge').toBeLessThan(0);
  expect(Math.max(...lefts), 'and runs past the right').toBeGreaterThan(A4.width - 200);
});

test('stagger offsets alternate rows by half a step', () => {
  const d = dom('');
  const style = (stagger: boolean): string[] =>
    [
      ...layerFor(
        { text: 'x', repeat: 'tile', size: '25%', tile: { gap: '0%', stagger } },
        d.window.document
      ).children
    ].map((c) => c.getAttribute('style')!);

  const distinct = (list: string[]): number =>
    new Set(list.map((s) => /left:(-?\d+)px/.exec(s)![1])).size;

  expect(distinct(style(true))).toBeGreaterThan(distinct(style(false)));
});

/* what the document ends up with ----------------------------------------- */

test('an unpaginated job gets one fixed mark, and says as much in the css', () => {
  const d = dom('<div id="t">hello</div>');
  const css = I.buildPageCss(normalizeOptions({ target: '#t', watermark: 'DRAFT' }));
  expect(css).toContain('position: fixed');
  expect(css).toContain('opacity: 0.25');
  void d;
});

test('a paginated job positions the mark against each sheet', () => {
  const css = I.buildPageCss(
    normalizeOptions({ target: 'body', watermark: { text: 'x', repeat: 'every-page' } })
  );
  expect(css).toContain('position: absolute');
  // without a containing block the layer escapes to the page box, and we are
  // back to marking one page
  expect(css).toContain('.prjs-page-sheet, .prjs-watermark-host { position: relative; }');
});

test('layer: behind puts the content in front of the mark', () => {
  const over = I.buildPageCss(
    normalizeOptions({ target: 'body', watermark: { text: 'x', repeat: 'every-page' } })
  );
  const behind = I.buildPageCss(
    normalizeOptions({
      target: 'body',
      watermark: { text: 'x', repeat: 'every-page', layer: 'behind' }
    })
  );

  expect(over).toContain('z-index: 5');
  expect(behind).toContain('z-index: 0');
  expect(behind).toContain('.prjs-page-inner');
});

test('the builder takes a string or the whole spec', () => {
  const d = dom('<div id="t">x</div>');
  const scope = env(d);

  const simple = new Printcraft('#t').watermark('DRAFT', 0.4);
  expect(simple.options.watermark).toEqual({ text: 'DRAFT', opacity: 0.4 });

  const full = new Printcraft('#t').watermark({ text: 'VOID', repeat: 'tile', rotate: 0 });
  expect(full.options.watermark).toEqual({ text: 'VOID', repeat: 'tile', rotate: 0 });
  void scope;
});
