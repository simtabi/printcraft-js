// Page geometry: turning a `setPrintSize` string into real pixels.
//
// The print frame has to be laid out at the width the paper will be. Mount it at
// 0×0 and the cloned document gets a zero-width viewport, every media query
// collapses to its narrowest breakpoint, and the content reflows into something
// the user never saw. That is what made drawn print regions come out blank.

/** A sheet in CSS pixels, which are 1/96 inch by definition. */
export interface SheetSize {
  width: number;
  height: number;
  /** what we resolved it from, for logs and error messages */
  label: string;
}

const PX_PER_INCH = 96;
const MM_PER_INCH = 25.4;

/** The named sizes CSS Paged Media defines, in millimetres, portrait. */
const NAMED: Record<string, [number, number]> = {
  a3: [297, 420],
  a4: [210, 297],
  a5: [148, 210],
  a6: [105, 148],
  b4: [250, 353],
  b5: [176, 250],
  'jis-b4': [257, 364],
  'jis-b5': [182, 257],
  letter: [215.9, 279.4],
  legal: [215.9, 355.6],
  ledger: [279.4, 431.8],
  tabloid: [279.4, 431.8]
};

const UNITS: Record<string, number> = {
  px: 1,
  in: PX_PER_INCH,
  mm: PX_PER_INCH / MM_PER_INCH,
  cm: (PX_PER_INCH / MM_PER_INCH) * 10,
  q: PX_PER_INCH / MM_PER_INCH / 4,
  pt: PX_PER_INCH / 72,
  pc: PX_PER_INCH / 6
};

export const DEFAULT_SHEET: SheetSize = fromMm('a4', NAMED['a4']!);

/** `a4` reads badly in a preview chrome; `A4` and `Letter` do not. */
function displayName(key: string): string {
  if (/^(jis-)?[ab]\d$/.test(key)) return key.toUpperCase();
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function fromMm(label: string, [w, h]: [number, number]): SheetSize {
  return {
    width: Math.round((w * PX_PER_INCH) / MM_PER_INCH),
    height: Math.round((h * PX_PER_INCH) / MM_PER_INCH),
    label: displayName(label)
  };
}

/** One CSS length to pixels. Returns null for anything unrecognised. */
export function toPx(value: string): number | null {
  const m = /^(-?\d*\.?\d+)\s*([a-z]*)$/i.exec(value.trim());
  if (!m) return null;
  const n = Number(m[1]);
  if (!isFinite(n)) return null;
  const unit = (m[2] || 'px').toLowerCase();
  const factor = UNITS[unit];
  return factor === undefined ? null : n * factor;
}

/**
 * Resolves a `setPrintSize` value the same way `@page { size: … }` would.
 *
 * Accepts a named size (`A4`, `letter`), an orientation on its own or after a
 * name (`landscape`, `A4 landscape`), one length for a square page, or two
 * lengths (`210mm 297mm`). Anything it cannot read falls back to A4, because a
 * wrong-but-sane sheet prints and a thrown error does not.
 */
export function resolveSheet(setPrintSize?: string | null): SheetSize {
  if (!setPrintSize) return DEFAULT_SHEET;

  const parts = String(setPrintSize).trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!parts.length || parts[0] === 'auto') return DEFAULT_SHEET;

  let landscape = false;
  const rest: string[] = [];
  for (const part of parts) {
    if (part === 'landscape') landscape = true;
    else if (part === 'portrait') landscape = false;
    else rest.push(part);
  }

  let sheet = DEFAULT_SHEET;

  if (rest.length === 1 && NAMED[rest[0]!]) {
    sheet = fromMm(rest[0]!, NAMED[rest[0]!]!);
  } else if (rest.length === 1) {
    const side = toPx(rest[0]!);
    if (side) sheet = { width: Math.round(side), height: Math.round(side), label: rest[0]! };
  } else if (rest.length >= 2) {
    const w = toPx(rest[0]!);
    const h = toPx(rest[1]!);
    if (w && h) {
      sheet = { width: Math.round(w), height: Math.round(h), label: rest[0] + ' ' + rest[1] };
    }
  }

  if (landscape && sheet.height > sheet.width) {
    sheet = { width: sheet.height, height: sheet.width, label: sheet.label + ' landscape' };
  }
  return sheet;
}
