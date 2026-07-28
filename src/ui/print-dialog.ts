// Our own print settings dialog.
//
// The browser's dialog cannot be replaced. `window.print()` always hands off to
// it and there is no API to style, suppress or pre-fill it — that is a platform
// limit, not an oversight, and any library claiming otherwise is describing
// something else.
//
// What can be owned is everything up to the handoff: paper, orientation,
// margins, borders, page numbers, redaction and a true-scale preview of the
// result. By the time the browser's dialog appears, every decision that matters
// has already been made here. The one setting still living over there is
// "Headers and footers", and `hideBrowserHeaderFooter` takes that away too.

import { modal, toast, type Field, type FieldValue } from './kit';
import { defaultEnv, type UiDeps } from './shared';
import type { Env, InspectController, JobRecord, PrintcraftOptions } from '../types';

export interface PrintDialogOptions extends PrintcraftOptions {
  /** shown as the dialog's subtitle */
  summary?: string;
  /** which controls to offer. all of them by default. */
  sections?: Array<'paper' | 'margins' | 'pages' | 'content' | 'privacy'>;
}

export interface PrintDialogResult {
  action: 'print' | 'preview' | 'cancel';
  options: PrintcraftOptions;
  job?: JobRecord | InspectController;
}

const PAPER = [
  { value: 'A4', label: 'A4 · 210 × 297 mm' },
  { value: 'A5', label: 'A5 · 148 × 210 mm' },
  { value: 'A3', label: 'A3 · 297 × 420 mm' },
  { value: 'letter', label: 'Letter · 8.5 × 11 in' },
  { value: 'legal', label: 'Legal · 8.5 × 14 in' },
  { value: 'ledger', label: 'Ledger · 11 × 17 in' }
];

const POSITIONS = [
  { value: 'bottom-center', label: 'Bottom, centred' },
  { value: 'bottom-right', label: 'Bottom, right' },
  { value: 'bottom-left', label: 'Bottom, left' },
  { value: 'top-center', label: 'Top, centred' },
  { value: 'top-right', label: 'Top, right' },
  { value: 'top-left', label: 'Top, left' }
];

/** Turns the form's flat values back into printcraft options. */
export function optionsFromForm(
  values: Record<string, FieldValue>,
  base: PrintcraftOptions = {}
): PrintcraftOptions {
  const paper = String(values['paper'] || 'A4');
  const landscape = values['orientation'] === 'landscape';
  const paginate = values['paginate'] === true;

  const options: PrintcraftOptions = {
    ...base,
    setPrintSize: landscape ? paper + ' landscape' : paper,
    pageMargin: String(values['margin'] || '') || null,
    paginate,
    hideBrowserHeaderFooter: values['hideBrowserChrome'] === true
  };

  if (values['title']) options.documentTitle = String(values['title']);
  if (values['header']) options.pageHeader = String(values['header']);
  if (values['footer']) options.pageFooter = String(values['footer']);

  if (paginate) {
    options.pagePadding = String(values['padding'] || '') || undefined;
    if (values['pageNumbers'] === true) {
      options.pageNumbers = {
        template: String(values['numberTemplate'] || 'Page {page} of {pages}'),
        position: (values['numberPosition'] as never) || 'bottom-center'
      };
    }
    if (values['border'] === true) {
      options.pageBorder = {
        width: String(values['borderWidth'] || '1px'),
        color: String(values['borderColor'] || '#17181b'),
        style: (values['borderStyle'] as never) || 'solid'
      };
    }
  }

  if (values['privacy'] === true) options.privacy = true;
  if (values['excludeSelectors']) {
    options.excludeSelectorList = String(values['excludeSelectors'])
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (values['redactSelectors']) {
    options.redactSelectorList = String(values['redactSelectors'])
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  return options;
}

/**
 * Opens the settings dialog. Preview reruns the same options into the inspector;
 * Print hands off to the browser with everything already decided.
 */
export async function printDialog(
  deps: UiDeps,
  base: PrintDialogOptions = {},
  env?: Env
): Promise<PrintDialogResult> {
  const scope = env || defaultEnv();
  const sections = base.sections || ['paper', 'margins', 'pages', 'content', 'privacy'];
  const wants = (name: string): boolean => sections.includes(name as never);

  const currentSize = String(base.setPrintSize || 'A4');
  const landscape = /landscape/i.test(currentSize);
  const paper = currentSize.replace(/\s*(landscape|portrait)\s*/i, '').trim() || 'A4';

  const result = await modal(
    {
      title: 'Print settings',
      description: base.summary || 'Everything here is decided before the browser dialog opens.',
      size: 'lg',
      fields: [
        {
          type: 'text',
          name: 'title',
          label: 'Document title',
          value: String(base.documentTitle || ''),
          hint: 'Most browsers use this as the filename when saving as PDF'
        },

        ...(wants('paper')
          ? ([
              { type: 'select', name: 'paper', label: 'Paper', value: paper, choices: PAPER },
              {
                type: 'radio',
                name: 'orientation',
                label: 'Orientation',
                value: landscape ? 'landscape' : 'portrait',
                choices: [
                  { value: 'portrait', label: 'Portrait' },
                  { value: 'landscape', label: 'Landscape' }
                ]
              }
            ] satisfies Field[])
          : []),

        ...(wants('margins')
          ? ([
              {
                type: 'length',
                name: 'margin',
                label: 'Margin',
                value: String(base.pageMargin || '18mm'),
                hint: 'Any css length: 18mm, 0.5in, 24px'
              }
            ] satisfies Field[])
          : []),

        ...(wants('pages')
          ? ([
              {
                type: 'checkbox',
                name: 'paginate',
                label: 'Lay out real pages',
                value: base.paginate === true,
                hint: 'Needed for page numbers, per-page borders and padding. Browsers cannot number pages on their own.'
              },
              {
                type: 'length',
                name: 'padding',
                label: 'Page padding',
                value: '12mm',
                when: (v) => v['paginate'] === true
              },
              {
                type: 'checkbox',
                name: 'pageNumbers',
                label: 'Number the pages',
                value: !!base.pageNumbers,
                when: (v) => v['paginate'] === true
              },
              {
                type: 'text',
                name: 'numberTemplate',
                label: 'Number format',
                value: 'Page {page} of {pages}',
                hint: 'Placeholders: {page} {pages} {title} {date}',
                when: (v) => v['paginate'] === true && v['pageNumbers'] === true
              },
              {
                type: 'select',
                name: 'numberPosition',
                label: 'Number position',
                value: 'bottom-center',
                choices: POSITIONS,
                when: (v) => v['paginate'] === true && v['pageNumbers'] === true
              },
              {
                type: 'checkbox',
                name: 'border',
                label: 'Draw a border round each page',
                value: !!base.pageBorder,
                when: (v) => v['paginate'] === true
              },
              {
                type: 'length',
                name: 'borderWidth',
                label: 'Border width',
                value: '1px',
                when: (v) => v['paginate'] === true && v['border'] === true
              },
              {
                type: 'color',
                name: 'borderColor',
                label: 'Border colour',
                value: '#17181b',
                when: (v) => v['paginate'] === true && v['border'] === true
              },
              {
                type: 'select',
                name: 'borderStyle',
                label: 'Border style',
                value: 'solid',
                choices: [
                  { value: 'solid', label: 'Solid' },
                  { value: 'dashed', label: 'Dashed' },
                  { value: 'dotted', label: 'Dotted' },
                  { value: 'double', label: 'Double' }
                ],
                when: (v) => v['paginate'] === true && v['border'] === true
              }
            ] satisfies Field[])
          : []),

        ...(wants('content')
          ? ([
              {
                type: 'text',
                name: 'header',
                label: 'Running header',
                value: String(base.pageHeader || base.headerText || ''),
                placeholder: 'Optional'
              },
              {
                type: 'text',
                name: 'footer',
                label: 'Running footer',
                value: String(base.pageFooter || base.footerText || ''),
                placeholder: 'Optional'
              },
              {
                type: 'text',
                name: 'excludeSelectors',
                label: 'Leave out',
                placeholder: '.ads, nav',
                hint: 'Comma-separated css selectors'
              },
              {
                type: 'checkbox',
                name: 'hideBrowserChrome',
                label: "Hide the browser's own header and footer",
                value: base.hideBrowserHeaderFooter !== false,
                hint: 'Removes the date, title, URL and page count the browser prints into the margin. Works in Chromium and Firefox.'
              }
            ] satisfies Field[])
          : []),

        ...(wants('privacy')
          ? ([
              {
                type: 'checkbox',
                name: 'privacy',
                label: 'Blank emails, phone numbers, SSNs and card numbers',
                value: base.privacy === true
              },
              {
                type: 'text',
                name: 'redactSelectors',
                label: 'Redact',
                placeholder: '.ssn, .codename',
                hint: 'Destructive: the text is replaced, not covered'
              }
            ] satisfies Field[])
          : [])
      ],
      actions: [
        { id: 'cancel', label: 'Cancel', tone: 'ghost' },
        { id: 'preview', label: 'Preview', icon: 'inspect', validates: true },
        { id: 'print', label: 'Print', tone: 'primary', icon: 'printer' }
      ]
    },
    scope
  );

  if (result.action !== 'print' && result.action !== 'preview') {
    return { action: 'cancel', options: base };
  }

  const options = optionsFromForm(result.values, base);

  if (result.action === 'preview') {
    const job = await deps.inspect(options, scope);
    return { action: 'preview', options, job };
  }

  const job = await deps.print(options, scope);
  if ((job as JobRecord)?.pages) {
    toast({ message: (job as JobRecord).pages + ' pages sent to the printer' }, scope);
  }
  return { action: 'print', options, job };
}
