# Print an invoice

Print one region of a page cleanly, with a header on every sheet and the page
furniture left behind.

```js
await Printcraft.print({
  target: '#invoice',
  documentTitle: 'Invoice 2026-0042',
  excludeSelectorList: ['nav', '.ads', '.print-hide'],
  headerText: 'ACME CO · invoice 2026-0042',
  footerText: 'Questions? billing@example.com',
  setPrintSize: 'A4 portrait',
  pageMargin: '18mm',
  avoidBreakSelectors: ['tr', '.line-item'],
  keepSourceCSS: true
});
```

`headerFooterMode` defaults to `'repeat'`, which uses the `thead`/`tfoot`
technique browsers repeat on every printed page, so a multi-page invoice carries
the header throughout.

`avoidBreakSelectors: ['tr']` is the one that matters most in practice: without
it, a table row can split across a page boundary.

`documentTitle` becomes the default filename when the user picks "Save as PDF".

As a chain:

```js
await Printcraft.job('#invoice')
  .title('Invoice 2026-0042')
  .exclude('nav', '.ads', '.print-hide')
  .header('ACME CO · invoice 2026-0042')
  .footer('Questions? billing@example.com')
  .pageSize('A4 portrait')
  .margins('18mm')
  .avoidBreak('tr', '.line-item')
  .keepCss()
  .print();
```

Or with no JavaScript at all:

```html
<button
  data-printcraft="#invoice"
  data-printcraft-document-title="Invoice 2026-0042"
  data-printcraft-exclude-selector-list="nav, .ads, .print-hide"
  data-printcraft-header-text="ACME CO"
  data-printcraft-page-margin="18mm"
  data-printcraft-keep-source-c-s-s
>
  Print invoice
</button>
```

Reference: [Options](../tools/options.md)

---

[← Docs index](../../README.md#documentation)
