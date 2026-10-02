// Putting a picture on the page.
//
// Paste, drop, or pick one. It becomes an `<image>` in the same overlay as every
// other shape, with the same fractional coordinates, so it moves with its
// element and prints with the rest.
//
// Always a data URI, never a remote URL. A print document is assembled in a
// detached frame and handed to the browser's dialog, which does not wait for a
// network fetch — a remote href would print as an empty box on a slow connection
// and print fine on a fast one, which is the worst kind of bug to be told about.

import { PrintcraftError } from '../support/errors';

/**
 * The most a single annotation should weigh.
 *
 * Marks are stored in a `data-` attribute and, when persistence is on, in
 * `localStorage` — which is five megabytes for the whole origin. A phone photo
 * is three of those before base64 adds a third. Anything larger is downscaled.
 */
export const MAX_BYTES = 512 * 1024;

/** The longest edge an annotation image is allowed, in css pixels. */
export const MAX_EDGE = 1400;

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'];

export interface PreparedImage {
  href: string;
  width: number;
  height: number;
  /** true when it had to be shrunk to fit the budget */
  resampled: boolean;
}

/**
 * Reads a file into a data URI, downscaling it if it is too big to carry.
 *
 * SVG is passed through untouched: it is already small, already resolution
 * independent, and rasterising it to fit a pixel budget would be exactly the
 * wrong thing to do to it.
 */
export async function prepareImage(file: Blob, doc: Document): Promise<PreparedImage> {
  if (file.type && !ACCEPTED.includes(file.type)) {
    throw new PrintcraftError('PC_OPTIONS_INVALID', 'that file is not an image we can print', {
      hint: 'png, jpeg, webp, gif or svg.',
      context: { type: file.type, bytes: file.size }
    });
  }

  const asText = file.type === 'image/svg+xml';
  const raw = await toDataUrl(file);

  if (asText) return { href: raw, width: 0, height: 0, resampled: false };

  const bitmap = await decode(raw, doc);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const overweight = raw.length * 0.75 > MAX_BYTES;

  if (scale >= 1 && !overweight) {
    return { href: raw, width: bitmap.width, height: bitmap.height, resampled: false };
  }

  // shrink until it fits the byte budget as well as the pixel one. jpeg rather
  // than png: a photograph is what people paste, and a lossless photograph is
  // four times the size for no visible gain on paper.
  let quality = 0.85;
  let factor = scale;
  let href = raw;

  for (let attempt = 0; attempt < 4; attempt++) {
    href = redraw(bitmap, factor, quality, doc);
    if (href.length * 0.75 <= MAX_BYTES) break;
    factor *= 0.75;
    quality -= 0.12;
  }

  return {
    href,
    width: Math.round(bitmap.width * factor),
    height: Math.round(bitmap.height * factor),
    resampled: true
  };
}

function toDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result)), { once: true });
    reader.addEventListener(
      'error',
      () =>
        reject(
          new PrintcraftError('PC_OPTIONS_INVALID', 'that file could not be read', {
            hint: 'It may be corrupt, or the browser may have denied access to it.'
          })
        ),
      { once: true }
    );
    reader.readAsDataURL(file);
  });
}

function decode(src: string, doc: Document): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = doc.createElement('img');
    img.addEventListener('load', () => resolve(img), { once: true });
    img.addEventListener(
      'error',
      () => reject(new PrintcraftError('PC_RASTERIZE_FAILED', 'that image could not be decoded')),
      { once: true }
    );
    img.src = src;
  });
}

function redraw(img: HTMLImageElement, factor: number, quality: number, doc: Document): string {
  const canvas = doc.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * factor));
  canvas.height = Math.max(1, Math.round(img.height * factor));

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new PrintcraftError('PC_RASTERIZE_FAILED', 'no 2d context to resize with');

  // white behind it: a transparent png resaved as jpeg gets a black background
  // otherwise, which on paper is a black rectangle
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  return canvas.toDataURL('image/jpeg', Math.max(0.4, quality));
}

/* where they come from ---------------------------------------------------- */

/** The first image on a clipboard or drag payload, or null. */
export function imageFrom(data: DataTransfer | null): File | null {
  if (!data) return null;
  for (const item of Array.from(data.items || [])) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  for (const file of Array.from(data.files || [])) {
    if (file.type.startsWith('image/')) return file;
  }
  return null;
}

/** Opens the file picker. Resolves with null if it was dismissed. */
export function chooseImage(doc: Document): Promise<File | null> {
  return new Promise((resolve) => {
    const input = doc.createElement('input');
    input.type = 'file';
    input.accept = ACCEPTED.join(',');
    input.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;opacity:0';
    input.setAttribute('data-prjs-ui', '');

    let settled = false;
    const done = (file: File | null): void => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(file);
    };

    input.addEventListener('change', () => done(input.files?.[0] || null));
    // a dismissed picker fires no event in most browsers; `cancel` is newer and
    // where it is missing the focus coming back is the signal
    input.addEventListener('cancel', () => done(null));
    doc.defaultView?.addEventListener(
      'focus',
      () => setTimeout(() => done(input.files?.[0] || null), 400),
      { once: true }
    );

    (doc.body || doc.documentElement).appendChild(input);
    input.click();
  });
}

/**
 * A box for a new image, centred on a point and sized to its own proportions.
 *
 * A quarter of the host's width, so a pasted screenshot lands at a readable size
 * rather than filling the element or arriving as a stamp.
 */
export function placeAt(
  at: { x: number; y: number },
  image: { width: number; height: number },
  host: { width: number; height: number }
): [{ x: number; y: number }, { x: number; y: number }] {
  const ratio = image.width && image.height ? image.height / image.width : 0.62;

  const w = 0.25;
  // the same visual proportions once the viewBox stretch is undone
  const h = host.width && host.height ? (w * ratio * host.width) / host.height : w * ratio;

  const clamp = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);
  return [
    { x: clamp(at.x - w / 2), y: clamp(at.y - h / 2) },
    { x: clamp(at.x + w / 2), y: clamp(at.y + h / 2) }
  ];
}
