// Marking every page.
//
// The old watermark was one `position: fixed` element on the body. Measured on a
// 5089px document: box 794×1123, so it marked the first page and nothing else,
// and under pagination it sat outside `.pc-pages` entirely, belonging to no
// sheet at all. Six sheets, one mark.
//
// Two constraints shape the rebuild. First, `position: fixed` prints on the
// first page only in Chromium, so a mark on every page needs sheets to attach
// to, which means pagination. Second, the browser's "Background graphics"
// checkbox is off by default, so anything drawn as a CSS background does not
// print at all. The mark has to be a real element, and it is: an `<svg>` or an
// `<img>`, laid into each sheet.

import { toPx } from './sheets';
import { escapeHtml } from '../support';
import type { ResolvedWatermark, Watermark, WatermarkPosition } from '../types';

/** Roughly how wide a glyph is, as a fraction of its size. Only sets the box's aspect. */
const GLYPH_RATIO = 0.62;
const LINE_RATIO = 1.25;

const DEFAULTS: ResolvedWatermark = {
  text: null,
  image: null,
  position: 'center',
  repeat: 'first-page',
  tile: { gap: '10%', stagger: true },
  size: '55%',
  rotate: -30,
  opacity: 0.25,
  color: '#17181b',
  font: 'sans-serif',
  weight: '700',
  layer: 'over',
  margin: '10mm'
};

const POSITIONS = new Set<WatermarkPosition>([
  'center',
  'top-left',
  'top-center',
  'top-right',
  'middle-left',
  'middle-right',
  'bottom-left',
  'bottom-center',
  'bottom-right'
]);

interface LegacyWatermark {
  watermarkText?: string | null;
  watermarkImageURL?: string | null;
  watermarkOpacity?: number;
  watermarkAngle?: number;
  watermark?: Watermark | string | null;
}

/**
 * One watermark from whichever options were given, or null for no mark.
 *
 * `watermarkText` and friends predate the object form and still work; anything
 * set on `watermark` wins, so moving across is one key at a time rather than all
 * at once.
 */
export function resolveWatermark(options: LegacyWatermark): ResolvedWatermark | null {
  const given = options.watermark;
  const from: Watermark = typeof given === 'string' ? { text: given } : given || {};

  const text = from.text ?? options.watermarkText ?? null;
  const image = from.image ?? options.watermarkImageURL ?? null;
  if (!text && !image) return null;

  const position =
    from.position && (typeof from.position === 'object' || POSITIONS.has(from.position))
      ? from.position
      : DEFAULTS.position;

  return {
    text,
    image,
    position,
    repeat: from.repeat ?? DEFAULTS.repeat,
    tile: {
      gap: from.tile?.gap ?? DEFAULTS.tile.gap,
      stagger: from.tile?.stagger ?? DEFAULTS.tile.stagger
    },
    size: sizeToCss(from.size) ?? DEFAULTS.size,
    rotate: from.rotate ?? options.watermarkAngle ?? DEFAULTS.rotate,
    opacity: clamp01(from.opacity ?? options.watermarkOpacity ?? DEFAULTS.opacity),
    color: from.color ?? DEFAULTS.color,
    font: from.font ?? DEFAULTS.font,
    weight: String(from.weight ?? DEFAULTS.weight),
    layer: from.layer ?? DEFAULTS.layer,
    margin: from.margin ?? DEFAULTS.margin
  };
}

/** True when the mark cannot be drawn without sheets to draw it on. */
export function needsPages(wm: ResolvedWatermark | null): boolean {
  return !!wm && (wm.repeat === 'every-page' || wm.repeat === 'tile');
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, Number(n) || 0));
}

function sizeToCss(size: string | number | undefined): string | null {
  if (size == null || size === '') return null;
  return typeof size === 'number' ? size + 'px' : String(size);
}

/** A css length or percentage as pixels, against a reference width. */
function toPixels(value: string, reference: number): number {
  const trimmed = String(value).trim();
  if (trimmed.endsWith('%')) return (parseFloat(trimmed) / 100) * reference;
  return toPx(trimmed) ?? reference * 0.55;
}

/* the mark itself -------------------------------------------------------- */

/**
 * One mark, sized to `width` css pixels.
 *
 * Text becomes an SVG rather than a styled `<div>` so the result is exactly the
 * width asked for. `textLength` makes the glyphs fill the box whatever the font
 * turns out to be, which means no measuring and no surprise when a font falls
 * back.
 */
function markNode(wm: ResolvedWatermark, doc: Document, width: number): Element {
  if (wm.image) {
    const img = doc.createElement('img');
    img.src = wm.image;
    img.alt = '';
    img.setAttribute('style', 'display:block;width:' + Math.round(width) + 'px;height:auto;');
    return img;
  }

  const text = wm.text || '';
  const boxWidth = Math.max(1, Math.round(text.length * 100 * GLYPH_RATIO));
  const boxHeight = Math.round(100 * LINE_RATIO);
  const height = Math.round((width * boxHeight) / boxWidth);

  const holder = doc.createElement('div');
  holder.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="' +
    Math.round(width) +
    '" height="' +
    height +
    '" viewBox="0 0 ' +
    boxWidth +
    ' ' +
    boxHeight +
    '" style="display:block">' +
    '<text x="' +
    boxWidth / 2 +
    '" y="' +
    boxHeight / 2 +
    '" font-size="100" font-family="' +
    escapeHtml(wm.font) +
    '" font-weight="' +
    escapeHtml(wm.weight) +
    '" fill="' +
    escapeHtml(wm.color) +
    '" text-anchor="middle" dominant-baseline="central" textLength="' +
    boxWidth +
    '" lengthAdjust="spacingAndGlyphs">' +
    escapeHtml(text) +
    '</text></svg>';

  return holder.firstElementChild!;
}

/** Where a single mark sits inside its sheet, as inline css. */
function placement(wm: ResolvedWatermark): string {
  const spin = 'rotate(' + wm.rotate + 'deg)';
  const inset = wm.margin;

  if (typeof wm.position === 'object') {
    return (
      'left:' +
      wm.position.x +
      ';top:' +
      wm.position.y +
      ';transform:translate(-50%,-50%) ' +
      spin +
      ';'
    );
  }

  if (wm.position === 'center') {
    return 'left:50%;top:50%;transform:translate(-50%,-50%) ' + spin + ';';
  }

  const [row, column] = wm.position.split('-') as ['top' | 'middle' | 'bottom', string];
  const parts: string[] = [];
  const shift: string[] = [];

  if (row === 'top') parts.push('top:' + inset);
  else if (row === 'bottom') parts.push('bottom:' + inset);
  else {
    parts.push('top:50%');
    shift.push('translateY(-50%)');
  }

  if (column === 'left') parts.push('left:' + inset);
  else if (column === 'right') parts.push('right:' + inset);
  else {
    parts.push('left:50%');
    shift.push('translateX(-50%)');
  }

  return parts.join(';') + ';transform:' + shift.concat(spin).join(' ') + ';';
}

export interface MarkTarget {
  /** the box the mark is positioned against, in css pixels */
  width: number;
  height: number;
}

/**
 * The watermark layer for one sheet, ready to append.
 *
 * Returns a positioned element covering the whole sheet, holding either a single
 * mark or a tiled grid of them. The caller decides where it goes; this decides
 * what it looks like.
 */
export function buildWatermarkLayer(
  wm: ResolvedWatermark,
  doc: Document,
  target: MarkTarget
): Element {
  const layer = doc.createElement('div');
  layer.className = 'pc-watermark';
  layer.setAttribute('data-pc-watermark', wm.repeat);
  layer.setAttribute('aria-hidden', 'true');

  const width = toPixels(wm.size, target.width);

  if (wm.repeat === 'tile') {
    const gap = toPixels(wm.tile.gap, target.width);
    const step = Math.max(24, width + gap);
    // a rotated mark reaches past its own box, so the grid starts outside the
    // sheet and ends past it. anything less leaves bare corners.
    const columns = Math.ceil(target.width / step) + 2;
    const rows = Math.ceil(target.height / step) + 2;

    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const nudge = wm.tile.stagger && row % 2 === 1 ? step / 2 : 0;
        const cell = doc.createElement('div');
        cell.setAttribute(
          'style',
          'position:absolute;left:' +
            Math.round(column * step - step + nudge) +
            'px;top:' +
            Math.round(row * step - step) +
            'px;transform:rotate(' +
            wm.rotate +
            'deg);transform-origin:center;'
        );
        cell.appendChild(markNode(wm, doc, width));
        layer.appendChild(cell);
      }
    }
    return layer;
  }

  const single = doc.createElement('div');
  single.setAttribute('style', 'position:absolute;' + placement(wm));
  single.appendChild(markNode(wm, doc, width));
  layer.appendChild(single);
  return layer;
}

/**
 * The stylesheet the layer needs.
 *
 * Opacity lives here rather than on each mark so a tiled grid of two hundred
 * copies does not create two hundred stacking contexts.
 */
export function watermarkCss(wm: ResolvedWatermark): string {
  const behind = wm.layer === 'behind';
  return [
    '.pc-watermark {',
    '  position: absolute;',
    '  inset: 0;',
    '  overflow: hidden;',
    '  pointer-events: none;',
    '  opacity: ' + wm.opacity + ';',
    '  z-index: ' + (behind ? '0' : '5') + ';',
    '}',
    // the sheet has to establish a containing block, or the layer escapes to the
    // page box and we are back to marking one page
    '.pc-page-sheet, .pc-watermark-host { position: relative; }',
    behind
      ? '.pc-page-inner, .pc-watermark-host > :not(.pc-watermark) { position: relative; z-index: 1; }'
      : ''
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * The unpaginated fallback: `position: fixed`, which browsers paint on the first
 * page. Anything more needs sheets, which is why `repeat` turns pagination on.
 */
export function firstPageCss(wm: ResolvedWatermark): string {
  return [
    '.pc-watermark {',
    '  position: fixed;',
    '  inset: 0;',
    '  overflow: hidden;',
    '  pointer-events: none;',
    '  opacity: ' + wm.opacity + ';',
    '  z-index: ' + (wm.layer === 'behind' ? '0' : '2147483647') + ';',
    '}'
  ].join('\n');
}
