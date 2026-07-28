// Working out how much room there is on a sheet.
//
// The sheet is the paper. Inside it sit, in order: the margin the browser would
// otherwise draw its own headers into, our border, our padding, and finally the
// content box that text actually flows through.

import { toPx } from '../../production/sheets';
import type { PageBorder, PagePadding, ResolvedOptions } from '../../types';
import { resolveSheet, type SheetSize } from '../../production/sheets';

export interface SheetBox {
  sheet: SheetSize;
  /** the four margins, in css pixels */
  margin: Sides;
  padding: Sides;
  border: { width: number; style: string; color: string; radius: string };
  /** what is left for content, after everything above */
  content: { width: number; height: number };
}

export interface Sides {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const ZERO: Sides = { top: 0, right: 0, bottom: 0, left: 0 };

/** Reads `18mm`, `10mm 20mm`, or `{ top, right, bottom, left }` into four numbers. */
export function toSides(value: PagePadding | string | null | undefined): Sides {
  if (value == null || value === '') return { ...ZERO };

  if (typeof value === 'object') {
    return {
      top: toPx(String(value.top ?? 0)) ?? 0,
      right: toPx(String(value.right ?? 0)) ?? 0,
      bottom: toPx(String(value.bottom ?? 0)) ?? 0,
      left: toPx(String(value.left ?? 0)) ?? 0
    };
  }

  // css shorthand order: one value is all four, two is vertical then horizontal,
  // three adds a separate bottom, four goes clockwise from the top
  const parts = String(value)
    .trim()
    .split(/\s+/)
    .map((p) => toPx(p) ?? 0);
  const [a = 0, b = a, c = a, d = b] = parts;
  if (parts.length === 1) return { top: a, right: a, bottom: a, left: a };
  if (parts.length === 2) return { top: a, right: b, bottom: a, left: b };
  if (parts.length === 3) return { top: a, right: b, bottom: c, left: b };
  return { top: a, right: b, bottom: c, left: d };
}

export function sidesToCss(sides: Sides): string {
  return `${sides.top}px ${sides.right}px ${sides.bottom}px ${sides.left}px`;
}

function resolveBorder(border: PageBorder | boolean | null | undefined): SheetBox['border'] {
  if (!border) return { width: 0, style: 'none', color: 'transparent', radius: '0' };
  const b = border === true ? {} : border;
  return {
    width: toPx(String(b.width ?? '1px')) ?? 1,
    style: b.style || 'solid',
    color: b.color || '#17181b',
    radius: b.radius || '0'
  };
}

/**
 * Everything the flow needs to know about one sheet.
 *
 * Reserves room for a per-page header and footer only when there is one, so a
 * page with neither uses its whole content box.
 */
export function measureSheet(
  options: ResolvedOptions,
  furniture: { header: boolean; footer: boolean; bandHeight?: number }
): SheetBox {
  const sheet = resolveSheet(options.setPrintSize);
  const margin = toSides(options.pageMargin);
  const padding = toSides(options.pagePadding);
  const border = resolveBorder(options.pageBorder);

  const band = furniture.bandHeight ?? 26;
  const bands = (furniture.header ? band : 0) + (furniture.footer ? band : 0);

  const width =
    sheet.width - margin.left - margin.right - border.width * 2 - padding.left - padding.right;
  const height =
    sheet.height -
    margin.top -
    margin.bottom -
    border.width * 2 -
    padding.top -
    padding.bottom -
    bands;

  return {
    sheet,
    margin,
    padding,
    border,
    content: { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) }
  };
}
