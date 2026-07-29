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

`text` · `textarea` · `select` · `radio` · `checkbox` · `number` · `color` · `length`

| Key           | What it does                                                      |
| ------------- | ----------------------------------------------------------------- |
| `value`       | The initial value                                                 |
| `hint`        | A line under the control                                          |
| `placeholder` | —                                                                 |
| `required`    | Blocks a `validates: true` action                                 |
| `when`        | `(values) => boolean`; hides the field until it is true           |
| `validate`    | `(value, values) => string \| null`; the string becomes the error |
| `rows`        | `textarea` only                                                   |
| `choices`     | `select` and `radio`                                              |

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

Tones: `default`, `primary`, `danger`, `warn`, `success`, `info`, plus `ghost` and `quiet`, which are shapes rather than colours.

## Tooltips and popovers

See [the interaction layer](interaction-ui.md#tooltips-and-popovers). Both use the platform's `popover` attribute and CSS anchor positioning where they exist.

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

## Building your own

```js
import { h, root, iconNode, button } from '@simtabi/printcraft/ui';

const panel = root(document, 'div', { class: 'pc-k pc-k-panel', attrs: { 'data-size': 'md' } });
panel.appendChild(
  h(document, 'div', {
    class: 'pc-k-head',
    children: [h(document, 'h2', { class: 'pc-k-title', text: 'My panel' })]
  })
);
```

`root` adds the `pc-k` class the stylesheet hangs off and injects the sheet if it is not there; `h` is the same without it, for children. Every node carries `data-pc-ui`, which is what lets a clip job strip the interface out of its own screenshot.

## Accessibility

Every surface traps focus while open, restores it on close, handles Escape, sets `aria-modal` and a label, and gives menus the right roles (`menuitem`, `menuitemcheckbox`, `separator`). Icon-only buttons get a name from their tooltip. The palette is a `combobox` over a `listbox` with `aria-activedescendant`.

`focusable()` decides what can take focus using computed styles rather than `offsetParent`, which is null for anything `position: fixed` — every surface here — and absent under jsdom.

## Theming

See [the interaction layer](interaction-ui.md#theming). Everything is a CSS custom property under `.pc-k`.

## See also

- [The interaction layer](interaction-ui.md) — actions, the menu, the palette, instances
- [Devtools](devtools.md) — the inspector, which is built on the same surfaces

---

[← Docs index](../../README.md#documentation)
