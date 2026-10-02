// The component kit: modals, confirms, menus, forms, toolbars and toasts.
//
// Everything the library shows is built from a spec, so these are mostly "does
// the spec produce the right thing", plus the keyboard and focus behaviour,
// which is the part that quietly rots if nobody asserts it.

import { test, expect } from 'vitest';
import { Printcraft, dom, env } from './harness';
import { DAISYUI_CSS } from '../src/ui/kit/daisyui-css';

const ui = Printcraft.ui;

/** lets a queued microtask or timer run before we look at the result */
const tick = (ms = 0): Promise<void> => new Promise((r) => setTimeout(r, ms));

function key(d: ReturnType<typeof dom>, name: string, init: KeyboardEventInit = {}): void {
  d.window.document.dispatchEvent(
    new d.window.KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...init })
  );
}

/* no native dialogs ---------------------------------------------------- */

test('the library never calls prompt, confirm or alert', () => {
  const d = dom('<p id="p">text</p>');
  const called: string[] = [];
  for (const name of ['prompt', 'confirm', 'alert'] as const) {
    Object.defineProperty(d.window, name, {
      configurable: true,
      value: () => {
        called.push(name);
        return null;
      }
    });
  }

  const p = d.window.document.getElementById('p')!;
  void ui.askForNote(p, env(d));

  expect(called, 'a blocking native dialog is never the answer').toEqual([]);
  expect(
    d.window.document.querySelector('[data-prjs-modal]'),
    'a kit modal opened instead'
  ).toBeTruthy();
});

/* modal ----------------------------------------------------------------- */

test('a modal renders its spec and resolves with the action taken', async () => {
  const d = dom('<button id="opener">open</button>');
  const doc = d.window.document;

  const result = ui.modal(
    {
      title: 'Print this region?',
      description: '520 × 220, A4',
      body: ['One paragraph.', 'And another.'],
      actions: [
        { id: 'cancel', label: 'Cancel', tone: 'ghost' },
        { id: 'print', label: 'Print', tone: 'primary' }
      ]
    },
    env(d)
  );

  const panel = doc.querySelector('[role="dialog"]')!;
  expect(panel.getAttribute('aria-modal')).toBe('true');
  expect(panel.querySelector('.prjs-title')!.textContent).toBe('Print this region?');
  expect(panel.querySelector('.prjs-sub')!.textContent).toBe('520 × 220, A4');
  expect(panel.querySelectorAll('.prjs-modal-body p')).toHaveLength(2);

  doc.querySelector<HTMLElement>('[data-prjs-action="print"]')!.click();
  expect((await result).action).toBe('print');
  expect(doc.querySelector('[data-prjs-modal]'), 'and it closes itself').toBeNull();
});

test('escape and the backdrop both dismiss, resolving with no action', async () => {
  const d = dom('');
  const byEscape = ui.modal({ title: 'A' }, env(d));
  key(d, 'Escape');
  expect((await byEscape).action).toBeNull();

  const byBackdrop = ui.modal({ title: 'B' }, env(d));
  const scrim = d.window.document.querySelector('.prjs-scrim')!;
  scrim.dispatchEvent(new d.window.MouseEvent('mousedown', { bubbles: true }));
  expect((await byBackdrop).action).toBeNull();
});

test('a non-dismissible modal ignores escape', async () => {
  const d = dom('');
  const result = ui.modal(
    { title: 'Committing', dismissible: false, actions: [{ id: 'ok', label: 'OK' }] },
    env(d)
  );
  key(d, 'Escape');
  await tick();

  expect(d.window.document.querySelector('[data-prjs-modal]'), 'still open').toBeTruthy();
  d.window.document.querySelector<HTMLElement>('[data-prjs-action="ok"]')!.click();
  expect((await result).action).toBe('ok');
});

test('tab is held inside the modal rather than walking into the page', () => {
  const d = dom('<button id="outside">outside</button>');
  const doc = d.window.document;

  void ui.modal(
    {
      title: 'Trapped',
      actions: [
        { id: 'a', label: 'First' },
        { id: 'b', label: 'Last' }
      ]
    },
    env(d)
  );

  const stops = [...doc.querySelectorAll<HTMLElement>('[data-prjs-modal] button')];
  const last = stops[stops.length - 1]!;
  last.focus();
  key(d, 'Tab');

  expect(doc.activeElement, 'wraps to the first control, not out to the page').toBe(stops[0]);
  expect(doc.getElementById('outside')).not.toBe(doc.activeElement);
});

test('focus goes back where it came from', async () => {
  const d = dom('<button id="opener">open</button>');
  const opener = d.window.document.getElementById('opener') as HTMLButtonElement;
  opener.focus();

  const result = ui.modal({ title: 'Hi' }, env(d));
  expect(d.window.document.activeElement).not.toBe(opener);

  key(d, 'Escape');
  await result;
  expect(d.window.document.activeElement, 'returned to the opener').toBe(opener);
});

/* prompt replacement ---------------------------------------------------- */

test('prompt collects a value and cancel yields null', async () => {
  const d = dom('');
  const doc = d.window.document;

  const asked = ui.prompt({ title: 'Note', label: 'Text', value: 'before' }, env(d));
  const field = doc.querySelector<HTMLTextAreaElement>('.prjs-textarea, .prjs-input')!;
  expect(field.value, 'seeded with the current value').toBe('before');

  field.value = 'after';
  doc.querySelector<HTMLElement>('[data-prjs-action="save"]')!.click();
  expect(await asked).toBe('after');

  const cancelled = ui.prompt({ title: 'Note', label: 'Text' }, env(d));
  doc.querySelector<HTMLElement>('[data-prjs-action="cancel"]')!.click();
  expect(await cancelled).toBeNull();
});

test('askForNote writes the attribute the pipeline reads', async () => {
  const d = dom('<p id="p">clause 7</p>');
  const doc = d.window.document;
  const p = doc.getElementById('p')!;

  const asked = ui.askForNote(p, env(d));
  doc.querySelector<HTMLTextAreaElement>('.prjs-textarea')!.value = 'check with legal';
  doc.querySelector<HTMLElement>('[data-prjs-action="save"]')!.click();

  expect(await asked).toBe('check with legal');
  expect(p.getAttribute('data-printcraft-note')).toBe('check with legal');
});

/* confirm --------------------------------------------------------------- */

test('confirm resolves true or false, and shows the stakes', async () => {
  const d = dom('');
  const doc = d.window.document;

  const yes = ui.confirm(
    {
      title: 'Redact 4 regions?',
      message: 'The text underneath is destroyed.',
      detail: 'This cannot be undone in the print copy.',
      tone: 'danger'
    },
    env(d)
  );
  expect(doc.querySelector('.prjs-modal-body')!.textContent).toContain('cannot be undone');
  expect(doc.querySelector('[data-prjs-action="yes"]')!.getAttribute('data-tone')).toBe('danger');

  doc.querySelector<HTMLElement>('[data-prjs-action="yes"]')!.click();
  expect(await yes).toBe(true);

  const no = ui.confirm({ title: 'Sure?', message: 'Really?' }, env(d));
  doc.querySelector<HTMLElement>('[data-prjs-action="no"]')!.click();
  expect(await no).toBe(false);
});

/* forms ----------------------------------------------------------------- */

test('a form renders every field type and reports its values', async () => {
  const d = dom('');
  const doc = d.window.document;

  const result = ui.modal(
    {
      title: 'Settings',
      fields: [
        { type: 'text', name: 'title', label: 'Title', value: 'Invoice' },
        { type: 'length', name: 'margin', label: 'Margin', value: '18mm' },
        { type: 'number', name: 'copies', label: 'Copies', value: 2 },
        { type: 'checkbox', name: 'marks', label: 'Crop marks', value: true },
        { type: 'color', name: 'border', label: 'Border', value: '#17181b' },
        {
          type: 'select',
          name: 'size',
          label: 'Paper',
          value: 'A4',
          choices: [
            { value: 'A4', label: 'A4' },
            { value: 'letter', label: 'Letter' }
          ]
        }
      ],
      actions: [{ id: 'save', label: 'Save', tone: 'primary' }]
    },
    env(d)
  );

  expect(doc.querySelectorAll('.prjs-field')).toHaveLength(6);
  doc.querySelector<HTMLElement>('[data-prjs-action="save"]')!.click();

  const { values } = await result;
  expect(values).toMatchObject({
    title: 'Invoice',
    margin: '18mm',
    copies: 2,
    marks: true,
    size: 'A4'
  });
});

test('validation blocks the primary action and names the problem', async () => {
  const d = dom('');
  const doc = d.window.document;

  const result = ui.modal(
    {
      title: 'Send',
      fields: [
        { type: 'email', name: 'to', label: 'To', required: true },
        { type: 'length', name: 'margin', label: 'Margin', value: 'nonsense' }
      ],
      actions: [
        { id: 'cancel', label: 'Cancel', tone: 'ghost' },
        { id: 'send', label: 'Send', tone: 'primary' }
      ]
    },
    env(d)
  );

  doc.querySelector<HTMLElement>('[data-prjs-action="send"]')!.click();
  await tick();

  expect(doc.querySelector('[data-prjs-modal]'), 'still open, nothing sent').toBeTruthy();
  const errors = [...doc.querySelectorAll('.prjs-error')].filter((e) => !(e as HTMLElement).hidden);
  expect(errors.map((e) => e.textContent).join(' ')).toContain('To is required');

  // fix both and it goes through
  const to = doc.querySelector<HTMLInputElement>('#prjs-f-to')!;
  to.value = 'a@b.co';
  to.dispatchEvent(new d.window.Event('input', { bubbles: true }));
  const margin = doc.querySelector<HTMLInputElement>('#prjs-f-margin')!;
  margin.value = '18mm';
  margin.dispatchEvent(new d.window.Event('input', { bubbles: true }));

  doc.querySelector<HTMLElement>('[data-prjs-action="send"]')!.click();
  expect((await result).action).toBe('send');
});

test('a field with `when` appears only while its condition holds', () => {
  const d = dom('');
  const doc = d.window.document;

  void ui.modal(
    {
      title: 'Marks',
      fields: [
        { type: 'checkbox', name: 'marks', label: 'Crop marks', value: false },
        {
          type: 'length',
          name: 'bleed',
          label: 'Bleed',
          value: '3mm',
          when: (v) => v['marks'] === true
        }
      ]
    },
    env(d)
  );

  const bleed = doc.querySelector<HTMLElement>('#prjs-f-bleed')!.closest('.prjs-field')!;
  expect((bleed as HTMLElement).hidden, 'hidden while the box is clear').toBe(true);

  const box = doc.querySelector<HTMLInputElement>('#prjs-f-marks')!;
  box.checked = true;
  box.dispatchEvent(new d.window.Event('change', { bubbles: true }));
  expect((bleed as HTMLElement).hidden).toBe(false);
});

/* menu ------------------------------------------------------------------ */

test('a menu renders groups, separators, icons and keyboard hints', () => {
  const d = dom('<p>page</p>');
  const doc = d.window.document;

  const handle = ui.menu(
    {
      anchor: { x: 40, y: 40 },
      entries: [
        { group: 'Print' },
        { id: 'a', label: 'Print this', icon: 'printer', kbd: '⌘P' },
        { separator: true },
        { id: 'b', label: 'Redact', icon: 'redact', hint: 'destructive' },
        { id: 'c', label: 'Hidden', when: () => false }
      ]
    },
    env(d)
  );

  const menu = doc.querySelector('[data-prjs-menu]')!;
  expect(menu.getAttribute('role')).toBe('menu');
  expect(menu.querySelectorAll('[data-prjs-item]')).toHaveLength(2);
  expect(menu.querySelector('.prjs-group')!.textContent).toBe('Print');
  expect(menu.querySelectorAll('.prjs-sep')).toHaveLength(1);
  expect(menu.querySelector('.prjs-item-kbd')!.textContent).toBe('⌘P');
  expect(menu.querySelectorAll('svg').length).toBeGreaterThanOrEqual(2);

  handle.close();
  expect(doc.querySelector('[data-prjs-menu]')).toBeNull();
});

test('menu items run with the context they were given', () => {
  const d = dom('<p id="p">x</p>');
  const doc = d.window.document;
  const seen: string[] = [];

  ui.menu(
    {
      anchor: { x: 10, y: 10 },
      context: { label: 'ctx' },
      entries: [{ id: 'go', label: 'Go', run: (c: { label: string }) => seen.push(c.label) }]
    },
    env(d)
  );

  doc.querySelector<HTMLElement>('[data-prjs-item="go"]')!.click();
  expect(seen).toEqual(['ctx']);
  expect(doc.querySelector('[data-prjs-menu]'), 'and the menu closes').toBeNull();
});

test('arrow keys walk the menu and escape closes it', () => {
  const d = dom('');
  const doc = d.window.document;

  ui.menu(
    {
      anchor: { x: 10, y: 10 },
      entries: [
        { id: 'one', label: 'One' },
        { id: 'two', label: 'Two' }
      ]
    },
    env(d)
  );

  key(d, 'ArrowDown');
  expect(doc.activeElement?.getAttribute('data-prjs-item')).toBe('two');
  key(d, 'ArrowUp');
  expect(doc.activeElement?.getAttribute('data-prjs-item')).toBe('one');

  key(d, 'Escape');
  expect(doc.querySelector('[data-prjs-menu]')).toBeNull();
});

test('a disabled item cannot be reached or run', () => {
  const d = dom('');
  const doc = d.window.document;
  let ran = false;

  ui.menu(
    {
      anchor: { x: 10, y: 10 },
      entries: [
        { id: 'off', label: 'Off', disabled: true, run: () => (ran = true) },
        { id: 'on', label: 'On' }
      ]
    },
    env(d)
  );

  doc.querySelector<HTMLElement>('[data-prjs-item="off"]')!.click();
  expect(ran).toBe(false);
  key(d, 'ArrowDown');
  expect(doc.activeElement?.getAttribute('data-prjs-item'), 'skipped in the keyboard order').toBe(
    'on'
  );
});

/* toolbar and toast ----------------------------------------------------- */

test('a toolbar reports status and can disable its actions', () => {
  const d = dom('');
  const doc = d.window.document;

  const bar = ui.toolbar(
    {
      status: 'Nothing selected',
      actions: [
        { id: 'print', label: 'Print', disabled: true, onSelect: () => undefined },
        { id: 'cancel', label: 'Cancel', onSelect: () => undefined }
      ]
    },
    env(d)
  );

  expect(doc.querySelector('[data-prjs-status]')!.textContent).toBe('Nothing selected');
  expect(doc.querySelector<HTMLButtonElement>('[data-prjs-act="print"]')!.disabled).toBe(true);

  bar.setStatus('2 selected');
  bar.setDisabled('print', false);
  expect(doc.querySelector('[data-prjs-status]')!.textContent).toBe('2 selected');
  expect(doc.querySelector<HTMLButtonElement>('[data-prjs-act="print"]')!.disabled).toBe(false);

  bar.close();
  expect(doc.querySelector('[data-prjs-toolbar]')).toBeNull();
});

test('a toast shows, offers an action, and clears itself', async () => {
  const d = dom('');
  const doc = d.window.document;
  let undone = false;

  ui.toast(
    { message: 'Marked for redaction', action: { label: 'Undo', onSelect: () => (undone = true) } },
    env(d)
  );

  const node = doc.querySelector('[data-prjs-toast]')!;
  expect(node.textContent).toContain('Marked for redaction');

  node.querySelector<HTMLElement>('.prjs-btn')!.click();
  expect(undone).toBe(true);
  expect(doc.querySelector('[data-prjs-toast]'), 'dismissed once acted on').toBeNull();

  ui.toast({ message: 'Gone shortly', duration: 20 }, env(d));
  await tick(40);
  expect(doc.querySelector('[data-prjs-toast]')).toBeNull();
});

/* theming --------------------------------------------------------------- */

test('the theme is one set of tokens a host can override', () => {
  const d = dom('');
  const doc = d.window.document;

  ui.theme.set({ accent: '#ff00aa', radiusField: '2px' }, doc);
  ui.toast({ message: 'themed' }, env(d));

  const sheet = doc.getElementById('prjs-kit-style')!.textContent || '';

  // daisyUI's names are the ones to set, and the short names point at them
  expect(sheet).toContain('--prjs-radius-field: 2px');
  expect(sheet, 'the old radius name still resolves').toContain(
    '--prjs-radius: var(--prjs-radius-field)'
  );
  expect(sheet).toContain('--prjs-color-accent: #ff00aa');
  expect(sheet).toContain('--prjs-accent: var(--prjs-color-accent)');
  expect(sheet, 'accent is its own colour, not a second name for primary').not.toContain(
    '--prjs-color-primary: #ff00aa'
  );

  ui.theme.reset(doc);
});

test('all eight daisyUI tones are emitted, and the two old names still work', () => {
  const d = dom('');
  const doc = d.window.document;

  ui.theme.set({ danger: '#ff0000', warn: '#ffaa00' }, doc);
  const sheet = doc.getElementById('prjs-kit-style')!.textContent || '';

  for (const tone of [
    'primary',
    'secondary',
    'accent',
    'neutral',
    'info',
    'success',
    'warning',
    'error'
  ]) {
    expect(sheet, tone + ' is missing').toContain('--prjs-color-' + tone + ':');
    expect(sheet, tone + ' has no content colour').toContain('--prjs-color-' + tone + '-content:');
  }

  // `danger` and `warn` are what `error` and `warning` used to be called
  expect(sheet).toContain('--prjs-color-error: #ff0000');
  expect(sheet).toContain('--prjs-color-warning: #ffaa00');
  expect(sheet).toContain('--prjs-danger: var(--prjs-error)');
  expect(sheet).toContain('--prjs-warn: var(--prjs-warning)');

  ui.theme.reset(doc);
});

test('a tone can be one colour, and the rest is worked out', () => {
  const d = dom('');
  const doc = d.window.document;

  ui.theme.set({ primary: '#7c3aed' }, doc);
  const sheet = doc.getElementById('prjs-kit-style')!.textContent || '';

  expect(sheet).toContain('--prjs-color-primary: #7c3aed');
  expect(sheet, 'the border follows the background').toContain('--prjs-primary-border: #7c3aed');
  expect(sheet, 'and the soft variant is derived').toContain(
    '--prjs-primary-soft: rgba(124,58,237,.10)'
  );

  ui.theme.reset(doc);
});

test('the kit follows the host into dark mode, and can be pinned', () => {
  const d = dom('');
  const doc = d.window.document;

  const auto = (() => {
    ui.theme.set(ui.theme.defaults, doc);
    return doc.getElementById('prjs-kit-style')!.textContent || '';
  })();
  expect(auto, 'a print tool on a dark app should not be the one white rectangle').toContain(
    '@media (prefers-color-scheme: dark)'
  );

  ui.theme.set({ colorScheme: 'light' }, doc);
  expect(doc.getElementById('prjs-kit-style')!.textContent).not.toContain('prefers-color-scheme');

  ui.theme.set({ colorScheme: 'dark' }, doc);
  const dark = doc.getElementById('prjs-kit-style')!.textContent || '';
  expect(dark, 'pinned dark needs no media query').not.toContain('prefers-color-scheme');
  expect(dark).toContain('--prjs-color-base-100: #1c1d21');
  // and the rest of the sheet follows from that one variable
  expect(dark).toContain('--prjs-paper: var(--prjs-color-base-100)');

  ui.theme.reset(doc);
});

test('every surface the kit builds is marked as printcraft ui', () => {
  const d = dom('');
  const doc = d.window.document;

  void ui.modal({ title: 'x' }, env(d));
  ui.toast({ message: 'y' }, env(d));
  ui.menu({ anchor: { x: 1, y: 1 }, entries: [{ id: 'a', label: 'A' }] }, env(d));

  // clip jobs strip [data-prjs-ui], which is how the interface stays out of its
  // own screenshot
  const surfaces = doc.querySelectorAll('body > *');
  for (const el of surfaces) {
    expect(el.hasAttribute('data-prjs-ui'), el.className || el.tagName).toBe(true);
  }
});

/* the vendored daisyUI sheet ------------------------------------------- */

test('the vendored daisyUI sheet has every variant, no breakpoint copies and no bare class', () => {
  // selectors only: url(), strings and the innermost declaration blocks out first
  const selectors = DAISYUI_CSS.replace(/url\([^)]*\)/gi, '')
    .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '')
    .replace(/\{[^{}]*\}/g, '{}');

  // a class may start with an escape: Tailwind writes `2xl:` as `.\32 xl\:`,
  // which an identifier-only pattern skips straight over
  const classes = [
    ...selectors.matchAll(/\.((?:\\[0-9a-fA-F]{1,6} ?|[a-zA-Z_-])(?:\\.|[\w-])*)/g)
  ].map((m) => m[1]!);
  const unique = new Set(classes);

  expect(classes.length, 'the pattern stopped matching the sheet').toBeGreaterThan(200);

  const bare = [...unique].filter((c) => c !== 'prjs' && !c.startsWith('prjs-'));
  expect(bare, 'these would reach the host page').toEqual([]);

  // daisyUI repeats each component under sm: md: lg: xl: 2xl:; the kit sizes
  // through data-size, and the renamed `prjs-sm:btn` is a spelling nobody writes
  const responsive = [...unique].filter((c) => /^prjs-(?:sm|md|lg|xl|2xl)\\:/.test(c));
  expect(responsive, 'breakpoint variants are dead weight in the bundle').toEqual([]);

  // and the variants the docs promise are all still there
  for (const variant of [
    'prjs-btn-outline',
    'prjs-btn-ghost',
    'prjs-btn-soft',
    'prjs-btn-primary',
    'prjs-btn-xs',
    'prjs-btn-xl',
    'prjs-input-sm',
    'prjs-select-error',
    'prjs-textarea-lg',
    'prjs-range-xs',
    'prjs-checkbox-primary',
    'prjs-radio-xl',
    'prjs-modal-box',
    'prjs-modal-bottom',
    'prjs-card-body',
    'prjs-badge-soft',
    'prjs-kbd-sm',
    'prjs-fieldset-legend'
  ]) {
    expect(unique.has(variant), variant + ' is missing').toBe(true);
  }
});
