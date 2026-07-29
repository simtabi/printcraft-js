# Pagination

Real sheets, numbered, bordered and padded, because browsers cannot do it.

## Why it exists

`@page { @bottom-center { content: counter(page) } }` is Paged Media, implemented by print-to-PDF engines like Prince and WeasyPrint. No browser implements it. Neither the `position: fixed` technique nor the `thead`/`tfoot` one can count pages, because neither knows how many there are.

"Page 3 of 12" therefore needs the content measured and split into sheets by hand. Doing that buys four other things that are otherwise impossible: a border round each page, real per-page padding, running headers and footers that are elements rather than table rows, and `@page { margin: 0 }`, which is what removes the browser's own date, title, URL and page count.

```js
Printcraft.print({ target: '#report', paginate: true, pageNumbers: true });
```

Off by default. The browser's own flow is faster and right for most jobs; this is for the ones where it is not.

## What you get

| Option                      | What it does                                    |
| --------------------------- | ----------------------------------------------- |
| `paginate`                  | `true`, or `{ orphans, widows, splitTables }`   |
| `pageNumbers`               | `true`, or the object below                     |
| `pageBorder`                | `{ width, style, color, radius }`, or `true`    |
| `pagePadding`               | A css length, or `{ top, right, bottom, left }` |
| `pageMargin`                | The paper margin, outside the border            |
| `pageHeader` / `pageFooter` | Templates repeated on every sheet               |
| `hideBrowserHeaderFooter`   | Works without pagination too                    |

```js
Printcraft.print({
  target: '#report',
  paginate: true,
  setPrintSize: 'A4',
  pageMargin: '12mm',
  pagePadding: '14mm',
  pageBorder: { width: '1px', style: 'solid', color: '#17181b' },
  pageHeader: 'ACME · {title}',
  pageNumbers: {
    template: 'Page {page} of {pages}',
    position: 'bottom-center',
    startAt: 1,
    hideOnFirst: true
  }
});
```

Placeholders in headers, footers and number templates: `{page}`, `{pages}`, `{title}`, `{date}`.

Positions: `top-left`, `top-center`, `top-right`, `bottom-left`, `bottom-center`, `bottom-right`. A `top-*` number goes in the header band, a `bottom-*` one in the footer band, and a band is only reserved when something needs it.

## The browser's own footer

The date, the title, the URL and the page count the browser prints are drawn in the `@page` margin box. Leaving no margin leaves nowhere to draw them:

```js
Printcraft.print({ target: '#report', hideBrowserHeaderFooter: true, pageMargin: '18mm' });
```

The margin moves onto the body, so the layout is unchanged and only the browser's furniture goes. Chromium and Firefox honour it; Safari does not, and in every browser the user can turn it back on in the print dialog.

Paginated jobs do this as a matter of course, because they own the page box outright.

## Where the breaks go

```html
<section data-printcraft-break-before>Starts a new sheet</section>
<table data-printcraft-avoid-break>
  Kept whole if it fits
</table>
```

```js
Printcraft.print({
  target: '#report',
  paginate: true,
  pageBreakBeforeSelectors: ['h2'],
  avoidBreakSelectors: ['tr', 'figure']
});
```

A section broken across two sheets keeps its own box on the second: the paginator rebuilds the chain of containers it was inside and marks each with `data-prjs-continued`, so a bordered panel does not lose its border halfway down.

## Limits

**A block taller than a page cannot be split.** The paginator moves nodes between sheets; it cannot break a single element that exceeds a whole page on its own. Such a block is kept whole and overflows, and the job logs which one it was:

```
WARN a block is taller than the page and cannot be split: div 1840px against 964px
```

**Pagination is only as accurate as the box model.** It measures a live layout inside the print frame, so what it splits is what the browser said the sizes were.

**`keepSourceCSS` plus `paginate` needs content that does not depend on viewport width.** Sheets are a fixed width with `box-sizing: border-box`, so a layout that reflows on the viewport will lay out against the sheet instead.

## Events

```js
Printcraft.on('paginate:start', () => {});
Printcraft.on('paginate:done', ({ pages, oversized }) => {});
```

`oversized` is how many blocks were too tall to split. The count also reaches the job record as `record.pages`.

## From the command line

```bash
printcraft print report.html --paginate --page-numbers --margin 12mm --pdf out.pdf
```

## See also

- [Options](tools/options.md) — every option, grouped by concern
- [Watermarks](tools/watermarks.md) — a repeating mark needs sheets, and turns this on
- [The command line](tools/cli.md) — pagination in CI
- [Architecture](architecture.md) — why this runs inside the mounted document

---

[← Docs index](../README.md#documentation)
