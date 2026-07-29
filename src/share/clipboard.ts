// Putting the print copy on the clipboard.
//
// Same rule as everywhere else in this folder: what gets copied is the
// transformed clone, so a redacted document copies as a redacted document. The
// alternative — reading the live selection — would hand back everything the job
// was told to destroy.
//
// Safari is the reason this file is more careful than it looks. `navigator
// .clipboard.write` must be called during the user gesture that triggered it, and
// Safari stops treating a gesture as live once you await anything. The way round
// is to hand `ClipboardItem` a *promise* of a blob rather than a blob: the write
// is issued synchronously and the data arrives later. Chrome and Firefox accept
// the same shape, so there is one path rather than a branch.

import type { Env } from '../types';
import { fail } from '../support/errors';

export type CopyFormat = 'image' | 'html' | 'text' | 'markup' | 'data-url';

export interface CopyResult {
  format: CopyFormat;
  /** how the write actually happened, since the async API is not always there */
  via: 'clipboard-api' | 'execCommand';
  bytes?: number;
}

function clipboardOf(env: Env): Clipboard | null {
  const nav = env.window.navigator as Navigator & { clipboard?: Clipboard };
  return nav.clipboard || null;
}

function hasClipboardItem(env: Env): boolean {
  return typeof (env.window as unknown as { ClipboardItem?: unknown }).ClipboardItem === 'function';
}

/**
 * The fallback for text when the async API is missing or refused.
 *
 * `execCommand('copy')` is deprecated and still the only thing that works in a
 * few places, so it stays until they catch up.
 */
function copyByCommand(text: string, env: Env): boolean {
  const doc = env.document;
  const area = doc.createElement('textarea');
  area.value = text;
  area.setAttribute('data-pc-ui', '');
  area.setAttribute('readonly', '');
  area.setAttribute('aria-hidden', 'true');
  area.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
  doc.body.appendChild(area);

  try {
    area.select();
    area.setSelectionRange(0, text.length);
    return doc.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

async function writeText(text: string, env: Env): Promise<CopyResult> {
  const clipboard = clipboardOf(env);
  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(text);
      return { format: 'text', via: 'clipboard-api', bytes: text.length };
    } catch {
      // permission refused, or not a user gesture. fall through rather than fail.
    }
  }
  if (copyByCommand(text, env)) {
    return { format: 'text', via: 'execCommand', bytes: text.length };
  }
  fail(
    'PC_CLIPBOARD_DENIED',
    'the clipboard refused the write. Browsers only allow it from a user gesture, ' +
      'and some require the clipboard-write permission.'
  );
}

/**
 * Copies an image.
 *
 * `blob` may be a promise, and passing one is what keeps Safari happy: call this
 * synchronously inside the click handler with the still-pending render, and the
 * gesture is still live when `write` is issued.
 */
export async function copyImage(blob: Blob | Promise<Blob>, env: Env): Promise<CopyResult> {
  const clipboard = clipboardOf(env);
  if (!clipboard?.write || !hasClipboardItem(env)) {
    fail(
      'PC_CLIPBOARD_DENIED',
      'this browser cannot put an image on the clipboard. ' +
        'Use copyText, or save the screenshot to a file instead.'
    );
  }

  const Item = (env.window as unknown as { ClipboardItem: typeof ClipboardItem }).ClipboardItem;
  // png is the only type every browser accepts on the clipboard
  const type = 'image/png';

  try {
    await clipboard.write([new Item({ [type]: blob as Blob })]);
  } catch (e) {
    fail(
      'PC_CLIPBOARD_DENIED',
      'the clipboard refused the image: ' +
        (e instanceof Error ? e.message : String(e)) +
        '. It has to be called during a user gesture, and Safari needs the ' +
        'ClipboardItem to be created before anything is awaited.'
    );
  }

  const settled = await blob;
  return { format: 'image', via: 'clipboard-api', bytes: settled.size };
}

/**
 * Copies rich markup, with a plain-text alternative for anything that cannot
 * take HTML.
 *
 * Both flavours go in one item, so pasting into a document keeps the formatting
 * and pasting into a terminal still gets something readable.
 */
export async function copyHtml(html: string, text: string, env: Env): Promise<CopyResult> {
  const clipboard = clipboardOf(env);

  if (clipboard?.write && hasClipboardItem(env)) {
    const Item = (env.window as unknown as { ClipboardItem: typeof ClipboardItem }).ClipboardItem;
    try {
      await clipboard.write([
        new Item({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' })
        })
      ]);
      return { format: 'html', via: 'clipboard-api', bytes: html.length };
    } catch {
      // fall through to plain text rather than copying nothing
    }
  }

  const plain = await writeText(text, env);
  return { ...plain, format: 'html' };
}

export { writeText as copyText };
