// Turning a piece of the page into pixels.
//
// This exists because of a hard browser limit. At pagination time the engine
// re-evaluates media queries against the page box, not the window, so a region
// you selected against a 1280px layout is re-laid-out at 794px the instant
// printing begins and no longer frames what you drew a box around. Measured, not
// assumed: a `min-width: 1000px` rule that makes a block 3000px tall produces one
// A4 page, not four.
//
// A raster does not relayout. It is the only way to put on paper exactly what
// was on screen.
//
// The technique is an SVG `<foreignObject>` holding the cloned markup, loaded
// through an `<img>` and drawn to a canvas. The SVG is its own document, so its
// width is the viewport the clone lays out against, which is how the screen
// layout is preserved.

import type { ClipRect } from '../types';
import { fail } from '../support/errors';

export interface RasterizeOptions {
  /** css pixels; defaults to the element's own box */
  width?: number;
  height?: number;
  /**
   * Keep only this rectangle of the result, in css pixels relative to the top
   * left of the rendered area. The element still lays out at its full `width`,
   * so a crop is what you selected rather than a narrower relayout of it.
   */
  clip?: ClipRect;
  /** device pixels per css pixel. 2 gives a retina-sharp result. */
  scale?: number;
  /** painted behind the content. transparent by default for png. */
  background?: string;
  type?: 'image/png' | 'image/jpeg' | 'image/webp';
  quality?: number;
  /** extra css applied inside the raster only */
  style?: string;
  /**
   * Swap in a different renderer, such as modern-screenshot, when a page defeats
   * the foreignObject path. Receives the same element and options.
   */
  renderer?: (el: Element, options: RasterizeOptions) => Promise<Blob>;
  /** how long to wait for embedded assets before giving up on them */
  assetTimeout?: number;
}

export interface Raster {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
  /** assets that could not be inlined, usually cross-origin without CORS */
  skipped: string[];
  /**
   * Every sampled pixel came out the same colour, so the image carries no
   * content. Callers show this instead of a blank box the user has to
   * interpret. Undefined when the pixels could not be read back.
   */
  uniform?: boolean;
}

const XHTML = 'http://www.w3.org/1999/xhtml';
const SVG = 'http://www.w3.org/2000/svg';

/** Same-origin, or a scheme that carries its own bytes. */
function fetchable(url: string, base: string): boolean {
  if (/^(data|blob):/i.test(url)) return true;
  try {
    const resolved = new URL(url, base);
    return resolved.origin === new URL(base).origin;
  } catch {
    return false;
  }
}

async function toDataUrl(url: string, timeout: number): Promise<string | null> {
  if (/^data:/i.test(url)) return url;
  const controller = typeof AbortController === 'undefined' ? null : new AbortController();
  const timer = controller ? setTimeout(() => controller.abort(), timeout) : undefined;

  try {
    const res = await fetch(url, controller ? { signal: controller.signal } : undefined);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await readAsDataUrl(blob).catch(() => null);
  } catch {
    return null;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Every style rule that applies, as text.
 *
 * Cross-origin stylesheets throw on `cssRules`; those are reported as skipped
 * rather than silently producing an unstyled image.
 */
function collectCss(doc: Document, skipped: string[]): string {
  const out: string[] = [];
  for (const sheet of doc.styleSheets) {
    try {
      for (const rule of sheet.cssRules || []) out.push(rule.cssText);
    } catch {
      skipped.push(sheet.href || 'a cross-origin stylesheet');
    }
  }
  return out.join('\n');
}

/** Rewrites `url(...)` references inside css to data URIs. */
async function inlineCssUrls(
  css: string,
  base: string,
  timeout: number,
  skipped: string[]
): Promise<string> {
  const urls = new Set<string>();
  const pattern = /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(css))) {
    const url = match[1]!.trim();
    if (!/^data:/i.test(url)) urls.add(url);
  }

  // fetched together: a stylesheet can reference dozens of fonts and sprites,
  // and doing them one at a time makes a capture feel broken
  const fetched = await Promise.all(
    [...urls].map(async (url) => {
      if (!fetchable(url, base)) return [url, null] as const;
      return [url, await toDataUrl(new URL(url, base).href, timeout)] as const;
    })
  );

  for (const [url, dataUrl] of fetched) {
    if (dataUrl) css = css.split(url).join(dataUrl);
    else skipped.push(url);
  }
  return css;
}

/** Replaces every `<img>` source with a data URI so the raster is self-contained. */
async function inlineImages(
  root: Element,
  base: string,
  timeout: number,
  skipped: string[]
): Promise<void> {
  const images = [...root.querySelectorAll('img')];
  await Promise.all(
    images.map(async (img) => {
      const src = img.getAttribute('src');
      if (!src || /^data:/i.test(src)) return;
      if (!fetchable(src, base)) {
        skipped.push(src);
        img.removeAttribute('src');
        return;
      }
      const dataUrl = await toDataUrl(new URL(src, base).href, timeout);
      if (dataUrl) img.setAttribute('src', dataUrl);
      else {
        skipped.push(src);
        img.removeAttribute('src');
      }
      img.removeAttribute('srcset');
      img.removeAttribute('loading');
    })
  );
}

/** A canvas cannot be cloned; snapshot it to an image first. */
function flattenCanvases(live: Element, clone: Element): void {
  const from = [...live.querySelectorAll('canvas')];
  const to = [...clone.querySelectorAll('canvas')];
  for (let i = 0; i < from.length && i < to.length; i++) {
    const source = from[i] as HTMLCanvasElement;
    const target = to[i]!;
    let dataUrl = '';
    try {
      dataUrl = source.toDataURL('image/png');
    } catch {
      // tainted, so there is nothing we can legally read
      continue;
    }
    const img = clone.ownerDocument!.createElement('img');
    img.setAttribute('src', dataUrl);
    img.setAttribute('width', String(source.width));
    img.setAttribute('height', String(source.height));
    const style = target.getAttribute('style');
    if (style) img.setAttribute('style', style);
    target.parentNode?.replaceChild(img, target);
  }
}

/**
 * Renders `el` to an image.
 *
 * `el` may be attached or detached. When it is attached, its own box supplies the
 * default size and its live canvases are snapshotted; when detached, pass width
 * and height.
 */
export async function rasterize(el: Element, options: RasterizeOptions = {}): Promise<Raster> {
  if (options.renderer) {
    const blob = await options.renderer(el, options);
    return {
      blob,
      dataUrl: await blobToDataUrl(blob),
      width: options.width || 0,
      height: options.height || 0,
      skipped: []
    };
  }

  const doc = el.ownerDocument;
  if (!doc?.defaultView)
    fail('PC_RASTERIZE_FAILED', 'rasterize needs an element that belongs to a document');
  const view = doc.defaultView;
  const base = doc.baseURI;
  const timeout = options.assetTimeout ?? 8000;
  const skipped: string[] = [];

  const box = el.getBoundingClientRect();
  const width = Math.max(1, Math.round(options.width || box.width || 1));
  const height = Math.max(1, Math.round(options.height || box.height || 1));
  const scale = options.scale ?? view.devicePixelRatio ?? 1;

  const clone = el.cloneNode(true) as Element;
  flattenCanvases(el, clone);
  await inlineImages(clone, base, timeout, skipped);

  const css = await inlineCssUrls(collectCss(doc, skipped), base, timeout, skipped);

  // The foreignObject is its own viewport, which is the whole point: the clone
  // lays out at `width`, not at whatever the paper happens to be.
  const wrapper = doc.createElementNS(XHTML, 'div');
  wrapper.setAttribute('xmlns', XHTML);
  wrapper.setAttribute(
    'style',
    'width:' +
      width +
      'px;height:' +
      height +
      'px;overflow:hidden;' +
      (options.background ? 'background:' + options.background + ';' : '') +
      (options.style || '')
  );

  const style = doc.createElementNS(XHTML, 'style');
  style.textContent = css;
  wrapper.appendChild(style);
  wrapper.appendChild(clone);

  const svg = doc.createElementNS(SVG, 'svg');
  svg.setAttribute('xmlns', SVG);
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);

  const foreign = doc.createElementNS(SVG, 'foreignObject');
  foreign.setAttribute('x', '0');
  foreign.setAttribute('y', '0');
  foreign.setAttribute('width', '100%');
  foreign.setAttribute('height', '100%');
  foreign.appendChild(wrapper);
  svg.appendChild(foreign);

  const markup = new view.XMLSerializer().serializeToString(svg);
  const source = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup);

  const image = await loadImage(view, source, timeout);

  // the clone laid out against `width`, and only now do we throw away the part
  // nobody asked for. cropping here rather than by scaling and offsetting the
  // result means there is no arithmetic for host css to invalidate.
  const clip = options.clip;
  const outWidth = clip ? Math.max(1, Math.round(clip.width)) : width;
  const outHeight = clip ? Math.max(1, Math.round(clip.height)) : height;

  const canvas = doc.createElement('canvas');
  canvas.width = Math.round(outWidth * scale);
  canvas.height = Math.round(outHeight * scale);

  const ctx = canvas.getContext('2d');
  if (!ctx)
    fail('PC_RASTERIZE_FAILED', 'this browser gave us no 2d canvas context to rasterize into');

  if (options.background) {
    ctx.fillStyle = options.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  if (clip)
    ctx.drawImage(image, clip.x, clip.y, clip.width, clip.height, 0, 0, outWidth, outHeight);
  else ctx.drawImage(image, 0, 0, width, height);

  const type = options.type || 'image/png';
  const blob = await canvasToBlob(canvas, type, options.quality);
  return {
    blob,
    dataUrl: canvas.toDataURL(type, options.quality),
    width: canvas.width,
    height: canvas.height,
    skipped: [...new Set(skipped)],
    uniform: looksBlank(ctx, canvas)
  };
}

/**
 * Whether the canvas is one flat colour.
 *
 * Samples a grid instead of reading every pixel, because this runs on a preview
 * the user is waiting for and a full buffer of a retina A4 page is 8 megapixels.
 * A grid is enough to tell "nothing rendered" from "something did".
 */
function looksBlank(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): boolean | undefined {
  const steps = 24;
  const dx = Math.max(1, Math.floor(canvas.width / steps));
  const dy = Math.max(1, Math.floor(canvas.height / steps));

  try {
    let first: string | null = null;
    for (let y = 0; y < canvas.height; y += dy) {
      for (let x = 0; x < canvas.width; x += dx) {
        const [r, g, b, a] = ctx.getImageData(x, y, 1, 1).data;
        const pixel = r + ',' + g + ',' + b + ',' + a;
        if (first === null) first = pixel;
        else if (pixel !== first) return false;
      }
    }
    return true;
  } catch {
    // a tainted canvas refuses getImageData. that is not a blank image, it is
    // an unknowable one, so say nothing rather than something wrong.
    return undefined;
  }
}

function loadImage(view: Window, src: string, timeout: number): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const Ctor = (view as Window & { Image: typeof Image }).Image;
    const image = new Ctor();
    const timer = setTimeout(() => {
      reject(new Error('Printcraft: the raster did not load within ' + timeout + 'ms'));
    }, timeout);

    image.addEventListener(
      'load',
      () => {
        clearTimeout(timer);
        resolve(image);
      },
      { once: true }
    );
    image.addEventListener(
      'error',
      () => {
        clearTimeout(timer);
        // the usual cause is markup the serializer produced but the svg parser
        // refuses, so say that rather than reporting a bare load failure
        reject(
          new Error('Printcraft: the page could not be rasterized. Try the `renderer` option.')
        );
      },
      { once: true }
    );
    image.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('Printcraft: the canvas produced no image')),
      type,
      quality
    );
  });
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result)), { once: true });
    reader.addEventListener(
      'error',
      () => reject(new Error('Printcraft: could not read the image back')),
      { once: true }
    );
    reader.readAsDataURL(blob);
  });
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return readAsDataUrl(blob);
}
