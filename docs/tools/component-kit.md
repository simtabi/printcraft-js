# The component kit

Modals, confirms, menus, forms, toolbars, toasts, tooltips, popovers and a command palette. Everything the library draws, exported so a host can draw the same things.

## Why it is public

Printcraft needs surfaces of its own: a confirm before a destructive redaction, a dialog for print settings, a menu, a panel listing notes. Building those and keeping them private would mean an app that adds one print-related dialog of its own has a dialog that does not match the four beside it.

They are also the answer to a rule the library will not break: **no `window.alert`, `confirm` or `prompt`**. Those block the event loop, cannot be styled, are suppressed in cross-origin frames, and look like 1998.

```js
const ok = await Printcraft.ui.confirm({
  title: 'Send to the printer?',
  message: '14 pages, single-sided.',
  confirmLabel: 'Print'
});
```

## Modals

Built from a spec rather than markup, so a modal is data:

```js
const result = await Printcraft.ui.modal({
  title: 'Export',
  description: 'Everything here is decided before the browser dialog opens.',
  icon: 'printer',
  size: 'md',
  fields: [
    { type: 'text', name: 'title', label: 'Document title', required: true },
    {
      type: 'select',
      name: 'paper',
      label: 'Paper',
      value: 'A4',
      choices: [
        { value: 'A4', label: 'A4' },
        { value: 'letter', label: 'Letter' }
      ]
    },
    { type: 'length', name: 'margin', label: 'Margin', value: '18mm', hint: 'Any css length' },
    { type: 'checkbox', name: 'numbers', label: 'Number the pages' },
    { type: 'text', name: 'template', label: 'Number format', when: (v) => v.numbers === true }
  ],
  actions: [
    { id: 'cancel', label: 'Cancel', tone: 'ghost' },
    { id: 'export', label: 'Export', tone: 'primary', validates: true }
  ]
});

result.action; // 'export', 'cancel', or null when dismissed
result.values; // { title, paper, margin, numbers, template }
```

`size` is `sm`, `md`, `lg` or `full`. `body` takes a string, an array of paragraphs, or a node you built.

### Fields

`text` · `textarea` · `select` · `radio` · `checkbox` · `number` · `range` · `color` · `length`

`color` is [Coloris](https://github.com/melloware/coloris) with an opacity channel, a row of
one-click swatches, and validation on anything typed. `range` carries a live readout and a
`unit`. Both are fields like any other, so they get the label, hint and error slot.

| Key                | What it does                                                      |
| ------------------ | ----------------------------------------------------------------- |
| `value`            | The initial value                                                 |
| `hint`             | A line under the control                                          |
| `placeholder`      | —                                                                 |
| `required`         | Blocks a `validates: true` action                                 |
| `when`             | `(values) => boolean`; hides the field until it is true           |
| `validate`         | `(value, values) => string \| null`; the string becomes the error |
| `rows`             | `textarea` only                                                   |
| `choices`          | `select` and `radio`                                              |
| `min` `max` `step` | `number` and `range`                                              |
| `unit`             | `range` only; printed after the readout                           |
| `swatches`         | `color` only; the one-click row under the field                   |

`length` validates a css length, so `18mm`, `0.5in` and `24px` pass and `quite a lot` does not. The error belongs to the field that has it, not to whichever is first.

## Confirms and notices

```js
await Printcraft.ui.confirm({
  title: 'Destroy this text?',
  message: '3 marks would be applied.',
  detail: 'The text is replaced in the print copy, not covered over.',
  confirmLabel: 'Redact',
  tone: 'danger'
});

await Printcraft.ui.notify({ title: 'It did not send', message: reason, tone: 'danger' });
const text = await Printcraft.ui.prompt({ label: 'Note', multiline: true });
```

`detail` is worth filling in for anything irreversible: the message says what, the detail says what it costs.

## Menus

```js
Printcraft.ui.menu({
  anchor: { x: event.clientX, y: event.clientY },
  title: 'Row actions',
  description: 'Applies to the selected row',
  icon: 'pages',
  entries: [
    { group: 'Print' },
    { id: 'print', label: 'Print it', icon: 'printer', kbd: ['Ctrl', 'P'], run: print },
    { separator: true },
    {
      id: 'del',
      label: 'Delete',
      icon: 'trash',
      tone: 'danger',
      hint: 'Cannot be undone',
      run: remove
    },
    { id: 'lock', label: 'Locked', disabled: 'Sign in to change this' },
    { id: 'more', label: 'More', items: [{ id: 'a', label: 'A', run: a }] }
  ]
});
```

Submenus, separators, group headings, arrow keys, Home/End, type-ahead and a checked state come with it. `disabled` as a **string** disables the row and says why, because a greyed-out row that will not explain itself is worse than no row.

## Toolbars and toasts

```js
const bar = Printcraft.ui.toolbar({
  label: 'Selecting',
  status: 'Drag to select an area',
  actions: [
    { id: 'go', label: 'Continue', icon: 'printer', tone: 'primary', onSelect: go },
    { id: 'cancel', label: 'Cancel', icon: 'close', onSelect: stop }
  ]
});
bar.setStatus('2 selected');
bar.setDisabled('go', false);
bar.close();
```

```js
Printcraft.ui.toast({
  message: 'Copied as an image',
  tone: 'success',
  action: { label: 'Undo', onSelect: undo }
});
```

Tones are daisyUI's eight — `primary`, `secondary`, `accent`, `neutral`, `info`, `success`,
`warning`, `error` — plus `default`, and `ghost` and `quiet`, which are shapes rather than
colours. `danger` and `warn` still work; they are what `error` and `warning` used to be
called.

## Tooltips and popovers

See [the interaction layer](interaction-ui.md#tooltips-and-popovers). Both use the platform's
`popover` attribute and CSS anchor positioning where they exist, and both carry a triangle
caret pointing at their anchor.

The caret's direction is read back from the rendered geometry rather than taken from the
`side` that was asked for. With CSS anchor positioning the browser applies
`position-try-fallbacks` itself, so a popover asked for `top` may well be drawn below and
nothing announces it; comparing the two rectangles after paint is the only way to know. The
resolved side lands on `data-side`, and the caret is placed from that.

## The command palette

```js
Printcraft.ui.openPalette({
  items: [
    {
      id: 'a',
      label: 'Archive this invoice',
      description: 'Moves it out of the queue',
      icon: 'pages',
      group: 'Invoice',
      keys: ['⌘', 'A'],
      keywords: ['file', 'store']
    }
  ],
  placeholder: 'Search…',
  onPick: (id) => run(id)
});
```

Matching is by subsequence, so `ati` finds "Archive this invoice", and the characters that matched are marked.

## The anatomy

Component parts follow daisyUI's naming, so anyone who knows that system knows this one:

```
prjs-modal ▸ prjs-modal-box
   ├ prjs-modal-head      icon · title · description · ✕
   ├ prjs-modal-body      only rendered when there is something to put in it
   └ prjs-modal-action    buttons, primary last
```

`prjs-card` → `prjs-card-body` / `prjs-card-actions`, `prjs-btn` with `data-tone` and
`data-size`, `prjs-menu` + `prjs-menu-title`, plus `prjs-badge`, `prjs-input`, `prjs-kbd`
and `prjs-caret`.

Tokens follow daisyUI's too: `--prjs-color-primary`, `--prjs-color-base-100`,
`--prjs-color-*-content`, `--prjs-radius-selector/field/box`, `--prjs-size-selector/field`,
`--prjs-border`, `--prjs-depth`, `--prjs-noise`. Setting one moves everything drawn in it.

**It is daisyUI, not an impression of it.** `tools/vendor-daisyui.mjs` takes daisyUI's own
component stylesheets, unwraps the `@layer` blocks Tailwind needs and we do not, and renames
every class to carry the `prjs-` prefix. `.btn` becomes `.prjs-btn`, `.modal-box` becomes
`.prjs-modal-box`. The result is bundled, so a `.prjs-btn` is a daisyUI button — every size,
every tone, the outline and ghost variants, the focus ring — rather than four hundred lines
of ours pretending to be one.

Thirteen components are taken: `button`, `input`, `select`, `textarea`, `range`, `checkbox`,
`radio`, `fieldset`, `label`, `modal`, `card`, `badge`, `kbd`. A component only earns its
bytes when our anatomy is its anatomy. daisyUI's menu is `ul.menu > li > a` and ours is
buttons in a div, because a row carries an icon, a hint, a key cap and a submenu arrow and an
`<a>` is the wrong element for all four; its tooltip is a `::before` driven by `data-tip` and
ours is a real node in the top layer with a caret. Shipping either would be kilobytes of
rules matching nothing.

**Prefixing is not optional.** daisyUI's class names are global. A library that injected
`.btn` and `.modal` into a host document would restyle that host's own buttons and collide
outright with a host already running daisyUI at another version. There is a test asserting
that every class in the injected sheet carries the prefix.

The variables daisyUI reads — `--color-base-100`, `--size-field`, `--border`, `--depth` — are
declared on `.prjs` rather than `:root`. Custom properties inherit downward only, so they
reach every rule inside our surfaces and nothing outside them: a host's own `--color-primary`
is neither read nor overwritten.

```bash
npm run vendor:daisyui   # regenerate after upgrading daisyui
npm run vendor:audit     # tokens in step, and both vendored sheets current
```

A modal with no body renders no body element. It used to render an empty band between the
title and the buttons.

Every dismissible surface carries exactly one close affordance in its header: an icon-only
`×` with `data-prjs-modal-close`. The footer keeps the semantic action.

## Building your own

```js
import { h, root, iconNode, button } from '@simtabi/printcraft/ui';

const panel = root(document, 'div', { class: 'prjs prjs-modal-box', attrs: { 'data-size': 'md' } });
panel.appendChild(
  h(document, 'div', {
    class: 'prjs-modal-head',
    children: [h(document, 'h2', { class: 'prjs-title', text: 'My panel' })]
  })
);
```

`root` adds the `prjs` class the stylesheet hangs off and injects the sheet if it is not there; `h` is the same without it, for children. Every node carries `data-prjs-ui`, which is what lets a clip job strip the interface out of its own screenshot.

## Accessibility

Every surface traps focus while open, restores it on close, handles Escape, sets `aria-modal` and a label, and gives menus the right roles (`menuitem`, `menuitemcheckbox`, `separator`). Icon-only buttons get a name from their tooltip. The palette is a `combobox` over a `listbox` with `aria-activedescendant`.

`focusable()` decides what can take focus using computed styles rather than `offsetParent`, which is null for anything `position: fixed` — every surface here — and absent under jsdom.

## Theming

See [the interaction layer](interaction-ui.md#theming). Everything is a CSS custom property under `.prjs`.

## See also

- [The interaction layer](interaction-ui.md) — actions, the menu, the palette, instances
- [Devtools](devtools.md) — the inspector, which is built on the same surfaces

---

[← Docs index](../../README.md#documentation)
