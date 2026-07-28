# Draw a print area

Let someone drag a rectangle and print exactly what is inside it.

```js
const result = await Printcraft.ui.drawArea({ keepSourceCSS: true });
```

A crosshair overlay appears; drag to size a rectangle with live pixel dimensions;
release to print. Escape cancels, and so does a rectangle smaller than 8×8.

The base options are merged into the resulting job, so the drawn region can carry
a header, a watermark, or anything else:

```js
await Printcraft.ui.drawArea({
  headerText: 'clipping from the ops dashboard',
  printerMarks: true
});
```

To do it without the overlay — from your own drag handler, or a fixed region:

```js
const rect = Printcraft.ui.computeRect(startX, startY, endX, endY, window.scrollX, window.scrollY);
await Printcraft.print({ clipRect: rect });
```

`computeRect` is pure: it converts two client points plus a scroll offset into the
page coordinates `clipRect` expects.

Clip jobs keep source CSS by default, because reproducing the region's real
layout is the entire point. Printcraft's own interface is stripped from the clone,
so the overlay never appears in its own screenshot.

Reference: [Clip printing](../tools/clip-printing.md) · [Interaction UI](../tools/interaction-ui.md)

---

[← Docs index](../../README.md#documentation)
