// Drawn annotations: the model, the serialiser and the SVG they become.
//
// The interaction needs a real browser and lives in the e2e suite. What is here
// is the part that has to be right for a drawing to survive the trip from a
// screen to a sheet of paper: fractions rather than pixels, vectors rather than
// a bitmap, and a stroke that does not stretch with the box.

import { test, expect } from 'vitest';
import { dom } from './harness';
import {
  bounds,
  describeShape,
  mountOverlay,
  overlayNode,
  parse,
  pathData,
  serialise,
  simplify,
  toFraction,
  unmountOverlay,
  type Drawing,
  type Shape
} from '../src/annotate';

function shape(over: Partial<Shape> = {}): Shape {
  return {
    id: 's1',
    kind: 'pen',
    points: [
      { x: 0.1, y: 0.2 },
      { x: 0.5, y: 0.6 }
    ],
    color: '#dc2626',
    width: 3,
    opacity: 1,
    ...over
  };
}

const drawing = (shapes: Shape[]): Drawing => ({ v: 1, shapes });

/* the model --------------------------------------------------------------- */

test('a pointer position becomes a fraction of the element, clamped to it', () => {
  const box = { left: 100, top: 50, width: 200, height: 100 } as DOMRect;

  expect(toFraction(200, 100, box)).toEqual({ x: 0.5, y: 0.5 });
  expect(toFraction(100, 50, box)).toEqual({ x: 0, y: 0 });
  expect(toFraction(300, 150, box)).toEqual({ x: 1, y: 1 });

  // a drag that left the element must not draw outside it
  expect(toFraction(-500, 9999, box)).toEqual({ x: 0, y: 1 });
});

test('an element with no size does not divide by zero', () => {
  const box = { left: 0, top: 0, width: 0, height: 0 } as DOMRect;
  expect(toFraction(10, 10, box)).toEqual({ x: 0, y: 0 });
});

test('simplify drops points the pointer repeated without moving', () => {
  // a pointer that reported the same position sixty times
  const stalled = Array.from({ length: 60 }, () => ({ x: 0.4, y: 0.5 }));
  expect(simplify([{ x: 0, y: 0 }, ...stalled, { x: 1, y: 1 }]).length).toBeLessThan(10);

  // but a real trace keeps its shape: this used to run at a tolerance five times
  // wider, and between that and quadratic smoothing a deliberate wobble came out
  // straight. getStroke wants the trace, not a summary of it.
  const traced = Array.from({ length: 200 }, (_, i) => ({ x: i / 200, y: 0.5 }));
  const kept = simplify(traced);

  expect(kept.length, 'a real stroke keeps most of its points').toBeGreaterThan(150);
  expect(kept[0], 'the start is where the stroke started').toEqual(traced[0]);
  expect(kept[kept.length - 1], 'and the end is where it stopped').toEqual(
    traced[traced.length - 1]
  );
});

test('serialising rounds to three places and reads back the same', () => {
  const before = drawing([shape({ points: [{ x: 0.123456789, y: 0.987654321 }] })]);
  const raw = serialise(before);

  expect(raw).toContain('0.123');
  expect(raw, 'nine decimal places of a fraction is noise').not.toContain('0.123456789');
  expect(parse(raw).shapes[0]!.points[0]).toEqual({ x: 0.123, y: 0.988 });
});

test('a drawing that will not parse becomes an empty one, not an exception', () => {
  // a corrupt attribute must cost its own annotations, not the page's ability
  // to print
  expect(parse('not json').shapes).toEqual([]);
  expect(parse('{"shapes":"nope"}').shapes).toEqual([]);
  expect(parse(null).shapes).toEqual([]);
  expect(parse('{"v":1,"shapes":[{"kind":"pen"}]}').shapes, 'a shape needs points').toEqual([]);
});

test('bounds cover every point', () => {
  const box = bounds(
    shape({
      points: [
        { x: 0.2, y: 0.8 },
        { x: 0.6, y: 0.1 },
        { x: 0.4, y: 0.5 }
      ]
    })
  );
  expect(box.x).toBe(0.2);
  expect(box.y).toBe(0.1);
  // subtracting fractions, so exact equality is the wrong question to ask
  expect(box.width).toBeCloseTo(0.4, 10);
  expect(box.height).toBeCloseTo(0.7, 10);
});

test('every shape can say what it is', () => {
  expect(describeShape(shape({ kind: 'arrow' }))).toBe('an arrow');
  expect(describeShape(shape({ kind: 'text', text: 'provisional' }))).toBe('“provisional”');
});

/* the svg ----------------------------------------------------------------- */

test('the overlay is a stretched viewBox, so shapes are percentages', () => {
  const doc = dom('').window.document;
  const svg = overlayNode(doc, drawing([shape()]));

  expect(svg.getAttribute('viewBox')).toBe('0 0 100 100');
  expect(svg.getAttribute('preserveAspectRatio'), 'stretched to the element').toBe('none');
  expect(svg.getAttribute('style')).toContain('pointer-events:none');
});

test('stroked shapes opt out of the viewBox stretch', () => {
  // without this a 3px line is thin across a wide element and fat down a tall
  // one, because the box is scaled unevenly
  const doc = dom('').window.document;
  const svg = overlayNode(
    doc,
    drawing([
      shape({ id: 'b', kind: 'rect' }),
      shape({ id: 'c', kind: 'ellipse' }),
      shape({ id: 'd', kind: 'line' }),
      shape({ id: 'e', kind: 'highlight' })
    ])
  );

  const stroked = [...svg.querySelectorAll('path, rect, ellipse, line')];
  expect(stroked.length).toBeGreaterThan(0);
  for (const el of stroked) {
    expect(el.getAttribute('vector-effect'), el.tagName + ' would stretch').toBe(
      'non-scaling-stroke'
    );
  }
});

test('the pen is a filled outline, and it is undistorted by the host box', () => {
  // a pen stroke cannot use non-scaling-stroke: it is filled, not stroked, which
  // is what lets its width vary along it. So the outline is computed in real
  // pixels instead. On a wide short host, a nib drawn in viewBox units came out
  // 27px across and 0.13px tall.
  const doc = dom('').window.document;
  const pen = shape({
    kind: 'pen',
    points: [
      { x: 0.1, y: 0.5 },
      { x: 0.4, y: 0.5 },
      { x: 0.7, y: 0.5 }
    ]
  });

  const wide = overlayNode(doc, drawing([pen]), false, { width: 800, height: 40 });
  const path = wide.querySelector('path')!;

  expect(path.getAttribute('fill'), 'a fill is what varies').toBe('#dc2626');
  expect(path.getAttribute('stroke')).toBe('none');

  // the outline's vertical span, back in real pixels
  const ys = (path.getAttribute('d')!.match(/-?[\d.]+/g) || [])
    .map(Number)
    .filter((_, i) => i % 2 === 1);
  const spanPx = ((Math.max(...ys) - Math.min(...ys)) / 100) * 40;

  expect(spanPx, 'a 3px nib is a few pixels, not a fraction of one').toBeGreaterThan(3);
  expect(spanPx, 'and not tens of them').toBeLessThan(25);
});

test('a drawing is vectors, never a bitmap', () => {
  // the reason: Background graphics is off by default in Chromium, and a canvas
  // prints at screen resolution even when it is on
  const doc = dom('').window.document;
  const svg = overlayNode(doc, drawing([shape(), shape({ id: 'b', kind: 'arrow' })]));

  expect(svg.querySelector('canvas'), 'a canvas would print at 96dpi').toBeNull();
  expect(svg.querySelector('image'), 'and an image would too').toBeNull();
  expect(svg.querySelectorAll('path, line').length).toBeGreaterThan(0);
});

test('an arrow draws its own head rather than using a marker', () => {
  // a <marker> needs a uniquely-id'd <defs>, and ids do not survive being cloned
  // into a print document beside another copy of themselves
  const doc = dom('').window.document;
  const svg = overlayNode(doc, drawing([shape({ kind: 'arrow' })]));

  expect(svg.querySelector('marker')).toBeNull();
  expect(svg.querySelector('line')).toBeTruthy();
  expect(svg.querySelector('path[fill="#dc2626"]'), 'the head is a filled triangle').toBeTruthy();
});

test('a highlight blends rather than covering the words underneath', () => {
  const doc = dom('').window.document;
  const svg = overlayNode(doc, drawing([shape({ kind: 'highlight', opacity: 0.4 })]));
  const path = svg.querySelector('path')!;

  expect(path.getAttribute('style')).toContain('mix-blend-mode:multiply');
  expect(path.getAttribute('opacity')).toBe('0.4');
});

test('text carries its words and a fixed font size', () => {
  const doc = dom('').window.document;
  const svg = overlayNode(
    doc,
    drawing([shape({ kind: 'text', text: 'provisional until audit', size: 16 })])
  );
  const text = svg.querySelector('text')!;

  expect(text.textContent).toBe('provisional until audit');
  expect(text.getAttribute('font-size')).toBe('16');
});

test('a traced path is smoothed, and two points are a straight line', () => {
  expect(
    pathData([
      { x: 0, y: 0 },
      { x: 1, y: 1 }
    ]),
    'nothing to smooth between two points'
  ).toBe('M 0 0 L 100 100');

  const curved = pathData([
    { x: 0, y: 0 },
    { x: 0.5, y: 0.2 },
    { x: 1, y: 0 }
  ]);
  expect(curved, 'three points become a curve, not a polygon').toContain('Q');
});

/* mounting ---------------------------------------------------------------- */

test('mounting gives the host a positioning context, and unmounting gives it back', () => {
  const d = dom('<div id="host">content</div>');
  const host = d.window.document.getElementById('host') as HTMLElement;

  expect(host.style.position, 'nothing to start with').toBe('');

  mountOverlay(host, drawing([shape()]));
  expect(host.querySelector('.prjs-drawing'), 'the overlay is there').toBeTruthy();
  expect(host.style.position, 'absolute children need one').toBe('relative');

  unmountOverlay(host);
  expect(host.querySelector('.prjs-drawing')).toBeNull();
  expect(host.style.position, 'the element is left as it was found').toBe('');
});

test('a host that already positions itself is left alone', () => {
  const d = dom('<div id="host" style="position:absolute">content</div>');
  const host = d.window.document.getElementById('host') as HTMLElement;

  mountOverlay(host, drawing([shape()]));
  unmountOverlay(host);

  expect(host.style.position, 'we never set it, so we never clear it').toBe('absolute');
});

test('mounting twice leaves one overlay, not two', () => {
  const d = dom('<div id="host">content</div>');
  const host = d.window.document.getElementById('host') as HTMLElement;

  mountOverlay(host, drawing([shape()]));
  mountOverlay(host, drawing([shape(), shape({ id: 'b' })]));

  expect(host.querySelectorAll('.prjs-drawing')).toHaveLength(1);
  expect(host.querySelector('.prjs-drawing')!.children).toHaveLength(2);
});

test('an empty drawing mounts nothing', () => {
  const d = dom('<div id="host">content</div>');
  const host = d.window.document.getElementById('host') as HTMLElement;

  expect(mountOverlay(host, drawing([]))).toBeNull();
  expect(host.querySelector('.prjs-drawing')).toBeNull();
});

test('the live overlay is marked as interface, and the printed one is not', () => {
  // the interface strips data-prjs-ui from anything it hands on, so a screenshot
  // does not contain the drawing twice. the print copy is rebuilt without it.
  const doc = dom('').window.document;

  expect(overlayNode(doc, drawing([shape()]), false).hasAttribute('data-prjs-ui')).toBe(true);
  expect(overlayNode(doc, drawing([shape()]), true).hasAttribute('data-prjs-ui')).toBe(false);
});
