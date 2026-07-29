# The interaction layer

A right-click menu, a command palette, keyboard commands and the surfaces behind them, all views of one registry of actions.

## It is already there

```html
<script src="printcraft.umd.js"></script>
```

That is the whole setup. The menu installs itself, the keyboard commands are bound, and `Mod+K` opens the palette. A print library whose features can only be reached by writing code is one most of a team never finds.

```html
<!-- give the browser its own menu back -->
<script src="printcraft.umd.js" data-menu="false"></script>
```

Under a bundler the interaction layer is a subpath, so people who only call `print('#invoice')` do not ship it:

```js
import '@simtabi/printcraft/ui';
```

## Actions

Every capability is a registered action. The menu renders them, the palette searches them, the keymap fires them, and your code runs them by id.

| Id              | What it does                                | Keys          |
| --------------- | ------------------------------------------- | ------------- |
| `print-element` | Prints what was right-clicked               |               |
| `print-page`    | Prints the whole page                       | `Mod+P`       |
| `settings`      | Opens the print settings dialog             | `Mod+Shift+P` |
| `pick`          | Click several sections, print them together |               |
| `draw`          | Drag a rectangle; only that region prints   | `Mod+Shift+D` |
| `redact`        | Blacks out the element, on paper only       |               |
| `redact-area`   | Destroys the characters a box covers        | `Mod+Shift+R` |
| `note`          | Attaches a note chip                        |               |
| `notes`         | Lists every note and redaction              | `Mod+Shift+N` |
| `inspect`       | Opens the assembled document, no dialog     | `Mod+Shift+I` |
| `palette`       | Searches everything above                   | `Mod+K`       |

`Mod` is Command on a Mac and Control elsewhere. **Both work either way**: deciding from a platform string means one wrong answer silently disables every shortcut, and the strings do lie.

### Registering your own

```js
Printcraft.ui.register({
  id: 'print-with-terms',
  label: 'Print with terms attached',
  description: 'Appends the standard terms page',
  icon: 'pages',
  group: 'Print',
  keys: 'mod+shift+t',
  keywords: ['legal', 'conditions'],
  when: (ctx) => (ctx.target?.closest('.invoice') ? true : 'Right-click an invoice'),
  run: (ctx) => Printcraft.print({ target: '.invoice' })
});
```

| Field         | What it is for                                                 |
| ------------- | -------------------------------------------------------------- |
| `id`          | Stable. Registering the same id replaces it without moving it. |
| `label`       | What the menu and palette show                                 |
| `description` | One line under the label                                       |
| `icon`        | A name from `Printcraft.ui.icon`                               |
| `group`       | The section it appears under; a new name makes a new section   |
| `keys`        | `mod+shift+t`, `alt+r`, `?`                                    |
| `tone`        | `primary`, `danger`, `warn` — colours the row                  |
| `keywords`    | Extra words the palette matches on but does not show           |
| `when`        | `false` hides it; a **string** disables it and says why        |
| `checked`     | Draws a tick, for a toggle                                     |
| `run`         | Receives `{ target, env, base, via }`                          |

`when` returning a string is the one worth knowing: a greyed-out row that will not say why is worse than no row, and the reason becomes the row's tooltip.

`via` is `menu`, `palette`, `keyboard` or `api`, so an action can behave differently depending on how it was reached.

### Changing the stock ones

```js
const { actions } = Printcraft.ui;

actions.update('print-page', { label: 'Print everything', keys: 'mod+alt+p' });
actions.remove('redact-area');
actions.reorder(['print-page', 'settings']); // the rest keep their order after
```

### Running one yourself

```js
Printcraft.ui.run('draw');
Printcraft.ui.run('redact', document.querySelector('.ssn'));
```

Unknown, hidden and disabled ids return `undefined` rather than throwing. A shortcut fired when its action no longer applies is an ordinary thing to happen, not an error.

## The menu

Right-click. It carries a heading, a one-line description, a section per group, an icon and a description on every row, key caps for anything bound, and red rows for anything destructive.

## The palette

`Mod+K`, or `Printcraft.ui.palette()`.

Matching is by subsequence rather than substring, so `pgn` finds "Page numbers" and `dpa` finds "Draw a print area". A match at a word boundary ranks above one mid-word, consecutive above scattered, and a short label above a long one. The characters that matched are highlighted, so the ranking explains itself.

It is the one binding that works while you are typing in a field. Everything else is suppressed there, because a shortcut that fires mid-sentence is worse than no shortcut.

## Instances

Everything above belongs to an interface. `Printcraft.ui.instance` is the page's, created on first use. `create()` makes another:

```js
const invoice = Printcraft.ui.create({
  scope: '#invoice-pane',
  title: 'Invoice tools',
  items: ['print-element', 'settings', 'inspect']
});

const legal = Printcraft.ui.create({
  scope: '#legal-pane',
  title: 'Legal tools',
  items: ['redact', 'redact-area', 'notes'],
  base: { redactionPolicy: 'strict' }
});
```

Each owns a registry, its base options, its menu, its keymap and its scope. Two on one page do not know about each other.

| Option                  | Default        | What it does                                        |
| ----------------------- | -------------- | --------------------------------------------------- |
| `scope`                 | the document   | Only right-clicks inside this element open its menu |
| `base`                  | `{}`           | Merged into every job this interface starts         |
| `title` / `description` | the stock ones | The menu's heading                                  |
| `items`                 | all            | Ids to keep, in the order you want them             |
| `actions`               | —              | Registered on top of the catalogue                  |
| `registry`              | —              | Replace the catalogue outright                      |
| `contextMenu`           | `true`         | `false` leaves the browser's menu alone             |
| `keyboard`              | `true`         | `false` binds nothing, palette included             |
| `paletteKeys`           | `mod+k`        | `''` removes the palette action                     |

```js
invoice.destroy();
```

Removes every listener it installed. An app that mounts and unmounts a panel needs that to be complete, or the second mount installs a second menu.

## Notes and redactions

Both are stored as attributes on the live element, which is what makes them survive between jobs. It also makes them invisible: a note added twenty minutes ago is a `data-` attribute nobody can see until something prints.

```js
await Printcraft.ui.notes();
```

Lists every one, with a button to scroll to it and flash it, edit the wording, or remove it. **Remove all** asks first. Nothing here has printed yet, which is the point of looking.

```js
Printcraft.ui.annotations(document); // [{ element, kind, text, where }]
Printcraft.ui.clearAnnotations(document); // how many went
Printcraft.ui.removeNote(el); // what it took off
```

## Tooltips and popovers

The kit's own, so anything you build gets the same surface and the same theme:

```js
Printcraft.ui.tooltip(button, { text: 'Save the sheet', keys: 'S' });

const pop = Printcraft.ui.popover(anchor, {
  title: 'Before you print',
  body: 'Three fields are still empty.',
  actions: [{ id: 'ok', label: 'Print anyway', tone: 'primary', onSelect: send }]
});
pop.close();
```

Both use the platform's `popover` attribute and CSS anchor positioning where they exist: the top layer rather than z-index arithmetic, Escape and light-dismiss for free, and `position-try` handling the flip when one would leave the viewport. That is baseline as of 2026 (Chrome 125, Firefox 132, Safari 18.2), and where it is missing the old positioner stands in.

A tooltip also supplies `aria-label` when its target has no accessible name. On an icon-only button the tooltip is the only label there is.

## Theming

```js
Printcraft.ui.theme.set({ primary: '#7c3aed', radius: '4px', colorScheme: 'light' });
Printcraft.ui.theme.reset();
```

A tone can be one colour, and the border follows the background while the soft variant is derived, or the whole object:

```js
Printcraft.ui.theme.set({
  danger: { bg: '#7f1d1d', fg: '#fff', border: '#450a0a', soft: 'rgba(127,29,29,.12)' }
});
```

Tones are `primary`, `danger`, `warn`, `success` and `info`. Dark mode follows `prefers-color-scheme` unless `colorScheme` pins it, because a print tool sitting on a dark app should not be the one white rectangle on the page.

Everything is a CSS custom property under `.pc-k`, so a host stylesheet can override without fighting inline styles.

## Events

```js
Printcraft.on('ui:menu', ({ target, actions }) => {});
Printcraft.on('ui:redact', ({ element, redacted }) => {});
Printcraft.on('ui:annotate', ({ element, text }) => {});
Printcraft.on('ui:draw', ({ rect, title, description }) => {});
Printcraft.on('redact:mark', ({ rect, runs }) => {});
```

## See also

- [Options](options.md) — everything a job accepts
- [Redaction](redaction.md) — what marking destroys, and how it is checked
- [Print backends](../backends.md) — sending a job somewhere other than the dialog
- [Errors and logging](logging.md) — codes, levels and sinks

---

[← Docs index](../../README.md#documentation)
