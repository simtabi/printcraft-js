# Crop marks for press

Proof a design with corner marks and a bleed inset, sized so a press can trim it.

```js
await Printcraft.print({
  target: '#poster',
  setPrintSize: '216mm 303mm', // A4 (210×297) plus 3mm bleed on every side
  pageMargin: '0',
  printerMarks: { bleed: '3mm', markColor: '#000', markLength: '5mm' },
  keepSourceCSS: true,
  stripDarkMode: true
});
```

The pieces:

- **`setPrintSize` larger than the finished size.** True bleed needs oversized
  stock; the sheet has to be bigger than the trim.
- **`pageMargin: '0'`.** The bleed inset comes from `printerMarks`, so a page
  margin on top of it would double the offset.
- **`printerMarks.bleed`** matches the oversize you added: 3mm here.
- **`stripDarkMode`** forces a light color scheme, so a dark-mode viewer does not
  send an inverted design to press.

Or as a chain:

```js
await Printcraft.job('#poster')
  .pageSize('216mm 303mm')
  .margins('0')
  .marks({ bleed: '3mm' })
  .keepCss()
  .print();
```

Check it before committing paper:

```js
const ctl = await Printcraft.inspect({ target: '#poster', printerMarks: true });
// four .prjs-mark elements, one per corner
ctl.close();
```

> Printcraft cannot make a printer image beyond its own margins. The marks show
> where the trim line falls, the same thing a proofing tool shows, which is what
> lets a press with real oversized stock do the rest.

Reference: [Printer marks](../tools/printer-marks.md)

---

[← Docs index](../../README.md#documentation)
