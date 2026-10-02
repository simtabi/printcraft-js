// The sheet you look at before anything prints.
//
// Until now the flow was: choose what to print, and it prints. The document was
// assembled in a frame nobody saw and handed straight to the browser's dialog,
// so the first sight of the result was on paper — and by then a wrong margin, a
// missing note or a page break through the middle of a table has already cost
// somebody a sheet.
//
// This is the gap, filled. What it shows is not a rendering that resembles the
// output: it is the assembled document itself, mounted from the same
// `assemblePrintDocument` and `paginate` the real job runs. Printing continues
// that job rather than starting another, so what was looked at is what goes.

import { h, iconNode, root, button } from '../ui/kit';
import { Surface } from '../ui/kit/surface';
import { resolveSheet } from '../production/sheets';
import type { Env, ResolvedOptions } from '../types';

export interface ProofHandle {
  readonly document: Document;
  readonly window: Window;
  readonly element: HTMLElement;
  /** how many sheets the paginator produced, or null when the browser flowed it */
  pages: number | null;
  setPages(n: number | null): void;
  /** called when the user asks to print; the job continues from there */
  onPrint(fn: () => void): void;
  onCancel(fn: () => void): void;
  /** offered as a button, when the caller can service it */
  onAnnotate(fn: () => void): void;
  close(): void;
}

/**
 * The frame the document lives in, and the chrome around it.
 *
 * A `Surface`, so it gets the focus trap, the Escape handling and the tidy
 * teardown every other kit panel has. The iframe inside is the mount the
 * pipeline writes into.
 */
class ProofSheet extends Surface {
  private frame!: HTMLIFrameElement;
  private stage!: HTMLElement;
  private rail!: HTMLElement;
  private meta!: HTMLElement;
  private zoomLabel!: HTMLElement;
  private settingsBtn: HTMLButtonElement | null = null;

  private zoom = 1;
  private sheetPages: number | null = null;

  /** what the footer buttons do; set by the caller before anything is shown */
  onPrint: (() => void) | null = null;
  onCancel: (() => void) | null = null;
  onAnnotate: (() => void) | null = null;
  onSettings: (() => void) | null = null;

  private readonly job: ResolvedOptions;

  constructor(job: ResolvedOptions, env: Env) {
    super({ env, trapFocus: true, dismissOnEscape: true });
    this.job = job;
  }

  protected build(): HTMLElement {
    const doc = this.doc;
    const sheet = resolveSheet(this.job.setPrintSize);

    const scrim = root(doc, 'div', {
      class: 'prjs-proof',
      attrs: {
        'data-prjs-proof': '',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': 'Print proof'
      }
    });

    /* the bar across the top ------------------------------------------- */

    const bar = h(doc, 'div', { class: 'prjs-proof-bar' });
    bar.appendChild(
      h(doc, 'span', { class: 'prjs-proof-icon', children: [iconNode(doc, 'printer')] })
    );

    const titles = h(doc, 'div', { class: 'prjs-proof-titles' });
    titles.appendChild(
      h(doc, 'h2', {
        class: 'prjs-proof-title',
        text: this.job.documentTitle || 'Print proof'
      })
    );
    this.meta = h(doc, 'p', { class: 'prjs-proof-meta', text: sheet.label });
    titles.appendChild(this.meta);
    bar.appendChild(titles);

    // zoom, because a sheet at 100% does not fit a laptop and a sheet that fits
    // is too small to read what it says
    const zoomBox = h(doc, 'div', { class: 'prjs-proof-zoom' });
    zoomBox
      .appendChild(
        button(doc, {
          label: '',
          tone: 'ghost',
          attrs: { 'aria-label': 'Zoom out', 'data-icon-only': '', 'data-prjs-act': 'zoom-out' },
          onClick: () => this.setZoom(this.zoom - 0.15)
        })
      )
      .lastElementChild?.appendChild(doc.createTextNode('−'));
    // announced, so a zoom change is heard as well as seen
    this.zoomLabel = h(doc, 'span', {
      class: 'prjs-proof-zoom-value',
      text: '100%',
      attrs: { 'aria-live': 'polite' }
    });
    zoomBox.appendChild(this.zoomLabel);
    zoomBox
      .appendChild(
        button(doc, {
          label: '',
          tone: 'ghost',
          attrs: { 'aria-label': 'Zoom in', 'data-icon-only': '', 'data-prjs-act': 'zoom-in' },
          onClick: () => this.setZoom(this.zoom + 0.15)
        })
      )
      .lastElementChild?.appendChild(doc.createTextNode('+'));
    bar.appendChild(zoomBox);

    bar.appendChild(
      button(doc, {
        label: '',
        tone: 'ghost',
        icon: 'close',
        attrs: {
          'aria-label': 'Close',
          'data-size': 'sm',
          'data-icon-only': '',
          'data-prjs-modal-close': ''
        },
        onClick: () => this.onCancel?.()
      })
    );
    scrim.appendChild(bar);

    /* rail, stage ------------------------------------------------------- */

    const body = h(doc, 'div', { class: 'prjs-proof-body' });

    // hidden until the paginator says there is more than one sheet: a flowed
    // document never calls setPages, and showed an empty bordered column
    this.rail = h(doc, 'nav', {
      class: 'prjs-proof-rail',
      attrs: { 'data-prjs-proof-rail': '', 'aria-label': 'Pages', role: 'navigation' }
    });
    this.rail.hidden = true;
    body.appendChild(this.rail);

    this.stage = h(doc, 'div', {
      class: 'prjs-proof-stage',
      attrs: { 'data-prjs-proof-stage': '' }
    });

    const paper = h(doc, 'div', { class: 'prjs-proof-paper' });
    paper.style.width = sheet.width + 'px';
    paper.style.height = sheet.height + 'px';

    this.frame = h(doc, 'iframe', {
      class: 'prjs-proof-frame',
      attrs: { title: 'Print proof', 'data-prjs-frame': '' }
    }) as HTMLIFrameElement;
    paper.appendChild(this.frame);
    this.stage.appendChild(paper);
    body.appendChild(this.stage);
    scrim.appendChild(body);

    /* the actions ------------------------------------------------------- */

    const foot = h(doc, 'div', { class: 'prjs-proof-foot' });

    const left = h(doc, 'div', { class: 'prjs-proof-foot-left' });
    left.appendChild(
      button(doc, {
        label: 'Annotate',
        icon: 'draw',
        attrs: { 'data-prjs-act': 'annotate' },
        onClick: () => this.onAnnotate?.()
      })
    );
    // Hidden until a caller says what it does. `inspect` opens the proof to look
    // at, not to change, and a button that does nothing is worse than one that
    // is not there.
    this.settingsBtn = button(doc, {
      label: 'Settings',
      icon: 'settings',
      attrs: { 'data-prjs-act': 'settings' },
      onClick: () => this.onSettings?.()
    });
    this.settingsBtn.hidden = true;
    left.appendChild(this.settingsBtn);
    foot.appendChild(left);

    const right = h(doc, 'div', { class: 'prjs-proof-foot-right' });
    right.appendChild(
      button(doc, {
        label: 'Cancel',
        tone: 'ghost',
        attrs: { 'data-prjs-act': 'cancel' },
        onClick: () => this.onCancel?.()
      })
    );
    right.appendChild(
      button(doc, {
        label: 'Print',
        tone: 'primary',
        icon: 'printer',
        attrs: { 'data-prjs-act': 'print' },
        onClick: () => this.onPrint?.()
      })
    );
    foot.appendChild(right);
    scrim.appendChild(foot);

    return scrim;
  }

  protected override onKeydown(ev: KeyboardEvent): void {
    // ⌘P from inside the proof means "print this", not "open the browser dialog
    // over the top of it"
    if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'p') {
      ev.preventDefault();
      this.onPrint?.();
      return;
    }
    if (ev.key === 'Escape') {
      ev.preventDefault();
      this.onCancel?.();
      return;
    }
    super.onKeydown(ev);
  }

  /** Shows the Settings button, once a caller has said what it does. */
  enableSettings(): void {
    if (this.settingsBtn) this.settingsBtn.hidden = false;
  }

  /**
   * Hides Settings again, once a mark has been made that a rebuild would lose.
   * Returns whether it was showing.
   */
  disableSettings(): boolean {
    const was = !!this.settingsBtn && !this.settingsBtn.hidden;
    if (this.settingsBtn) this.settingsBtn.hidden = true;
    return was;
  }

  /** The mounted document, once the frame has one. */
  get frameDoc(): Document | null {
    return this.frame.contentDocument;
  }

  get frameWin(): Window | null {
    return this.frame.contentWindow;
  }

  setZoom(next: number): void {
    this.zoom = Math.max(0.25, Math.min(2, Math.round(next * 100) / 100));
    const paper = this.stage.querySelector<HTMLElement>('.prjs-proof-paper');
    if (paper) paper.style.transform = 'scale(' + this.zoom + ')';
    this.zoomLabel.textContent = Math.round(this.zoom * 100) + '%';
  }

  /**
   * Draws one thumbnail per sheet.
   *
   * A count, not a rendering: a real thumbnail means rasterising every page,
   * which for a forty-page document is several seconds of work to produce
   * pictures too small to read. These scroll the stage to the sheet instead,
   * which is what a page rail is actually for.
   */
  setPages(pages: number | null): void {
    this.sheetPages = pages;
    this.rail.textContent = '';

    const sheet = resolveSheet(this.job.setPrintSize);
    this.meta.textContent =
      sheet.label + (pages ? ' · ' + pages + (pages === 1 ? ' sheet' : ' sheets') : '');

    if (!pages || pages < 2) {
      this.rail.hidden = true;
      return;
    }
    this.rail.hidden = false;

    for (let i = 1; i <= pages; i++) {
      const tab = h(this.doc, 'button', {
        class: 'prjs-proof-page',
        text: String(i),
        attrs: { type: 'button', 'data-prjs-page': String(i), 'aria-label': 'Page ' + i }
      });
      tab.addEventListener('click', () => this.goToPage(i));
      this.rail.appendChild(tab);
    }
  }

  private goToPage(n: number): void {
    const doc = this.frameDoc;
    if (!doc) return;
    const sheets = doc.querySelectorAll('.prjs-page-sheet');
    const target = sheets[n - 1];

    for (const tab of this.rail.querySelectorAll('[data-prjs-page]')) {
      const here = tab.getAttribute('data-prjs-page') === String(n);
      tab.setAttribute('data-active', here ? 'true' : 'false');
      if (here) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
    }

    if (target) {
      target.scrollIntoView({ block: 'start', behavior: 'smooth' });
      return;
    }
    // unpaginated: one long document, so scroll the stage proportionally
    const sheetBox = resolveSheet(this.job.setPrintSize);
    this.frameDoc?.defaultView?.scrollTo({ top: (n - 1) * sheetBox.height, behavior: 'smooth' });
  }

  get pageCount(): number | null {
    return this.sheetPages;
  }

  get root(): HTMLElement {
    return this.node!;
  }

  get iframe(): HTMLIFrameElement {
    return this.frame;
  }
}

/**
 * Opens the proof and resolves once its frame has a document to write into.
 *
 * Mirrors `mountIframe`: the caller gets a window and a document and does not
 * need to know whether either is on screen.
 */
export function openProof(
  options: ResolvedOptions,
  env: Env
): Promise<{ sheet: ProofSheet; window: Window; document: Document }> {
  const sheet = new ProofSheet(options, env);
  sheet.open();

  return new Promise((resolve, reject) => {
    const started = Date.now();

    const ready = (): void => {
      const win = sheet.frameWin;
      const doc = sheet.frameDoc;
      if (win && doc) {
        doc.open();
        doc.write('<!doctype html><html><head></head><body></body></html>');
        doc.close();
        resolve({ sheet, window: win, document: doc });
        return;
      }
      if (Date.now() - started > 10000) {
        sheet.close();
        reject(new Error('the proof frame never became ready'));
        return;
      }
      setTimeout(ready, 16);
    };
    ready();
  });
}

export { ProofSheet };
