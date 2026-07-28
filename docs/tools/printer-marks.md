# Printer marks

Corner crop marks and a bleed inset on every printed page, for work headed to a
press.

## Usage

```js
Printcraft.print({ target: '#poster', printerMarks: true });
Printcraft.job('#poster').marks({ bleed: '5mm', markColor: '#e5007d' }).print();
```

```html
<button data-printcraft="#poster" data-printcraft-printer-marks>Print</button>
```

## Options

| Key          | Type       | Default  | What it does                  |
| ------------ | ---------- | -------- | ----------------------------- |
| `crop`       | boolean    | `true`   | Draw the four corner ticks    |
| `bleed`      | CSS length | `'3mm'`  | Inset applied as body padding |
| `markColor`  | CSS color  | `'#000'` | Tick color                    |
| `markLength` | CSS length | `'5mm'`  | Length of each tick           |

`printerMarks: true` is shorthand for all four defaults.

## What it renders

The bleed becomes `body { padding: <bleed> }`, so content is inset from the sheet
edge by that much. Four fixed-position corner elements are appended, each drawn
with 0.5pt borders and translated so the ticks sit exactly on the trim line
implied by the bleed.

```
┌ ─                    ─ ┐
│                        │
     content area
│                        │
└ ─                    ─ ┘
```

## The honest limitation

True production bleed requires printing on oversized stock and trimming down.
Printcraft cannot make a printer image beyond its own margins. What these marks
give you is an accurate indication of where the trim line falls — the same thing
proofing tools show — so a design can be checked before it goes to a press that
does have oversized stock.

For real bleed, set the page larger than the finished size and let the marks show
the trim:

```js
Printcraft.print({
  target: '#poster',
  setPrintSize: '216mm 303mm', // A4 plus 3mm bleed on every side
  pageMargin: '0',
  printerMarks: { bleed: '3mm' }
});
```

## See also

- [Watermarks](watermarks.md) — proof marking
- [Options](options.md) — `setPrintSize` and `pageMargin`

---

[← Docs index](../../README.md#documentation)
