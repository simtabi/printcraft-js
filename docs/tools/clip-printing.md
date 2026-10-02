# Clip printing

Printing an exact rectangle of the page, in page coordinates.

## Usage

```js
Printcraft.print({ clipRect: { x: 40, y: 100, width: 300, height: 200 } });
Printcraft.job().clip({ x: 40, y: 100, width: 300, height: 200 }).print();
```

`clipRect` replaces `target`: a clip job prints a region, not an element.

## How it works

The whole `<body>` is cloned, then:

1. Scripts, `noscript`, and every element marked `data-prjs-ui`, `data-prjs-frame` or
   `data-prjs-inspector` are removed, so Printcraft's own interface never appears in
   its own screenshot
2. Form state is baked into the clone as usual
3. The clone is wrapped in a fixed-size `overflow: hidden` viewport
4. Its inner layer is offset by the rectangle's origin

The result is exactly the region you asked for, with the page's real layout
intact, which is why **clip jobs keep source CSS by default**. Layout fidelity is
the entire point; pass `keepSourceCSS: false` explicitly to opt out.

## Coordinates

`x` and `y` are **page** coordinates, with scroll already folded in, not
viewport coordinates. Converting from a pointer event:

```js
const rect = Printcraft.ui.computeRect(
  startX,
  startY,
  endX,
  endY, // client coordinates
  window.scrollX,
  window.scrollY
);
```

`computeRect` is pure and exported for exactly this.

## Validation

`x`, `y`, `width` and `height` must all be numbers, and the rectangle must be at
least 2×2. Anything else raises at normalization time, before a frame is mounted.

## Drawing the rectangle instead

`Printcraft.ui.drawArea()` gives you a crosshair overlay with live dimensions and
runs the clip job on release. See [Interaction UI](interaction-ui.md).

---

[← Docs index](../../README.md#documentation)
