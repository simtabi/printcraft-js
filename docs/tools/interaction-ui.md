# Interaction UI

An opt-in layer that lets someone choose what to print by pointing at it.

Nothing here runs unless the page asks for it, and every mode funnels back into
an ordinary Printcraft job. Icons are [Tabler Icons](https://tabler.io/icons)
(MIT), inlined as SVG: no icon font, no network request.

Every element the layer creates carries `data-pc-ui`, so clip jobs strip the
interface out of their own screenshot and the menu never opens on top of itself.

## Context menu

```js
const off = Printcraft.ui.contextMenu({ base: { footerText: 'internal' } });
off(); // remove it again
```

Right-click anywhere for seven items:

| Item id         | What it does                              |
| --------------- | ----------------------------------------- |
| `print-page`    | Print the whole body                      |
| `print-element` | Print the element under the cursor        |
| `pick`          | Open the section picker                   |
| `draw`          | Open the draw-to-print overlay            |
| `redact`        | Toggle redaction on the clicked element   |
| `note`          | Prompt for a note and attach it           |
| `inspect`       | Open the inspector on the clicked element |

`base` is merged into every job the menu triggers. `items` restricts and reorders
the menu:

```js
Printcraft.ui.contextMenu({ items: ['print-element', 'redact', 'inspect'] });
```

Escape closes it, as does a click outside or a scroll. The menu is kept inside
the viewport on every edge.

## Section picker

```js
const result = await Printcraft.ui.pickSections();
```

Hover highlights the element under the cursor; click adds it to the selection and
outlines it; clicking again removes it. A floating toolbar shows the count and
offers Print, Redact and Cancel. Enter prints, Escape cancels.

Resolves with the job record when it prints, or:

```js
{ action: 'redact', elements: [...] }   // Redact stamps data-printcraft-redact
{ action: 'cancel' }
```

## Draw to print

```js
const result = await Printcraft.ui.drawArea();
```

A crosshair overlay: drag a rectangle, watch the live pixel dimensions, release
to print exactly that region through [`clipRect`](clip-printing.md). Escape
cancels, and a rectangle smaller than 8×8 is treated as a cancel rather than an
accidental job.

## Marking content by hand

The redact and note modes write attributes onto the **live** element, not onto a
one-off job:

```js
Printcraft.ui.toggleRedact(el); // data-printcraft-redact, returns the new state
Printcraft.ui.annotate(el, 'check this'); // data-printcraft-note
Printcraft.ui.annotate(el); // prompts
Printcraft.ui.annotate(el, ''); // clears
```

Because those attributes are honoured by every job from every surface, marks made
by hand persist: mark a few sections, then print from a completely different
trigger and they are still respected.

## Utilities

```js
Printcraft.ui.computeRect(x1, y1, x2, y2, scrollX, scrollY); // pure; client -> page coords
Printcraft.ui.icon('printer'); // inline svg markup
```

## Events

The layer emits on the global bus: `ui:menu`, `ui:pick`, `ui:draw`, `ui:redact`,
`ui:annotate`. See [Events](events.md).

---

[← Docs index](../../README.md#documentation)
