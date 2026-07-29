# Watermarks

A centred text or image watermark over the printed page.

## Text

```js
Printcraft.print({ target: '#invoice', watermarkText: 'DRAFT' });
Printcraft.job('#invoice').watermark('DRAFT', 0.15).print();
```

The text is rendered as a generated SVG, escaped, and rotated:

| Option             | Type                | Default |
| ------------------ | ------------------- | ------- |
| `watermarkText`    | string              | `null`  |
| `watermarkOpacity` | number, clamped 0–1 | `0.25`  |
| `watermarkAngle`   | number, degrees     | `-30`   |

## Image

```js
Printcraft.print({
  target: '#invoice',
  watermarkImageURL: '/img/confidential.png',
  watermarkOpacity: 0.1
});
```

The image is awaited along with the rest of the page's assets before the dialog
opens, so it cannot come out blank.

A `data:` URI works too, and is what the demo uses, and it keeps the standalone build
free of network requests. See [Demo](../demo.md).

`watermarkImageURL` takes precedence when both are set.

## First page only

**A watermark renders on the first printed page only in most print engines.** It
is positioned `fixed`, and fixed positioning in paged media is applied to the
first page rather than repeated — this is engine behaviour, not something the
library can work around.

For a mark on every page, use the repeating header or footer, which is built on
the `thead`/`tfoot` technique browsers _do_ repeat:

```js
Printcraft.print({
  target: '#invoice',
  headerText: 'DRAFT — NOT FOR DISTRIBUTION',
  headerFooterMode: 'repeat' // the default
});
```

For a diagonal mark on every page, repeat it in the content instead — one
absolutely-positioned element per section, with
`data-printcraft-break-before` on the sections.

## Styling

The watermark is a `.pc-watermark` element containing an `img` or `svg`. Both are
capped at 70% of the page and take the configured opacity. Override with
`injectCustomStyle`:

```js
Printcraft.print({
  target: '#invoice',
  watermarkText: 'VOID',
  injectCustomStyle: '.pc-watermark svg { max-width: 95%; max-height: 95%; }'
});
```

---

[← Docs index](../../README.md#documentation)
