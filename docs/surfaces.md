# Surfaces

Three equivalent ways to describe a print job, all converging on one validated
options object.

Every surface ends at `normalizeOptions()`, and every job from every surface runs
the same ordered pipeline. Nothing is reachable from one surface and not another.

## Imperative

`Printcraft.print(options)` takes a plain object, a selector string, or an
element. `Printcraft.printHTML(html, options)` prints a raw string with no
element involved. Both return a promise resolving to the job record.

```js
Printcraft.print('#invoice');
Printcraft.print({ target: '#invoice', headerText: 'ACME CO' });
Printcraft.printHTML('<h1>Receipt</h1>', { setPrintSize: 'A5' });
```

`Printcraft.job(target)` returns the fluent builder: the same options, expressed
as a chain, with validation deferred to `.print()`, `.inspect()`, or
`.toOptions()`.

```js
Printcraft.job('#invoice').exclude('.ads').watermark('DRAFT').print();
```

The builder is a real object you can hold onto, extend, and reuse. The imperative
object form is better when the options are already data.

## Declarative

Any element with `data-printcraft="<selector>"` becomes a trigger, served by one
delegated listener per document. Options are kebab-cased attributes:

```html
<button
  data-printcraft="#invoice"
  data-printcraft-footer-text="internal"
  data-printcraft-watermark-opacity="0.1"
  data-printcraft-exclude-selector-list=".ads, nav"
  data-printcraft-reveal-hidden-elements
>
  Print
</button>
```

Values are coerced by shape:

| Attribute value                                        | Becomes     |
| ------------------------------------------------------ | ----------- |
| absent, or `""`, or `"true"`                           | `true`      |
| `"false"`                                              | `false`     |
| `"null"`                                               | `null`      |
| `"42"`, `"0.25"`                                       | a number    |
| `"[…]"`, `"{…}"`                                       | parsed JSON |
| a comma-separated string on a `*List`/`*Selectors` key | an array    |
| anything else                                          | the string  |

That last rule is keyed on the option name, so `data-printcraft-header-text="plain, text stays"`
stays a single string while `data-printcraft-exclude-selector-list=".a, .b"`
splits into two selectors.

One `data-printcraft-options` attribute can carry a whole JSON blob. Individual
attributes win over keys in the blob:

```html
<button
  data-printcraft="#invoice"
  data-printcraft-options='{"footerText":"from blob","watermarkText":"blob"}'
  data-printcraft-watermark-text="DRAFT"
>
  Print
</button>
```

The declarative listener only reacts to a plain primary click that no other
handler has already claimed, so a `data-printcraft` wrapper around a link does
not hijack middle-clicks or a handler that called `preventDefault()`.

### Content annotations

Markup can describe its own print behaviour, with no configuration at all. These
are honoured by every job, from every surface:

| Attribute                      | Effect                                  |
| ------------------------------ | --------------------------------------- |
| `data-printcraft-exclude`      | Removed from the print copy             |
| `data-printcraft-break-before` | Starts a new page                       |
| `data-printcraft-break-after`  | Ends the page                           |
| `data-printcraft-avoid-break`  | Never split across a page boundary      |
| `data-printcraft-reveal`       | Forced visible even if hidden on screen |
| `data-printcraft-redact`       | Destructively redacted                  |
| `data-printcraft-note="text"`  | Renders a note chip beside the element  |

## JSON configuration

Page-wide defaults, merged under every per-call option:

```html
<script type="application/json" data-printcraft-config>
  { "documentTitle": "ACME invoices", "pageMargin": "18mm", "stripDarkMode": true }
</script>
```

Or from a file, via the script tag:

```html
<script src="printcraft.umd.js" data-config="/printcraft.config.json"></script>
```

Or at runtime:

```js
Printcraft.applyConfig({ footerText: 'internal' });
await Printcraft.loadConfig('/printcraft.config.json');
Printcraft.defaults = {}; // reset
```

Precedence is `DEFAULTS` < `Printcraft.defaults` < per-call options, so a config
file sets the house style and any individual job can still override it. See
[Configuration](configuration.md).

---

[← Docs index](../README.md#documentation)
