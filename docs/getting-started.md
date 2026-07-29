# Getting started

From a one-line print to a fully described job, in the three surfaces Printcraft
offers.

## The simplest job

```js
Printcraft.print('#invoice');
```

That clones `#invoice`, transforms the copy, mounts it in a hidden iframe, waits
for images and fonts, opens the print dialog, and tears the frame down again. It
returns a promise that resolves with the job record once the dialog closes.

```js
const job = await Printcraft.print('#invoice');
console.log(job.status, job.duration + 'ms');
```

## Describing a job with options

Any option can ride along in a plain object:

```js
await Printcraft.print({
  target: '#invoice',
  excludeSelectorList: ['.ads', 'nav'],
  headerText: 'ACME CO',
  setPrintSize: 'A4 portrait',
  pageMargin: '18mm'
});
```

See [Options](tools/options.md) for the full list.

## The fluent builder

`Printcraft.job(target)` returns a chainable builder whose setters map one to one
onto options. Validation is deferred to the terminals, so a partial chain is
legal and reusable:

```js
const draft = Printcraft.job('#invoice')
  .exclude('.ads')
  .redact('.ssn')
  .privacy(true)
  .watermark('DRAFT', 0.15)
  .marks({ bleed: '3mm' })
  .header('ACME CO');

await draft.print(); // prints
await draft.title('Copy').print(); // same chain, one more setting
```

`.toOptions()` returns the normalized options object without running anything,
useful for testing a chain, or for handing the same description to another
surface.

## Without any JavaScript

Any element carrying `data-printcraft` becomes a trigger. Options ride along as
kebab-cased attributes with typed coercion:

```html
<button
  data-printcraft="#invoice"
  data-printcraft-watermark-text="DRAFT"
  data-printcraft-exclude-selector-list=".ads, nav"
>
  Print
</button>
```

Content can describe its own print behaviour too, and every job from every
surface honours it:

```html
<aside data-printcraft-exclude>Never printed</aside>
<h2 data-printcraft-break-before>Starts a new page</h2>
<tr data-printcraft-avoid-break>
  Never split across pages
</tr>
<p data-printcraft-redact>Blacked out</p>
<td data-printcraft-note="check with legal">Clause 7</td>
```

## Previewing without paper

`Printcraft.inspect()` runs the identical pipeline into a visible overlay instead
of the print dialog, with Print / Log HTML / Close controls:

```js
const ctl = await Printcraft.inspect('#invoice');
ctl.document.querySelector('.pc-target'); // the assembled print document
ctl.close();
```

This is the fastest way to iterate on print styles. See [Devtools](tools/devtools.md).

## What to read next

- [Surfaces](surfaces.md) — how the three ways of describing a job relate
- [Options](tools/options.md) — the complete reference
- [Events](tools/events.md) — hooks, lifecycle events, and cancelling a job

---

[← Docs index](../README.md#documentation)
