// Laying content out as real pages.
//
// Browsers do not implement `@page { @bottom-center { content: counter(page) } }`
// which is a Prince and WeasyPrint feature. Neither the fixed-position nor
// the thead/tfoot technique can count pages. So "Page 3 of 12" needs us to
// measure the content and split it into sheets ourselves.
//
// Doing that also buys everything else people ask for and cannot otherwise have:
// a border round each page, real padding, per-page headers and footers, and
// `@page { margin: 0 }`, which is what removes the browser's own URL and date
// footer.
//
// This runs inside the mounted print document, never on a detached clone. Clones
// have no layout, so there would be nothing to measure.

import { NS } from '../../support';
import { buildWatermarkLayer } from '../../production/watermark';
import { measureSheet, sidesToCss, type SheetBox } from './geometry';
import type { Logger, PageNumbers, ResolvedOptions } from '../../types';

export { measureSheet, toSides } from './geometry';
export type { SheetBox, Sides } from './geometry';

export interface PaginationResult {
  pages: number;
  /** blocks that were taller than a page and had to be left whole */
  oversized: number;
  sheetBox: SheetBox;
}

const BREAK_BEFORE = `[data-${NS}-break-before]`;
const BREAK_AFTER = `[data-${NS}-break-after]`;
const AVOID_BREAK = `[data-${NS}-avoid-break]`;

/** Text a per-page band shows, with the placeholders filled in. */
function fill(template: string, page: number, pages: number, title: string): string {
  return template
    .split('{page}')
    .join(String(page))
    .split('{pages}')
    .join(String(pages))
    .split('{title}')
    .join(title)
    .split('{date}')
    .join(new Date().toLocaleDateString());
}

function numberingFor(options: ResolvedOptions): Required<PageNumbers> | null {
  if (!options.pageNumbers) return null;
  const n = options.pageNumbers === true ? {} : options.pageNumbers;
  return {
    template: n.template ?? 'Page {page} of {pages}',
    position: n.position ?? 'bottom-center',
    startAt: n.startAt ?? 1,
    hideOnFirst: n.hideOnFirst ?? false
  };
}

/**
 * Splits the assembled content into sheets.
 *
 * `host` is the element the content currently sits in, inside the mounted print
 * document. Everything below it is redistributed; nothing is thrown away.
 */
export function paginate(
  doc: Document,
  host: Element,
  options: ResolvedOptions,
  log?: Logger
): PaginationResult {
  const numbers = numberingFor(options);
  const header = options.pageHeader || options.headerText || '';
  const footer = options.pageFooter || options.footerText || '';
  const hasFooterBand = !!footer || (!!numbers && numbers.position.startsWith('bottom'));
  const hasHeaderBand = !!header || (!!numbers && numbers.position.startsWith('top'));

  const box = measureSheet(options, { header: hasHeaderBand, footer: hasFooterBand });

  // everything that was in the host, in order, ready to be dealt out
  const source = doc.createElement('div');
  while (host.firstChild) source.appendChild(host.firstChild);

  const pages: HTMLElement[] = [];
  let flow: HTMLElement | null = null;
  let oversized = 0;

  // built once and cloned per sheet: a tiled mark can be two hundred nodes, and
  // rebuilding that for every page of a long document is wasted work
  const watermark =
    options.watermark && options.watermark.repeat !== 'first-page'
      ? buildWatermarkLayer(options.watermark, doc, {
          width: box.sheet.width,
          height: box.sheet.height
        })
      : null;

  const startPage = (): void => {
    const page = doc.createElement('section');
    page.className = 'prjs-page-sheet';
    page.setAttribute('data-prjs-page', String(pages.length + 1));

    const inner = doc.createElement('div');
    inner.className = 'prjs-page-inner';

    const band = (kind: 'header' | 'footer'): HTMLElement => {
      const el = doc.createElement('div');
      el.className = 'prjs-page-' + kind;
      el.setAttribute('data-prjs-band', kind);
      return el;
    };

    if (hasHeaderBand) inner.appendChild(band('header'));
    const content = doc.createElement('div');
    content.className = 'prjs-page-content';
    content.style.height = box.content.height + 'px';
    inner.appendChild(content);
    if (hasFooterBand) inner.appendChild(band('footer'));

    page.appendChild(inner);
    if (watermark) page.appendChild(watermark.cloneNode(true));
    host.appendChild(page);
    pages.push(page);
    flow = content;
  };

  const fits = (): boolean => !!flow && flow.scrollHeight <= box.content.height + 1;
  const pageIsEmpty = (): boolean => !flow || !flow.textContent?.trim();

  startPage();

  /**
   * Opens a new page and rebuilds the chain of containers we were inside.
   *
   * Without this a section broken across pages would lose its own box on the
   * second page: the heading keeps its border, the continuation does not.
   */
  const breakPage = (chain: HTMLElement[]): void => {
    startPage();
    let parent = flow as HTMLElement;
    for (let i = 0; i < chain.length; i++) {
      const fresh = chain[i]!.cloneNode(false) as HTMLElement;
      fresh.setAttribute('data-prjs-continued', '');
      parent.appendChild(fresh);
      chain[i] = fresh;
      parent = fresh;
    }
  };

  // deep enough for ordinary page scaffolding: body > wrapper > band > section > …
  const MAX_DEPTH = 16;

  /**
   * Places one node, splitting it across pages when it does not fit.
   *
   * `chain` is the stack of cloned containers we are currently inside on this
   * page, so a break can rebuild them.
   */
  const placeInto = (node: Node, chain: HTMLElement[], depth: number): void => {
    const parent = (chain[chain.length - 1] || flow) as HTMLElement;
    parent.appendChild(node);
    if (fits()) return;

    parent.removeChild(node);
    const el = node.nodeType === 1 ? (node as HTMLElement) : null;

    if (el?.matches?.(BREAK_BEFORE) && !pageIsEmpty()) {
      breakPage(chain);
      (chain[chain.length - 1] || flow)!.appendChild(node);
      return;
    }

    // any container can be descended into, including one with a single child:
    // page scaffolding is usually a chain of single-child wrappers, and treating
    // those as atomic put a whole document on one overflowing page
    const splittable =
      el && el.childNodes.length > 0 && !el.matches?.(AVOID_BREAK) && depth < MAX_DEPTH;

    if (splittable) {
      const shell = el.cloneNode(false) as HTMLElement;
      parent.appendChild(shell);
      chain.push(shell);
      // snapshot first: placing a child moves it, which mutates the live list
      // oxlint-disable-next-line no-useless-spread
      for (const kid of [...el.childNodes]) placeInto(kid, chain, depth + 1);
      chain.pop();
      if (!shell.childNodes.length) shell.remove();
      return;
    }

    // nothing left to split. if the page is already empty this block is simply
    // bigger than any page, so keep it whole rather than loop.
    if (pageIsEmpty()) {
      if (el) {
        oversized++;
        log?.warn(
          'a block is taller than the page and cannot be split:',
          el.tagName.toLowerCase(),
          Math.round(el.scrollHeight) + 'px against ' + box.content.height + 'px'
        );
      }
      parent.appendChild(node);
      return;
    }

    breakPage(chain);
    (chain[chain.length - 1] || flow)!.appendChild(node);
  };

  // same reason: every placement removes a node from this list
  // oxlint-disable-next-line no-useless-spread
  for (const node of [...source.childNodes]) {
    placeInto(node, [], 0);
    const el = node.nodeType === 1 ? (node as HTMLElement) : null;
    if (el?.matches?.(BREAK_AFTER)) startPage();
  }

  // an empty trailing page is an artefact of the last break, not a real page
  const last = pages[pages.length - 1];
  if (pages.length > 1 && last && !last.querySelector('.prjs-page-content')?.childNodes.length) {
    last.remove();
    pages.pop();
  }

  /* furniture, now that the count is known ----------------------------- */

  const title = options.documentTitle || doc.title || '';
  pages.forEach((page, i) => {
    const number = i + (numbers?.startAt ?? 1);
    const label =
      numbers && !(numbers.hideOnFirst && i === 0)
        ? fill(numbers.template, number, pages.length, title)
        : '';

    const setBand = (kind: 'header' | 'footer', text: string, withNumber: boolean): void => {
      const band = page.querySelector('[data-prjs-band="' + kind + '"]');
      if (!band) return;
      band.textContent = text ? fill(text, number, pages.length, title) : '';
      if (withNumber && label) {
        const slot = doc.createElement('span');
        slot.className = 'prjs-page-number';
        slot.setAttribute('data-prjs-page-number', '');
        slot.textContent = label;
        band.appendChild(slot);
      }
    };

    setBand('header', header, !!numbers && numbers.position.startsWith('top'));
    setBand('footer', footer, !!numbers && numbers.position.startsWith('bottom'));
  });

  return { pages: pages.length, oversized, sheetBox: box };
}

/**
 * The stylesheet the sheets need.
 *
 * `@page { margin: 0 }` is the important line. The browser draws its own header
 * and footer (the date, the title, the URL, the page count) into the page
 * margin box, so leaving no margin leaves nowhere to draw them. Chromium and
 * Firefox both honour it. Safari does not, and in every browser the user can
 * turn them back on in the print dialog.
 */
export function paginationCss(options: ResolvedOptions): string {
  const numbers = numberingFor(options);
  const header = options.pageHeader || options.headerText || '';
  const footer = options.pageFooter || options.footerText || '';
  const box = measureSheet(options, {
    header: !!header || (!!numbers && numbers.position.startsWith('top')),
    footer: !!footer || (!!numbers && numbers.position.startsWith('bottom'))
  });

  const align = (position: string): string =>
    position.endsWith('left') ? 'flex-start' : position.endsWith('right') ? 'flex-end' : 'center';

  return [
    `@page { size: ${box.sheet.width}px ${box.sheet.height}px; margin: 0; }`,
    'html, body { margin: 0; padding: 0; background: #fff; }',

    `.prjs-page-sheet {
      box-sizing: border-box;
      width: ${box.sheet.width}px;
      min-height: ${box.sheet.height}px;
      padding: ${sidesToCss(box.margin)};
      break-after: page;
      page-break-after: always;
      overflow: hidden;
    }`,
    '.prjs-page-sheet:last-child { break-after: auto; page-break-after: auto; }',

    `.prjs-page-inner {
      box-sizing: border-box;
      min-height: ${box.sheet.height - box.margin.top - box.margin.bottom}px;
      border: ${box.border.width}px ${box.border.style} ${box.border.color};
      border-radius: ${box.border.radius};
      padding: ${sidesToCss(box.padding)};
      display: flex;
      flex-direction: column;
    }`,

    '.prjs-page-content { flex: 1 1 auto; overflow: visible; }',

    `.prjs-page-header, .prjs-page-footer {
      flex: none;
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 26px;
      font-size: 11px;
      color: #444;
    }`,
    `.prjs-page-header { justify-content: ${align(numbers?.position || 'top-center')}; }`,
    `.prjs-page-footer { justify-content: ${align(numbers?.position || 'bottom-center')}; }`,
    '.prjs-page-number { white-space: nowrap; }',

    // screen only: the inspector shows sheets as paper on a desk
    `@media screen {
      body { background: #3f4046; padding: 16px 0; }
      .prjs-page-sheet { margin: 0 auto 16px; background: #fff; box-shadow: 0 4px 18px rgba(0,0,0,.35); }
    }`
  ].join('\n');
}
