// where an assembled print document goes. three strategies behind one interface:
// a hidden iframe (the default), a popup window, and the inspector overlay.
// each one settles exactly once and always hands back a teardown.

import { resolveSheet, type SheetSize } from '../production/sheets';
import type { Mount, ResolvedOptions } from '../types';
import { fail } from '../support/errors';

/** how long any mount may take to become usable before the job gives up. */
const MOUNT_TIMEOUT = 15000;

/**
 * The width a job's frame lays out at: always the sheet.
 *
 * An earlier version widened the frame for clip jobs, to reproduce the layout a
 * region was drawn against. It does not work, and it is worth writing down why.
 * At pagination time the browser re-evaluates media queries against the page
 * box, not the frame, so the wide layout is thrown away the moment printing
 * starts, and the document is left wider than the paper, which crops it.
 *
 * Printing a region exactly as it looked on screen needs a raster, not a
 * relayout. That is what `clipMode: 'capture'` does.
 */
export function frameWidthFor(_options: ResolvedOptions | undefined, sheet: SheetSize): number {
  return sheet.width;
}

/**
 * Off to the side rather than zero-sized.
 *
 * A frame with no width gives its document a zero-width layout viewport, so
 * every media query resolves at its narrowest and the content reflows into
 * something the page never looked like. Parking it off-screen at the real sheet
 * width keeps the layout honest while staying invisible. `visibility: hidden` is
 * gone for the same reason: it suppresses layout work we depend on.
 */
function offscreenFrameStyle(width: number, height: number): string {
  return (
    'position:fixed;left:-10000px;top:0;border:0;' +
    'width:' +
    width +
    'px;height:' +
    height +
    'px;'
  );
}

/** a mount that owns a node in the host document and removes it on teardown. */
class HostedMount implements Mount {
  private readonly cleanups: Array<() => void> = [];

  constructor(
    readonly window: Window,
    readonly document: Document,
    private readonly host: Element,
    readonly overlay?: HTMLElement
  ) {}

  /** registers work to undo when this mount goes away, such as host listeners. */
  onTeardown(fn: () => void): void {
    this.cleanups.push(fn);
  }

  teardown(): void {
    for (const fn of this.cleanups.splice(0)) {
      try {
        fn();
      } catch {
        /* a failing cleanup must not block the rest */
      }
    }
    if (this.host.parentNode) this.host.parentNode.removeChild(this.host);
  }
}

class PopupMount implements Mount {
  constructor(
    readonly window: Window,
    readonly document: Document
  ) {}

  teardown(): void {
    try {
      this.window.close();
    } catch {
      /* already gone */
    }
  }
}

/**
 * resolves once the frame has a usable document. `onload` alone is not enough,
 * because an `about:blank` frame can already be complete before the listener
 * attaches;
 * and without the timeout a frame that never loads would hang the job forever
 * with the iframe still attached.
 */
function frameReady(
  iframe: HTMLIFrameElement,
  label: string
): Promise<{ win: Window; doc: Document }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const settle = (): void => {
      if (settled) return;
      const win = iframe.contentWindow;
      const doc = iframe.contentDocument;
      if (!win || !doc) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      iframe.removeEventListener('load', settle);
      resolve({ win, doc });
    };

    iframe.addEventListener('load', settle);
    timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      iframe.removeEventListener('load', settle);
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      try {
        fail('PC_MOUNT_TIMEOUT', label + ' did not become ready within ' + MOUNT_TIMEOUT + 'ms', {
          timeout: MOUNT_TIMEOUT
        });
      } catch (e) {
        reject(e);
      }
    }, MOUNT_TIMEOUT);

    try {
      if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') settle();
    } catch {
      /* cross-origin about:blank quirk; wait for onload */
    }
  });
}

/** the default: an aria-hidden iframe parked off-screen at the sheet size. */
export function mountIframe(srcDoc: Document, options?: ResolvedOptions): Promise<Mount> {
  const sheet = resolveSheet(options?.setPrintSize);
  const width = frameWidthFor(options, sheet);
  const iframe = srcDoc.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.setAttribute('data-pc-frame', '');
  iframe.setAttribute('data-pc-sheet', sheet.label);
  iframe.setAttribute('style', offscreenFrameStyle(width, sheet.height));
  iframe.src = 'about:blank';
  (srcDoc.body || srcDoc.documentElement).appendChild(iframe);

  return frameReady(iframe, 'the print frame').then(
    ({ win, doc }) => new HostedMount(win, doc, iframe)
  );
}

/**
 * the opt-in popup path. the freshly-opened `about:blank` document can still be
 * swapped by the browser after `open()` returns, so wait for it to settle before
 * anything is written into it.
 */
export function mountWindow(srcWin: Window, options: ResolvedOptions): Promise<Mount> {
  const w = srcWin.open('', '_blank', options.windowFeatures);
  if (!w) fail('PC_POPUP_BLOCKED', 'the browser blocked the print window');

  return new Promise<Mount>((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const settle = (): void => {
      if (settled) return;
      let doc: Document | null = null;
      try {
        doc = w.document;
      } catch {
        /* not ready */
      }
      if (!doc) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      try {
        w.removeEventListener('load', settle);
      } catch {
        /* noop */
      }
      resolve(new PopupMount(w, doc));
    };

    timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        w.close();
      } catch {
        /* noop */
      }
      try {
        fail(
          'PC_MOUNT_TIMEOUT',
          'the print window did not become ready within ' + MOUNT_TIMEOUT + 'ms',
          { timeout: MOUNT_TIMEOUT }
        );
      } catch (e) {
        reject(e);
      }
    }, MOUNT_TIMEOUT);

    try {
      w.addEventListener('load', settle);
    } catch {
      /* noop */
    }
    try {
      if (w.document && w.document.readyState === 'complete') settle();
    } catch {
      /* wait for load */
    }
  });
}

/**
 * the inspector: the same assembled document rendered into a visible overlay with
 * Print / Log HTML / Close, so print styles can be iterated on without paper.
 */
export function mountOverlay(srcDoc: Document, options?: ResolvedOptions): Promise<Mount> {
  const sheet = resolveSheet(options?.setPrintSize);

  const host = srcDoc.createElement('div');
  host.setAttribute('data-pc-inspector', '');
  host.setAttribute(
    'style',
    'position:fixed;inset:0;z-index:2147483646;background:rgba(20,20,24,.55);' +
      'display:flex;flex-direction:column;padding:4vh 6vw;box-sizing:border-box;'
  );

  const bar = srcDoc.createElement('div');
  bar.setAttribute(
    'style',
    'background:#17181b;color:#fff;font:12px/1 ui-monospace,Consolas,monospace;' +
      'display:flex;gap:8px;align-items:center;padding:8px 12px;border-radius:4px 4px 0 0;'
  );

  const label = srcDoc.createElement('span');
  label.textContent =
    'printcraft inspector · ' + sheet.label + ' (' + sheet.width + '×' + sheet.height + 'px)';
  label.setAttribute('style', 'flex:1');
  bar.appendChild(label);

  const mkBtn = (text: string): HTMLButtonElement => {
    const b = srcDoc.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.setAttribute(
      'style',
      'font:inherit;background:#fff;color:#17181b;border:0;padding:5px 10px;border-radius:3px;cursor:pointer;'
    );
    bar.appendChild(b);
    return b;
  };
  const printBtn = mkBtn('Print');
  const htmlBtn = mkBtn('Log HTML');
  const closeBtn = mkBtn('Close');

  // a stage the sheet floats on, so the preview reads as paper rather than as a
  // panel that happens to contain html
  const stage = srcDoc.createElement('div');
  stage.setAttribute(
    'style',
    'flex:1;overflow:auto;background:#3f4046;border-radius:0 0 4px 4px;' +
      'display:flex;justify-content:center;align-items:flex-start;padding:24px;box-sizing:border-box;'
  );

  const sheetBox = srcDoc.createElement('div');
  sheetBox.setAttribute(
    'style',
    'width:' +
      sheet.width +
      'px;height:' +
      sheet.height +
      'px;flex:none;' +
      'transform-origin:top center;box-shadow:0 6px 28px rgba(0,0,0,.45);background:#fff;'
  );

  const iframe = srcDoc.createElement('iframe');
  iframe.setAttribute('title', 'printcraft print preview');
  // the frame is the sheet, at sheet pixels. anything else and the preview shows
  // a layout the paper will never have
  iframe.setAttribute('style', 'width:100%;height:100%;border:0;background:#fff;display:block;');
  iframe.src = 'about:blank';

  sheetBox.appendChild(iframe);
  stage.appendChild(sheetBox);
  host.appendChild(bar);
  host.appendChild(stage);
  (srcDoc.body || srcDoc.documentElement).appendChild(host);

  /** shrink the sheet to fit the stage, never enlarging past 1:1 */
  const fit = (): void => {
    const available = stage.clientWidth - 48;
    if (available <= 0) return;
    const scale = Math.min(1, available / sheet.width);
    sheetBox.style.transform = 'scale(' + scale + ')';
    // a scaled box keeps its unscaled footprint, so claw the difference back
    sheetBox.style.marginBottom = -(sheet.height * (1 - scale)) + 'px';
    label.textContent =
      'printcraft inspector · ' +
      sheet.label +
      ' (' +
      sheet.width +
      '×' +
      sheet.height +
      'px, ' +
      Math.round(scale * 100) +
      '%)';
  };

  return frameReady(iframe, 'the inspector frame').then(({ win, doc }) => {
    const mount = new HostedMount(win, doc, host, host);
    fit();

    const onResize = (): void => fit();
    const view = srcDoc.defaultView;
    view?.addEventListener('resize', onResize);
    mount.onTeardown(() => view?.removeEventListener('resize', onResize));
    printBtn.addEventListener('click', () => {
      try {
        win.focus();
        win.print();
      } catch {
        /* noop */
      }
    });
    htmlBtn.addEventListener('click', () => {
      try {
        console.log('[printcraft] print document html:\n', doc.documentElement.outerHTML);
      } catch {
        /* noop */
      }
    });
    closeBtn.addEventListener('click', () => mount.teardown());
    return mount;
  });
}

/* waits ---------------------------------------------------------------- */

/** resolves on whichever of load or error arrives first: either way it is settled. */
function settleOn(node: EventTarget): Promise<void> {
  return new Promise<void>((res) => {
    node.addEventListener('load', () => res(), { once: true });
    node.addEventListener('error', () => res(), { once: true });
  });
}

/**
 * holds the job until images, webfonts and imported stylesheets are in, bounded
 * by `assetTimeout`. stylesheets matter as much as images: `keepSourceCSS` copies
 * `<link>` elements into a brand-new document, and printing before they land
 * produces unstyled paper.
 */
export function waitForAssets(
  doc: Document,
  _win: Window,
  options: ResolvedOptions
): Promise<void> {
  const waits: Promise<unknown>[] = [];

  const imgs = doc.images;
  for (let i = 0; i < imgs.length; i++) {
    const img = imgs[i]!;
    if (!img.complete) waits.push(settleOn(img));
  }

  const links = doc.querySelectorAll('link[rel~="stylesheet"]');
  for (let i = 0; i < links.length; i++) {
    const link = links[i] as HTMLLinkElement;
    let loaded = false;
    try {
      loaded = !!link.sheet;
    } catch {
      loaded = true; /* cross-origin: already applied */
    }
    if (!loaded) waits.push(settleOn(link));
  }

  const fonts = (doc as Document & { fonts?: FontFaceSet }).fonts;
  if (fonts?.ready && typeof fonts.ready.then === 'function') {
    waits.push(fonts.ready.catch(() => undefined));
  }

  const all = Promise.all(waits).then(() => {
    if (options.extraDelay > 0) {
      return new Promise<void>((res) => setTimeout(res, options.extraDelay));
    }
    return undefined;
  });

  return withTimeout(all, options.assetTimeout);
}

/**
 * resolves when the print dialog closes. `afterprint` is the signal in every
 * modern browser; the `print` media query is the fallback, and the timeout is the
 * backstop. every listener and timer is released on whichever wins, so a job
 * cannot leave a live matchMedia subscription behind.
 */
export function waitForDialogClose(win: Window, options: ResolvedOptions): Promise<void> {
  return new Promise<void>((resolve) => {
    let done = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let mql: MediaQueryList | undefined;

    const onMediaChange = (ev: MediaQueryListEvent): void => {
      if (!ev.matches) finish();
    };

    function finish(): void {
      if (done) return;
      done = true;
      if (timer !== undefined) clearTimeout(timer);
      try {
        win.removeEventListener('afterprint', finish);
      } catch {
        /* noop */
      }
      if (mql) {
        try {
          if (mql.removeEventListener) mql.removeEventListener('change', onMediaChange);
          else mql.removeListener(onMediaChange);
        } catch {
          /* noop */
        }
      }
      resolve();
    }

    try {
      win.addEventListener('afterprint', finish);
    } catch {
      /* noop */
    }
    try {
      if (win.matchMedia) {
        mql = win.matchMedia('print');
        if (mql.addEventListener) mql.addEventListener('change', onMediaChange);
        else mql.addListener(onMediaChange);
      }
    } catch {
      /* noop */
    }

    timer = setTimeout(finish, options.afterPrintTimeout);
  });
}

/** races a promise against a timer, always clearing the timer that loses. */
function withTimeout(p: Promise<unknown>, ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = (): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    p.then(finish, finish);
  });
}
