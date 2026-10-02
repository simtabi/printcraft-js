// What a drawing is.
//
// Vectors, not pixels. A raster overlay would be the easy version and it would
// be wrong twice over: it prints at screen resolution onto paper that has four
// times as much, and it cannot be edited once drawn. Shapes serialise to a few
// hundred bytes, scale to whatever the sheet turns out to be, and can be undone.
//
// Every coordinate is a fraction of the element it belongs to, from 0 to 1. That
// is what lets a circle drawn around a total on a 1440px screen still be around
// that total on a 794px sheet, and still be there after the sidebar collapses.

export type ShapeKind =
  'pen' | 'highlight' | 'line' | 'arrow' | 'rect' | 'ellipse' | 'text' | 'image';

/**
 * A point, as a fraction of the annotated element's box.
 *
 * `p` is pen pressure where the pointer reports it, 0–1. A mouse reports 0.5 for
 * every point, which is why the stroke also thins with speed: without one of the
 * two a freehand line is a constant-width tube, and that is what a drawing tool
 * is not supposed to look like.
 */
export interface Point {
  x: number;
  y: number;
  p?: number;
}

export interface Shape {
  id: string;
  kind: ShapeKind;
  /** pen and highlight use every point; the rest use the first and the last */
  points: Point[];
  color: string;
  /** stroke width in css pixels at the size it was drawn */
  width: number;
  opacity: number;
  /** `text` only */
  text?: string;
  /** `text` only: font size in css pixels at the size it was drawn */
  size?: number;
  /** `image` only: a data uri. never a remote url — see the studio. */
  href?: string;
}

export interface Drawing {
  /** bumped when the shape format changes, so an old one can be migrated */
  v: number;
  shapes: Shape[];
}

export const DRAWING_VERSION = 1;

export const DEFAULTS = {
  color: '#dc2626',
  width: 3,
  opacity: 1,
  size: 16
} as const;

/** Shapes drawn from two corners rather than a traced path. */
const TWO_POINT: ReadonlySet<ShapeKind> = new Set(['line', 'arrow', 'rect', 'ellipse', 'text']);

export function isTwoPoint(kind: ShapeKind): boolean {
  return TWO_POINT.has(kind);
}

let counter = 0;

/** Short, unique within a page, and stable enough to key an undo against. */
export function shapeId(): string {
  counter += 1;
  return 's' + counter.toString(36) + Math.random().toString(36).slice(2, 6);
}

/* serialising ------------------------------------------------------------- */

/** Rounds to three places: sub-pixel on any sheet, and a third of the bytes. */
function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function serialise(drawing: Drawing): string {
  return JSON.stringify({
    v: drawing.v,
    shapes: drawing.shapes.map((s) => ({
      ...s,
      points: s.points.map((p) =>
        p.p === undefined
          ? { x: round(p.x), y: round(p.y) }
          : { x: round(p.x), y: round(p.y), p: Math.round(p.p * 100) / 100 }
      )
    }))
  });
}

/**
 * Reads a stored drawing back.
 *
 * Anything unreadable becomes an empty drawing rather than an exception. A
 * corrupt attribute should cost its own annotations, not the page's ability to
 * print.
 */
export function parse(raw: string | null | undefined): Drawing {
  if (!raw) return { v: DRAWING_VERSION, shapes: [] };
  try {
    const value = JSON.parse(raw) as Partial<Drawing>;
    if (!value || !Array.isArray(value.shapes)) return { v: DRAWING_VERSION, shapes: [] };
    return { v: value.v || DRAWING_VERSION, shapes: value.shapes.filter(isShape) };
  } catch {
    return { v: DRAWING_VERSION, shapes: [] };
  }
}

function isShape(value: unknown): value is Shape {
  const s = value as Partial<Shape>;
  return (
    !!s &&
    typeof s.kind === 'string' &&
    Array.isArray(s.points) &&
    s.points.length > 0 &&
    s.points.every((p) => typeof p?.x === 'number' && typeof p?.y === 'number')
  );
}

/* geometry ---------------------------------------------------------------- */

/**
 * A pointer position as a fraction of a box, clamped to it.
 *
 * `pressure` is passed through when the device reports one. A mouse reports 0.5
 * for every point and a finger usually reports 0 or 1, so a value that never
 * varies is dropped rather than stored — `getStroke` then simulates pressure
 * from speed, which is the better guess for those devices.
 */
export function toFraction(
  clientX: number,
  clientY: number,
  box: DOMRect,
  pressure?: number
): Point {
  const x = box.width ? (clientX - box.left) / box.width : 0;
  const y = box.height ? (clientY - box.top) / box.height : 0;
  const point: Point = { x: x < 0 ? 0 : x > 1 ? 1 : x, y: y < 0 ? 0 : y > 1 ? 1 : y };
  if (pressure !== undefined) point.p = pressure;
  return point;
}

/**
 * Drops points that add nothing.
 *
 * A pointer at 120Hz over two seconds is 240 points, most of them a pixel apart.
 *
 * The tolerance is deliberately tighter than it was. This used to run at 0.002 —
 * a fifth of a percent of the element, which on a 900px column is nearly two
 * pixels — and then the survivors were joined with quadratic curves. Between
 * them those two steps flattened everything: a quick loop came out an oval, and
 * a deliberate wobble came out straight. `getStroke` wants the real trace and
 * does its own smoothing, so this now only removes points the pointer repeated
 * without moving.
 */
export function simplify(points: Point[], tolerance = 0.0004): Point[] {
  if (points.length < 3) return points;

  const out: Point[] = [points[0]!];
  for (let i = 1; i < points.length - 1; i++) {
    const last = out[out.length - 1]!;
    const p = points[i]!;
    if (Math.abs(p.x - last.x) > tolerance || Math.abs(p.y - last.y) > tolerance) out.push(p);
  }
  out.push(points[points.length - 1]!);
  return out;
}

/** The box a shape occupies, in fractions. Used to hit-test and to describe it. */
export function bounds(shape: Shape): { x: number; y: number; width: number; height: number } {
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;

  for (const p of shape.points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** A readable one-liner, for the notes panel and the notes page. */
export function describeShape(shape: Shape): string {
  if (shape.kind === 'text') return '“' + (shape.text || '') + '”';
  const names: Record<ShapeKind, string> = {
    pen: 'a freehand mark',
    highlight: 'a highlight',
    line: 'a line',
    arrow: 'an arrow',
    rect: 'a box',
    ellipse: 'a circle',
    text: 'text',
    image: 'an image'
  };
  return names[shape.kind];
}
