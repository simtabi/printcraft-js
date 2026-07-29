// assembling the print document: generated page css, watermark, repeating
// header/footer, printer marks, and the target slots. built with dom apis rather
// than document.write, which is deprecated and would re-open the stream.

import { NS, toArray } from '../support';
import { REDACTION_CSS } from '../privacy/redact';
import { marksCss, marksMarkup } from '../production/marks';
import { resolveSheet } from '../production/sheets';
import { buildWatermarkLayer, firstPageCss, watermarkCss } from '../production/watermark';
import { paginationCss } from './paginate';
import type { ResolvedOptions, ResolvedPrinterMarks } from '../types';

/** the stylesheet printcraft generates for every job, from the resolved options. */
export function buildPageCss(options: ResolvedOptions): string {
  const css: string[] = [];

  // a paginated job owns the page box outright: it sets its own @page rule,
  // draws its own margin, and takes `margin: 0` so the browser has nowhere to
  // print its date, title, url and page count
  if (options.paginate) {
    css.push(paginationCss(options));
  } else {
    const page: string[] = [];
    if (options.setPrintSize) page.push('size: ' + options.setPrintSize + ';');
    if (options.hideBrowserHeaderFooter) {
      // the same trick without pagination: the margin moves onto the body, so
      // the layout is unchanged and only the browser's own furniture goes
      page.push('margin: 0;');
      if (options.pageMargin) css.push('body { padding: ' + options.pageMargin + '; }');
    } else if (options.pageMargin) {
      page.push('margin: ' + options.pageMargin + ';');
    }
    if (page.length) css.push('@page {' + page.join(' ') + '}');
  }

  css.push('html, body { margin: 0; padding: 0; }');
  css.push('body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }');
  if (options.stripDarkMode) {
    css.push(':root { color-scheme: light; } body { background: #fff; color: #000; }');
  }

  if (options.pageBreakBetweenTargets) {
    css.push('.pc-target + .pc-target{ break-before: page; page-break-before: always; }');
  }

  const breakBefore = options.pageBreakBeforeSelectors.concat(['[data-' + NS + '-break-before]']);
  const breakAfter = options.pageBreakAfterSelectors.concat(['[data-' + NS + '-break-after]']);
  const avoidBreak = options.avoidBreakSelectors.concat(['[data-' + NS + '-avoid-break]']);
  breakBefore.forEach((s) => css.push(s + ' { break-before: page; page-break-before: always; }'));
  breakAfter.forEach((s) => css.push(s + ' { break-after: page; page-break-after: always; }'));
  avoidBreak.forEach((s) => css.push(s + ' { break-inside: avoid; page-break-inside: avoid; }'));
  css.push('[data-' + NS + '-reveal] { display: revert !important; }');

  css.push(REDACTION_CSS);
  css.push(
    '.pc-note { display: inline-block; background: #fef9c3; border: 1px solid #ca8a04;' +
      ' color: #713f12; font: 11px/1.4 sans-serif; padding: 1px 6px; margin: 0 4px; vertical-align: middle;' +
      ' break-inside: avoid; }'
  );

  if (options.printerMarks) css.push(marksCss(options.printerMarks as ResolvedPrinterMarks));

  // paginated jobs put a mark inside every sheet and style it there; without
  // sheets there is nothing to attach to, so the mark is fixed and lands on the
  // first page
  if (options.watermark) {
    css.push(options.paginate ? watermarkCss(options.watermark) : firstPageCss(options.watermark));
  }

  if (options.headerText || options.footerText) {
    if (options.headerFooterMode === 'repeat') {
      // browsers repeat thead/tfoot on every printed page; absolute positioning does not
      css.push(
        [
          'table.pc-sheet { width: 100%; border-collapse: collapse; }',
          'table.pc-sheet > thead td, table.pc-sheet > tfoot td { text-align: center;',
          'font-size: 11px; color: #444; padding: 4px 0; }',
          'table.pc-sheet > tbody td { padding: 0; }'
        ].join(' ')
      );
    } else {
      css.push(
        [
          '.pc-header { position: fixed; top: 0; left: 0; right: 0; text-align: center; font-size: 11px; color: #444; }',
          '.pc-footer { position: fixed; bottom: 0; left: 0; right: 0; text-align: center; font-size: 11px; color: #444; }',
          'body { padding-top: 24px; padding-bottom: 24px; }'
        ].join(' ')
      );
    }
  }
  return css.join('\n');
}

/**
 * The watermark for an unpaginated job, sized against the sheet it will print on.
 *
 * Paginated jobs do not come through here: the paginator builds a mark into each
 * sheet as it creates them, which is the only way to reach page two.
 */
export function buildWatermarkNode(options: ResolvedOptions, doc: Document): Element | null {
  if (!options.watermark) return null;
  const sheet = resolveSheet(options.setPrintSize);
  return buildWatermarkLayer(options.watermark, doc, {
    width: sheet.width,
    height: sheet.height
  });
}

export function collectSourceCss(srcDoc: Document): Element[] {
  return toArray(srcDoc.querySelectorAll('style, link[rel~="stylesheet"]')).map(
    (n) => n.cloneNode(true) as Element
  );
}

/**
 * builds the whole print document in `doc`. the base href goes in first: the frame
 * is an `about:blank` document, and without it every relative href, src, and
 * imported stylesheet resolves against nothing, which is why the popup path used
 * to render unstyled.
 */
export function assemblePrintDocument(
  doc: Document,
  clones: Element[],
  options: ResolvedOptions,
  srcDoc: Document | null
): void {
  const head = doc.head || doc.getElementsByTagName('head')[0]!;
  const body = doc.body;

  doc.title = options.documentTitle || (srcDoc && srcDoc.title) || 'Print';

  const meta = doc.createElement('meta');
  meta.setAttribute('charset', 'utf-8');
  head.appendChild(meta);

  const baseHref = srcDoc?.baseURI;
  if (baseHref) {
    const base = doc.createElement('base');
    base.setAttribute('href', baseHref);
    head.appendChild(base);
  }

  if (options.keepSourceCSS && srcDoc) {
    collectSourceCss(srcDoc).forEach((n) => head.appendChild(doc.importNode(n, true)));
  }

  const baseStyle = doc.createElement('style');
  baseStyle.textContent = buildPageCss(options);
  head.appendChild(baseStyle);

  if (options.injectCustomStyle) {
    const custom = doc.createElement('style');
    custom.textContent = String(options.injectCustomStyle);
    head.appendChild(custom);
  }

  let contentHost: Element = body;

  // a paginated job puts everything in one host the paginator then deals out
  if (options.paginate) {
    const pages = doc.createElement('div');
    pages.className = 'pc-pages';
    body.appendChild(pages);
    contentHost = pages;
  }

  const useSheet =
    !options.paginate &&
    !!(options.headerText || options.footerText) &&
    options.headerFooterMode === 'repeat';

  if (useSheet) {
    const table = doc.createElement('table');
    table.className = 'pc-sheet';
    const makeBand = (section: 'thead' | 'tfoot', text: string): Element => {
      const band = doc.createElement(section);
      const tr = doc.createElement('tr');
      const td = doc.createElement('td');
      td.textContent = text || '';
      tr.appendChild(td);
      band.appendChild(tr);
      return band;
    };
    if (options.headerText) table.appendChild(makeBand('thead', options.headerText));
    const tbody = doc.createElement('tbody');
    const tr = doc.createElement('tr');
    const td = doc.createElement('td');
    tr.appendChild(td);
    tbody.appendChild(tr);
    table.appendChild(tbody);
    if (options.footerText) table.appendChild(makeBand('tfoot', options.footerText));
    body.appendChild(table);
    contentHost = td;
  } else if (!options.paginate && (options.headerText || options.footerText)) {
    if (options.headerText) {
      const h = doc.createElement('div');
      h.className = 'pc-header';
      h.textContent = options.headerText;
      body.appendChild(h);
    }
    if (options.footerText) {
      const f = doc.createElement('div');
      f.className = 'pc-footer';
      f.textContent = options.footerText;
      body.appendChild(f);
    }
  }

  clones.forEach((clone) => {
    const slot = doc.createElement('div');
    slot.className = 'pc-target';
    slot.appendChild(doc.importNode(clone, true));
    contentHost.appendChild(slot);
  });

  // a paginated job gets its mark from the paginator, once per sheet
  if (!options.paginate) {
    const wm = buildWatermarkNode(options, doc);
    if (wm) body.appendChild(wm);
  }

  if (options.printerMarks) {
    const marks = marksMarkup(doc, options.printerMarks as ResolvedPrinterMarks);
    if (marks) body.appendChild(marks);
  }
}
