// Printing a selected region as pixels rather than as markup.
//
// A clipped region cannot survive being re-laid-out at paper width, and the
// browser does exactly that when pagination starts. So for `clipMode: 'capture'`
// the region is rendered to an image at the layout it was chosen against, and the
// image is what goes on the page. What you selected is what prints.
//
// The raster is taken from the *transformed* clone, so redaction, exclusions and
// the sanitiser all apply before a single pixel is drawn.

import { resolveSheet } from '../production/sheets';
import type { ClipRect, ResolvedOptions } from '../types';
import { fail } from '../support/errors';

export interface CaptureResult {
  element: Element;
  width: number;
  height: number;
  skipped: string[];
}

/**
 * Renders the clip clone to an `<img>` sized to fit the sheet.
 *
 * The clone has to be in a document to be measured and painted, so it is parked
 * off-screen at its natural size for the length of the capture and taken away
 * again afterwards.
 */
export async function captureRegion(
  clone: Element,
  rect: ClipRect,
  options: ResolvedOptions,
  doc: Document
): Promise<CaptureResult> {
  const stage = doc.createElement('div');
  stage.setAttribute('data-pc-ui', '');
  stage.setAttribute(
    'style',
    'position:fixed;left:-20000px;top:0;width:' + rect.width + 'px;height:' + rect.height + 'px;'
  );
  stage.appendChild(clone);
  (doc.body || doc.documentElement).appendChild(stage);

  try {
    // loaded on demand: a job that never captures should not pay for it
    const { rasterize } = await import('../share/rasterize');
    const raster = await rasterize(clone, {
      width: rect.width,
      height: rect.height,
      // 2x keeps text crisp on paper, where 96dpi css pixels are coarse
      scale: Math.max(2, doc.defaultView?.devicePixelRatio || 1),
      background: '#ffffff',
      assetTimeout: options.assetTimeout
    });

    const sheet = resolveSheet(options.setPrintSize);
    const scale = Math.min(1, sheet.width / rect.width);

    const img = doc.createElement('img');
    img.src = raster.dataUrl;
    img.className = 'pc-capture';
    img.setAttribute('alt', options.documentTitle || 'Captured region');
    img.setAttribute('width', String(Math.round(rect.width * scale)));
    img.setAttribute('height', String(Math.round(rect.height * scale)));
    img.setAttribute('style', 'display:block;max-width:100%;height:auto;');

    return {
      element: img,
      width: Math.round(rect.width * scale),
      height: Math.round(rect.height * scale),
      skipped: raster.skipped
    };
  } catch (e) {
    fail(
      'PC_RASTERIZE_FAILED',
      'could not capture the selected region: ' +
        (e instanceof Error ? e.message : String(e)) +
        '. Use clipMode: "reflow" to print live markup instead.'
    );
  } finally {
    stage.remove();
  }
}
