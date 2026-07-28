// printer marks: corner crop marks and a bleed inset, drawn on every printed
// page with fixed-position corner elements. true production bleed requires
// printing on oversized stock; this indicates the trim line the way proofing
// tools do.

export interface PrinterMarks {
  /** draw the four corner crop ticks. default true. */
  crop?: boolean;
  /** css length of the bleed inset, e.g. '3mm'. */
  bleed?: string;
  markColor?: string;
  /** css length of each crop tick. */
  markLength?: string;
}

/** post-normalization marks: every field present, so the css builder never guesses. */
export interface ResolvedPrinterMarks extends PrinterMarks {
  crop: boolean;
  bleed: string;
  markColor: string;
  markLength: string;
}

export function normalizeMarks(
  marks: PrinterMarks | boolean | null | undefined
): ResolvedPrinterMarks | null {
  if (!marks) return null;
  const m: PrinterMarks = marks === true ? {} : marks;
  return {
    crop: m.crop !== false,
    bleed: m.bleed || '3mm',
    markColor: m.markColor || '#000',
    markLength: m.markLength || '5mm'
  };
}

export function marksCss(m: ResolvedPrinterMarks): string {
  const css: string[] = [];
  css.push('body { padding: ' + m.bleed + '; box-sizing: border-box; }');
  if (m.crop) {
    css.push(
      [
        '.pc-mark { position: fixed; width: ' + m.markLength + '; height: ' + m.markLength + ';',
        'pointer-events: none; z-index: 2147483646; }',
        '.pc-mark-tl { top: 0; left: 0; border-right: 0.5pt solid ' +
          m.markColor +
          '; border-bottom: 0.5pt solid ' +
          m.markColor +
          ';',
        'transform: translate(calc(' +
          m.bleed +
          ' - ' +
          m.markLength +
          '), calc(' +
          m.bleed +
          ' - ' +
          m.markLength +
          ')); }',
        '.pc-mark-tr { top: 0; right: 0; border-left: 0.5pt solid ' +
          m.markColor +
          '; border-bottom: 0.5pt solid ' +
          m.markColor +
          ';',
        'transform: translate(calc(' +
          m.markLength +
          ' - ' +
          m.bleed +
          '), calc(' +
          m.bleed +
          ' - ' +
          m.markLength +
          ')); }',
        '.pc-mark-bl { bottom: 0; left: 0; border-right: 0.5pt solid ' +
          m.markColor +
          '; border-top: 0.5pt solid ' +
          m.markColor +
          ';',
        'transform: translate(calc(' +
          m.bleed +
          ' - ' +
          m.markLength +
          '), calc(' +
          m.markLength +
          ' - ' +
          m.bleed +
          ')); }',
        '.pc-mark-br { bottom: 0; right: 0; border-left: 0.5pt solid ' +
          m.markColor +
          '; border-top: 0.5pt solid ' +
          m.markColor +
          ';',
        'transform: translate(calc(' +
          m.markLength +
          ' - ' +
          m.bleed +
          '), calc(' +
          m.markLength +
          ' - ' +
          m.bleed +
          ')); }'
      ].join(' ')
    );
  }
  return css.join('\n');
}

export function marksMarkup(doc: Document, m: ResolvedPrinterMarks): Element | null {
  if (!m.crop) return null;
  const wrap = doc.createElement('div');
  wrap.setAttribute('aria-hidden', 'true');
  ['tl', 'tr', 'bl', 'br'].forEach((corner) => {
    const el = doc.createElement('i');
    el.className = 'pc-mark pc-mark-' + corner;
    wrap.appendChild(el);
  });
  return wrap;
}
