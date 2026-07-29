// What can be changed while looking at the proof.
//
// Not everything: only the settings that change what the paper looks like. A
// target selector, an asset timeout or a hook are about how the job runs, and by
// the time there is a sheet on screen they have already run.
//
// Deliberately its own form rather than the print-settings dialog. That one ends
// in Print and Preview, and both are wrong here — the proof *is* the preview, and
// its own Print button is six inches away.

import { modal } from '../ui/kit';
import { resolveSheet } from '../production/sheets';
import type { Env, ResolvedOptions } from '../types';

const PAPER = [
  { value: 'A4', label: 'A4 · 210 × 297 mm' },
  { value: 'A5', label: 'A5 · 148 × 210 mm' },
  { value: 'A3', label: 'A3 · 297 × 420 mm' },
  { value: 'letter', label: 'Letter · 8.5 × 11 in' },
  { value: 'legal', label: 'Legal · 8.5 × 14 in' },
  { value: 'tabloid', label: 'Tabloid · 11 × 17 in' }
];

/**
 * Asks what to change. Resolves with the patch, or null if nothing should.
 *
 * Only the keys that actually moved are returned, so a caller merging the patch
 * does not overwrite an option it never asked about with a default.
 */
export async function askForSettings(
  options: ResolvedOptions,
  env: Env
): Promise<Record<string, unknown> | null> {
  const size = String(options.setPrintSize || 'A4');
  const landscape = /landscape/i.test(size);
  const paper = size.replace(/\s*(landscape|portrait)\s*/i, '').trim() || 'A4';
  const sheet = resolveSheet(options.setPrintSize);

  const result = await modal(
    {
      title: 'Sheet settings',
      description: 'Applied to the proof, and to what prints from it',
      icon: 'settings',
      size: 'md',
      fields: [
        {
          type: 'select',
          name: 'paper',
          label: 'Paper',
          value: PAPER.some((p) => p.value === paper) ? paper : 'A4',
          choices: PAPER,
          hint: 'Currently ' + sheet.label
        },
        { type: 'checkbox', name: 'landscape', label: 'Landscape', value: landscape },
        {
          type: 'length',
          name: 'pageMargin',
          label: 'Margin',
          value: String(options.pageMargin || ''),
          placeholder: '12mm',
          hint: 'Any css length. Empty leaves it to the browser.'
        },
        {
          type: 'checkbox',
          name: 'paginate',
          label: 'Split into real sheets',
          value: !!options.paginate,
          hint: 'Needed for page numbers, borders and a repeating watermark'
        },
        {
          type: 'checkbox',
          name: 'pageNumbers',
          label: 'Number the pages',
          value: !!options.pageNumbers,
          when: (v) => v['paginate'] === true
        },
        {
          type: 'checkbox',
          name: 'coverPage',
          label: 'Cover sheet at the front',
          value: !!options.coverPage
        },
        {
          type: 'checkbox',
          name: 'notesPage',
          label: 'List every mark at the back',
          value: !!options.notesPage
        }
      ],
      actions: [
        { id: 'cancel', label: 'Cancel', tone: 'ghost' },
        { id: 'apply', label: 'Rebuild the sheet', tone: 'primary', icon: 'printer' }
      ]
    },
    env
  );

  if (result.action !== 'apply') return null;

  const v = result.values;
  const nextSize = String(v['paper']) + (v['landscape'] ? ' landscape' : '');
  const patch: Record<string, unknown> = {};

  if (nextSize !== size) patch['setPrintSize'] = nextSize;

  const margin = String(v['pageMargin'] || '').trim();
  if (margin !== String(options.pageMargin || '')) patch['pageMargin'] = margin || null;

  // `paginate` can be an object of its own; only replace it when the switch moved
  if (!!v['paginate'] !== !!options.paginate) patch['paginate'] = v['paginate'];
  if (!!v['pageNumbers'] !== !!options.pageNumbers) patch['pageNumbers'] = v['pageNumbers'];
  if (!!v['coverPage'] !== !!options.coverPage) patch['coverPage'] = v['coverPage'];
  if (!!v['notesPage'] !== !!options.notesPage) patch['notesPage'] = v['notesPage'];

  // nothing moved: rebuilding would be a flicker for no reason
  return Object.keys(patch).length ? patch : null;
}
