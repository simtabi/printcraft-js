# Annotations

Break-safe note chips rendered beside their elements in the print copy.

## Usage

From options, keyed by selector:

```js
Printcraft.print({
  target: '#contract',
  annotations: [
    { selector: '#total', text: 'verify with finance' },
    { selector: '.clause-7', text: 'check with legal' }
  ]
});
```

From the fluent builder:

```js
Printcraft.job('#contract').annotate('#total', 'verify with finance').print();
```

From the content itself:

```html
<p data-printcraft-note="check with legal">Clause 7 …</p>
```

Both sources are merged, so a page can carry permanent notes in its markup while
a particular job adds its own.

## How chips render

Each note becomes a `span.prjs-note` inserted immediately after its element:

- Inline-block, so it sits beside the content rather than displacing it
- Amber on a bordered background, at 11px
- `break-inside: avoid`, so a chip is never split across a page boundary

The styles ship in the generated stylesheet of every job. Override them with
`injectCustomStyle`:

```js
Printcraft.print({
  target: '#contract',
  annotations: [{ selector: '#total', text: 'verify' }],
  injectCustomStyle: '.prjs-note { background: #dbeafe; border-color: #2563eb; color: #1e3a8a; }'
});
```

## Notes are not comments

A chip is printed. It is part of the artifact, visible to whoever holds the
paper. For content that should never reach paper, use `excludeSelectorList` or
`data-printcraft-exclude` instead.

## Adding notes by hand

The UI layer's note mode writes `data-printcraft-note` onto the live element, so
notes added by hand persist and every later job honours them. See
[Interaction UI](interaction-ui.md).

---

[← Docs index](../../README.md#documentation)
