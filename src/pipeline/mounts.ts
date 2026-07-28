// where an assembled print document goes. three strategies behind one interface:
// a hidden iframe (the default), a popup window, and the inspector overlay.
// each one settles exactly once and always hands back a teardown.

import { raise } from '../support';
import type { Mount, ResolvedOptions } from '../types';

/** how long any mount may take to become usable before the job gives up. */
const MOUNT_TIMEOUT = 15000;

/** a mount that owns a node in the host document and removes it on teardown. */
class HostedMount implements Mount {
  constructor(
    readonly window: Window,
    readonly document: Document,
    private readonly host: Element,
    readonly overlay?: HTMLElement
  ) {}

  teardown(): void {
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
 * resolves once the frame has a usable document. `onload` alone is not enough —
 * an `about:blank` frame can already be complete before the listener attaches —
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
        raise(label + ' did not become ready within ' + MOUNT_TIMEOUT + 'ms');
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

/** the default: an off-screen, aria-hidden iframe in the host document. */
export function mountIframe(srcDoc: Document): Promise<Mount> {
  const iframe = srcDoc.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.setAttribute('data-pc-frame', '');
  iframe.setAttribute(
    'style',
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;'
  );
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
  if (!w) raise('popup blocked. use printInIframe: true or allow popups for this site');

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
        raise('the print window did not become ready within ' + MOUNT_TIMEOUT + 'ms');
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
export function mountOverlay(srcDoc: Document): Promise<Mount> {
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
  label.textContent = 'printcraft inspector — assembled print document';
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

  const iframe = srcDoc.createElement('iframe');
  iframe.setAttribute('title', 'printcraft print preview');
  iframe.setAttribute(
    'style',
    'flex:1;width:100%;border:0;background:#fff;border-radius:0 0 4px 4px;'
  );
  iframe.src = 'about:blank';

  host.appendChild(bar);
  host.appendChild(iframe);
  (srcDoc.body || srcDoc.documentElement).appendChild(host);

  return frameReady(iframe, 'the inspector frame').then(({ win, doc }) => {
    const mount = new HostedMount(win, doc, host, host);
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
