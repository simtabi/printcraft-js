// Saving what would print, as an image.
//
// The important detail is where the pixels come from. A screenshot taken of the
// live page would put back everything redaction was asked to destroy, so this
// runs the ordinary pipeline (clone, exclude, redact, sanitise) and rasterises
// the result. What you get is the print copy, photographed.

import { rasterize, type Raster } from './rasterize';
import type { ClipRect, Env, PrintcraftOptions } from '../types';
import { fail } from '../support/errors';

export interface ScreenshotOptions extends PrintcraftOptions {
  type?: 'image/png' | 'image/jpeg' | 'image/webp';
  quality?: number;
  /** device pixels per css pixel. 2 by default, so text survives being printed. */
  scale?: number;
  /** painted behind the content; white by default, since paper is not transparent */
  background?: string;
  /** part of the result to keep */
  clip?: ClipRect;
  /** css pixels the content lays out against; its own box by default */
  width?: number;
  height?: number;
  /** save it with this name. omit to get the blob back without a download. */
  download?: string | boolean;
}

export interface Screenshot extends Raster {
  /** assets that could not be inlined, usually cross-origin without CORS */
  skipped: string[];
}

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp'
};

/** Turns a title into something a filesystem will accept. */
function filenameFor(name: string | true | undefined, title: string, type: string): string {
  if (typeof name === 'string' && name) return name;
  const base =
    (title || 'printcraft')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'printcraft';
  return base + '.' + (EXTENSIONS[type] || 'png');
}

/** Hands a blob to the browser's downloader and cleans up after it. */
export function saveBlob(blob: Blob, filename: string, env: Env): void {
  const url = URL.createObjectURL(blob);
  const link = env.document.createElement('a');
  link.href = url;
  link.download = filename;
  link.setAttribute('data-pc-ui', '');
  env.document.body.appendChild(link);
  link.click();
  link.remove();
  // revoked on a timer rather than immediately: some browsers have not finished
  // reading the blob when click() returns
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Renders the job to an image.
 *
 * `render` is the pipeline's own assemble step, injected so this file does not
 * import the job and the job does not import this one.
 */
export async function screenshot(
  render: (
    options: PrintcraftOptions,
    env?: Env
  ) => Promise<{ element: Element; title: string; width: number }>,
  options: ScreenshotOptions = {},
  env?: Env
): Promise<Screenshot> {
  const scope = env || { document, window };
  const type = options.type || 'image/png';

  const { element, title, width } = await render(options, scope);

  // A detached element has no layout, so measuring it gives zero and the raster
  // comes out 1px square. Park it off-screen at the width the content had, let
  // the browser lay it out, then take the picture and clear up.
  const stage = scope.document.createElement('div');
  stage.setAttribute('data-pc-ui', '');
  const layoutWidth = options.width ?? width;
  stage.setAttribute(
    'style',
    'position:fixed;left:-20000px;top:0;width:' + layoutWidth + 'px;background:#fff;'
  );
  stage.appendChild(element);
  (scope.document.body || scope.document.documentElement).appendChild(stage);

  try {
    const box = element.getBoundingClientRect();
    const raster = await rasterize(element, {
      width: layoutWidth,
      height: options.height ?? Math.max(1, Math.round(box.height)),
      scale: options.scale ?? 2,
      // jpeg has no alpha, so a transparent background comes out black
      background: options.background ?? '#ffffff',
      type,
      ...(options.quality == null ? {} : { quality: options.quality }),
      ...(options.clip ? { clip: options.clip } : {}),
      assetTimeout: options.assetTimeout ?? 8000
    });

    if (!raster.blob) fail('PC_RASTERIZE_FAILED', 'the screenshot produced no image');
    if (options.download) {
      saveBlob(
        raster.blob,
        filenameFor(options.download, options.documentTitle || title, type),
        scope
      );
    }
    return raster;
  } finally {
    stage.remove();
  }
}
