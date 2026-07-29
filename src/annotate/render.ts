// Turning shapes into SVG.
//
// SVG rather than canvas, for the same reason the watermark is an element rather
// than a background image: a canvas is one bitmap at one resolution, and the
// browser's *Background graphics* checkbox is off by default in Chromium. An
// `<svg>` full of `<path>` elements is foreground content. It prints, it prints
// sharp, and it survives the setting nobody remembers to change.

import { getStroke } from 'perfect-freehand';
import { DEFAULTS, type Drawing, type Point, type Shape } from './model';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * The overlay for one element.
 *
 * `viewBox="0 0 100 100"` with `preserveAspectRatio="none"` means the shapes are
 * drawn in percentages and stretched to whatever the element turns out to be.
 * That is the whole trick behind a drawing that stays put when the page reflows
 * and when the print sheet is a different width from the screen.
 */
export function overlayNode(
  doc: Document,
  drawing: Drawing,
  forPrint = false,
  /**
   * The host's pixel size.
   *
   * Only the pen needs it, and it needs it badly. Every other shape is stroked,
   * and `vector-effect: non-scaling-stroke` opts those out of the viewBox's
   * uneven stretch. A pen stroke is a *filled* outline — that is what lets its
   * width vary — and a fill cannot opt out. Drawn in viewBox units on a 900×40
   * heading, a 3px nib comes out 27px across and 0.13px tall.
   *
   * So the outline is computed in real pixels and mapped back. Absent, the box
   * is assumed square, which is right for a sheet-sized host and wrong-looking
   * for a wide one.
   */
  size?: { width: number; height: number }
): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'prjs-drawing');
  if (!forPrint) svg.setAttribute('data-prjs-ui', '');
  svg.setAttribute(
    'style',
    'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible;'
  );

  for (const shape of drawing.shapes) {
    const node = shapeNode(doc, shape, size);
    if (node) svg.appendChild(node);
  }
  return svg;
}

/** Percentages, because the viewBox is 100 wide and 100 tall. */
function pct(p: Point): [number, number] {
  return [p.x * 100, p.y * 100];
}

/**
 * One shape.
 *
 * Stroke widths are in `viewBox` units, which are not square: the box is
 * stretched to the element. `vector-effect: non-scaling-stroke` opts the stroke
 * out of that transform, so a 3px line is 3px whatever shape the element is.
 * Without it, a wide short element draws horizontal strokes thin and vertical
 * ones fat.
 */
function shapeNode(
  doc: Document,
  shape: Shape,
  size?: { width: number; height: number }
): SVGElement | null {
  const [first] = shape.points;
  if (!first) return null;
  const last = shape.points[shape.points.length - 1]!;

  const stroke = (el: SVGElement): SVGElement => {
    el.setAttribute('stroke', shape.color || DEFAULTS.color);
    el.setAttribute('stroke-width', String(shape.width || DEFAULTS.width));
    el.setAttribute('stroke-linecap', 'round');
    el.setAttribute('stroke-linejoin', 'round');
    el.setAttribute('fill', 'none');
    el.setAttribute('vector-effect', 'non-scaling-stroke');
    if (shape.opacity < 1) el.setAttribute('opacity', String(shape.opacity));
    return el;
  };

  switch (shape.kind) {
    case 'pen': {
      // a filled outline, not a stroked line: that is what lets the width vary
      // along the stroke, thinning where the hand moved fast and tapering at
      // both ends. `getStroke` computes the outline; we only fill it.
      const path = doc.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', inkData(shape, size));
      path.setAttribute('fill', shape.color || DEFAULTS.color);
      path.setAttribute('stroke', 'none');
      path.setAttribute('fill-rule', 'nonzero');
      if (shape.opacity < 1) path.setAttribute('opacity', String(shape.opacity));
      return path;
    }

    case 'highlight': {
      // a highlighter is a flat nib: constant width, square ends, and multiply
      // so the words underneath stay readable. running it through getStroke
      // would taper it, which is not what a highlighter does.
      const path = doc.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', pathData(shape.points));
      stroke(path);
      path.setAttribute('style', 'mix-blend-mode:multiply');
      path.setAttribute('stroke-linecap', 'butt');
      return path;
    }

    case 'image': {
      if (!shape.href) return null;
      const img = doc.createElementNS(SVG_NS, 'image');
      const [x1, y1] = pct(first);
      const [x2, y2] = pct(last);
      img.setAttribute('x', String(Math.min(x1, x2)));
      img.setAttribute('y', String(Math.min(y1, y2)));
      img.setAttribute('width', String(Math.abs(x2 - x1)));
      img.setAttribute('height', String(Math.abs(y2 - y1)));
      img.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      // href, not xlink:href: the latter is deprecated and Chromium's print
      // renderer already ignores it
      img.setAttribute('href', shape.href);
      if (shape.opacity < 1) img.setAttribute('opacity', String(shape.opacity));
      return img;
    }

    case 'line':
    case 'arrow': {
      const group = doc.createElementNS(SVG_NS, 'g');
      const line = doc.createElementNS(SVG_NS, 'line');
      const [x1, y1] = pct(first);
      const [x2, y2] = pct(last);
      line.setAttribute('x1', String(x1));
      line.setAttribute('y1', String(y1));
      line.setAttribute('x2', String(x2));
      line.setAttribute('y2', String(y2));
      group.appendChild(stroke(line));

      if (shape.kind === 'arrow') {
        // the head is drawn rather than markered: a <marker> needs a <defs> with
        // a unique id per colour, and ids do not survive being cloned into a
        // print document beside another copy of themselves
        const head = doc.createElementNS(SVG_NS, 'path');
        head.setAttribute('d', arrowHead(x1, y1, x2, y2, (shape.width || DEFAULTS.width) * 1.4));
        stroke(head);
        head.setAttribute('fill', shape.color || DEFAULTS.color);
        head.setAttribute('stroke', 'none');
        group.appendChild(head);
      }
      return group;
    }

    case 'rect': {
      const rect = doc.createElementNS(SVG_NS, 'rect');
      const [x1, y1] = pct(first);
      const [x2, y2] = pct(last);
      rect.setAttribute('x', String(Math.min(x1, x2)));
      rect.setAttribute('y', String(Math.min(y1, y2)));
      rect.setAttribute('width', String(Math.abs(x2 - x1)));
      rect.setAttribute('height', String(Math.abs(y2 - y1)));
      return stroke(rect);
    }

    case 'ellipse': {
      const ellipse = doc.createElementNS(SVG_NS, 'ellipse');
      const [x1, y1] = pct(first);
      const [x2, y2] = pct(last);
      ellipse.setAttribute('cx', String((x1 + x2) / 2));
      ellipse.setAttribute('cy', String((y1 + y2) / 2));
      ellipse.setAttribute('rx', String(Math.abs(x2 - x1) / 2));
      ellipse.setAttribute('ry', String(Math.abs(y2 - y1) / 2));
      return stroke(ellipse);
    }

    case 'text': {
      const text = doc.createElementNS(SVG_NS, 'text');
      const [x, y] = pct(first);
      text.setAttribute('x', String(x));
      text.setAttribute('y', String(y));
      text.setAttribute('fill', shape.color || DEFAULTS.color);
      text.setAttribute('dominant-baseline', 'hanging');
      // the font must not stretch with the viewBox either
      text.setAttribute(
        'style',
        'font:' +
          (shape.size || DEFAULTS.size) +
          'px system-ui,-apple-system,sans-serif;' +
          'transform-box:fill-box;'
      );
      text.setAttribute('font-size', String(shape.size || DEFAULTS.size));
      text.setAttribute('lengthAdjust', 'spacingAndGlyphs');
      text.textContent = shape.text || '';
      if (shape.opacity < 1) text.setAttribute('opacity', String(shape.opacity));
      return text;
    }

    default:
      return null;
  }
}

/**
 * A smooth path through the traced points.
 *
 * Quadratic segments between midpoints: each recorded point becomes a control
 * point rather than a vertex, so a hand-drawn circle comes out as a curve
 * instead of a polygon. Two points or fewer are a straight line, because there
 * is nothing to smooth.
 */
export function pathData(points: Point[]): string {
  if (!points.length) return '';
  const [x0, y0] = pct(points[0]!);
  if (points.length === 1) return `M ${x0} ${y0} L ${x0} ${y0}`;
  if (points.length === 2) {
    const [x1, y1] = pct(points[1]!);
    return `M ${x0} ${y0} L ${x1} ${y1}`;
  }

  let d = `M ${x0} ${y0}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [cx, cy] = pct(points[i]!);
    const [nx, ny] = pct(points[i + 1]!);
    d += ` Q ${cx} ${cy} ${(cx + nx) / 2} ${(cy + ny) / 2}`;
  }
  const [lx, ly] = pct(points[points.length - 1]!);
  return d + ` L ${lx} ${ly}`;
}

/**
 * The outline of a real pen stroke, as a path.
 *
 * `getStroke` works in whatever units it is given, and the viewBox is 100 wide
 * and 100 tall regardless of the element's shape — so a size in viewBox units
 * would be an ellipse on anything that is not square. The trace is scaled to a
 * square 1000-unit space, stroked there, and the result mapped back; the overlay
 * then stretches it with everything else.
 */
export function inkData(shape: Shape, size?: { width: number; height: number }): string {
  // real pixels where we know them, a square guess where we do not
  const w = size?.width || 1000;
  const h = size?.height || 1000;

  const trace = shape.points.map((p) => [p.x * w, p.y * h, p.p ?? 0.5] as [number, number, number]);

  const outline = getStroke(trace, {
    size: (shape.width || DEFAULTS.width) * 2.4,
    thinning: 0.62,
    smoothing: 0.5,
    streamline: 0.42,
    simulatePressure: !shape.points.some((p) => p.p !== undefined),
    last: true,
    start: { taper: 0, cap: true },
    end: { taper: 0, cap: true }
  });

  if (!outline.length) return '';

  // back to percentages, which is what the viewBox is in. the two axes divide by
  // different numbers, which is precisely the stretch being undone.
  const at = (pt: number[]): string =>
    ((pt[0]! / w) * 100).toFixed(3) + ' ' + ((pt[1]! / h) * 100).toFixed(3);

  let d = 'M ' + at(outline[0]!);
  for (let i = 1; i < outline.length; i++) d += ' L ' + at(outline[i]!);
  return d + ' Z';
}

/** A filled triangle at the far end of a line, pointing the way it goes. */
function arrowHead(x1: number, y1: number, x2: number, y2: number, size: number): string {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const spread = Math.PI / 7;
  const ax = x2 - size * Math.cos(angle - spread);
  const ay = y2 - size * Math.sin(angle - spread);
  const bx = x2 - size * Math.cos(angle + spread);
  const by = y2 - size * Math.sin(angle + spread);
  return `M ${x2} ${y2} L ${ax} ${ay} L ${bx} ${by} Z`;
}

/**
 * Puts the overlay on an element, replacing any it already had.
 *
 * The host needs a positioning context for the overlay to sit in. `static` is
 * the only value that does not provide one, so it is the only one changed, and
 * the previous value is recorded so removing the drawing leaves the element as
 * it was found.
 */
export function mountOverlay(el: HTMLElement, drawing: Drawing): SVGSVGElement | null {
  const doc = el.ownerDocument;
  el.querySelector(':scope > .prjs-drawing')?.remove();
  if (!drawing.shapes.length) return null;

  const win = doc.defaultView;
  if (win && win.getComputedStyle(el).position === 'static') {
    if (!el.hasAttribute('data-prjs-was-static')) el.setAttribute('data-prjs-was-static', '');
    el.style.position = 'relative';
  }

  const box = el.getBoundingClientRect();
  const svg = overlayNode(doc, drawing, false, { width: box.width, height: box.height });
  el.appendChild(svg);

  // a pen stroke's outline was computed against the box it was drawn in, so a
  // host that changes shape needs it computed again. the other shapes do not
  // care, and re-rendering all of them is cheaper than tracking which do.
  if (
    win &&
    typeof win.ResizeObserver === 'function' &&
    drawing.shapes.some((s) => s.kind === 'pen')
  ) {
    const watch = new win.ResizeObserver(() => {
      const next = el.getBoundingClientRect();
      if (!next.width || !next.height) return;
      const fresh = overlayNode(doc, drawing, false, { width: next.width, height: next.height });
      el.querySelector(':scope > .prjs-drawing')?.replaceWith(fresh);
    });
    watch.observe(el);
    observers.get(el)?.disconnect();
    observers.set(el, watch);
  }
  return svg;
}

/** One per host, so remounting does not leave the last observer running. */
const observers = new WeakMap<HTMLElement, ResizeObserver>();

/** Takes the overlay off, and puts `position` back if we were the one who set it. */
export function unmountOverlay(el: HTMLElement): void {
  observers.get(el)?.disconnect();
  observers.delete(el);
  el.querySelector(':scope > .prjs-drawing')?.remove();
  if (el.hasAttribute('data-prjs-was-static')) {
    el.style.position = '';
    el.removeAttribute('data-prjs-was-static');
  }
}
