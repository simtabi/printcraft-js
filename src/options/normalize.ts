// filling in defaults, coercing list options to arrays, and validating.

import { assign, clamp, isElement, raise, toArray } from '../support';
import { normalizeMarks } from '../production/marks';
import { needsPages, resolveWatermark } from '../production/watermark';
import { DEFAULTS, defaultsRef } from './defaults';
import type { PrintcraftOptions, ResolvedOptions } from '../types';

/**
 * selectors are interpolated straight into a generated stylesheet, so a `}` (or a
 * comment opener) would close the rule and let arbitrary css through. valid css
 * selectors never contain these characters, so rejecting them costs nothing.
 */
const SELECTOR_INJECTION = /[{}<]|\/\*/;

function assertSafeSelectors(key: string, selectors: string[]): void {
  for (const sel of selectors) {
    if (typeof sel !== 'string') raise("'" + key + "' entries must be css selector strings");
    if (SELECTOR_INJECTION.test(sel)) {
      raise("'" + key + "' contains an illegal character in selector '" + sel + "'");
    }
  }
}

/** the one place the three surfaces converge on a validated options object. */
export function normalizeOptions(
  options: PrintcraftOptions | string | Element | null | undefined
): ResolvedOptions {
  let raw: PrintcraftOptions;
  if (typeof options === 'string' || isElement(options)) raw = { target: options };
  else raw = (options as PrintcraftOptions) || {};

  const o = assign({} as ResolvedOptions, DEFAULTS, defaultsRef.current, raw);

  if (o.removeInlineStyles) o.keepInlineStyles = false;
  if (!o.target && o.html == null && !o.clipRect) {
    raise("one of 'target', 'html', or 'clipRect' is required");
  }
  if (o.exposeLinkUrls && o.exposeLinkUrls !== 'all' && o.exposeLinkUrls !== 'external') {
    raise("'exposeLinkUrls' must be 'all' or 'external'");
  }
  if (o.watermarkOpacity != null) o.watermarkOpacity = clamp(o.watermarkOpacity, 0, 1);

  // One mark cannot cover pages that do not exist as elements: `position: fixed`
  // paints the first page and stops. So a repeating mark implies real sheets.
  // The job logs this, because switching pagination on changes the layout and
  // nobody should have to discover that from the output.
  o.watermark = resolveWatermark(o);
  if (needsPages(o.watermark) && !o.paginate) o.paginate = true;

  o.excludeSelectorList = toArray(o.excludeSelectorList);
  o.redactSelectorList = toArray(o.redactSelectorList);
  o.pageBreakBeforeSelectors = toArray(o.pageBreakBeforeSelectors);
  o.pageBreakAfterSelectors = toArray(o.pageBreakAfterSelectors);
  o.avoidBreakSelectors = toArray(o.avoidBreakSelectors);
  o.transforms = toArray(o.transforms);
  o.annotations = toArray(o.annotations);
  o.hooks = assign({}, o.hooks || {});
  o.printerMarks = normalizeMarks(o.printerMarks);

  assertSafeSelectors('pageBreakBeforeSelectors', o.pageBreakBeforeSelectors);
  assertSafeSelectors('pageBreakAfterSelectors', o.pageBreakAfterSelectors);
  assertSafeSelectors('avoidBreakSelectors', o.avoidBreakSelectors);

  if (o.clipRect) {
    const r = o.clipRect as unknown as Record<string, unknown>;
    for (const k of ['x', 'y', 'width', 'height']) {
      if (typeof r[k] !== 'number' || isNaN(r[k] as number)) {
        raise('clipRect needs numeric x, y, width, height');
      }
    }
    if (o.clipRect.width < 2 || o.clipRect.height < 2) raise('clipRect is too small to print');
    // clip jobs keep source css by default: layout fidelity is the entire point
    if (!('keepSourceCSS' in raw)) o.keepSourceCSS = true;
  }
  return o;
}
