# Options

Fifty-two options, grouped by concern. Every one is optional; `normalizeOptions()`
fills the rest from `DEFAULTS` and `Printcraft.defaults`.

Each option is available from all three surfaces. In markup, the name is
kebab-cased and prefixed: `excludeSelectorList` becomes
`data-printcraft-exclude-selector-list`. See [Surfaces](../surfaces.md).

TypeScript consumers get `PrintcraftOptions` for input and `ResolvedOptions` for
the post-normalization shape every hook and transform receives.

## Target and mode

| Option           | Type                                     | Default                  | What it does                                                                    |
| ---------------- | ---------------------------------------- | ------------------------ | ------------------------------------------------------------------------------- |
| `target`         | selector, element, or an array of either | `null`                   | What to print. Overlapping selectors resolve to one element, not two            |
| `html`           | string                                   | `null`                   | Print a raw HTML string instead of an element                                   |
| `clipRect`       | `{x, y, width, height}`                  | `null`                   | Print an exact page-coordinate rectangle. See [Clip printing](clip-printing.md) |
| `documentTitle`  | string                                   | `null`                   | The print document title, which most browsers use as the default PDF filename   |
| `jobName`        | string                                   | `null`                   | A label for the job record and the debug log                                    |
| `printInIframe`  | boolean                                  | `true`                   | `false` opens a popup instead                                                   |
| `windowFeatures` | string                                   | `'width=900,height=650'` | Popup features, when `printInIframe` is false                                   |

One of `target`, `html`, or `clipRect` is required.

## Page setup

| Option                     | Type                   | Default    | What it does                                                                    |
| -------------------------- | ---------------------- | ---------- | ------------------------------------------------------------------------------- |
| `setPrintSize`             | string                 | `null`     | The `@page size`, e.g. `'A4 landscape'`                                         |
| `pageMargin`               | string                 | `null`     | The `@page margin`, e.g. `'18mm'`                                               |
| `pageBreakBetweenTargets`  | boolean                | `true`     | Start each target on its own page                                               |
| `pageBreakBeforeSelectors` | string[]               | `[]`       | Selectors that start a new page                                                 |
| `pageBreakAfterSelectors`  | string[]               | `[]`       | Selectors that end a page                                                       |
| `avoidBreakSelectors`      | string[]               | `[]`       | Selectors never split across pages                                              |
| `headerText`               | string                 | `null`     | Header text                                                                     |
| `footerText`               | string                 | `null`     | Footer text                                                                     |
| `headerFooterMode`         | `'repeat'` \| `'once'` | `'repeat'` | `'repeat'` uses the `thead`/`tfoot` technique so the band appears on every page |
| `watermarkText`            | string                 | `null`     | See [Watermarks](watermarks.md)                                                 |
| `watermarkImageURL`        | string                 | `null`     |                                                                                 |
| `watermarkOpacity`         | number                 | `0.25`     | Clamped to 0–1                                                                  |
| `watermarkAngle`           | number                 | `-30`      | Degrees, text watermarks only                                                   |
| `printerMarks`             | `true` \| object       | `null`     | See [Printer marks](printer-marks.md)                                           |

> Selector options are interpolated into a generated stylesheet, so `{`, `}`, `<`
> and `/*` are rejected at normalization time. Combinators, pseudo-classes and
> attribute selectors (`table > tbody tr`, `.a:not(.b)`, `a[href*="@"]`) all
> pass.

## Content transforms

| Option                     | Type                    | Default             | What it does                                                                  |
| -------------------------- | ----------------------- | ------------------- | ----------------------------------------------------------------------------- |
| `excludeSelectorList`      | string[]                | `[]`                | Removed from the print copy                                                   |
| `revealHiddenElements`     | boolean                 | `false`             | Force `display:none` elements visible on paper                                |
| `exposeLinkUrls`           | `'all'` \| `'external'` | `null`              | Write link URLs into the text                                                 |
| `linkTextTemplate`         | string                  | `'{title} [{url}]'` | How exposed links are rendered                                                |
| `printCanvas`              | boolean                 | `true`              | Capture canvases as PNGs. Tainted canvases are skipped silently               |
| `removeImages`             | boolean                 | `false`             | Replace images with a bordered placeholder sized from live layout             |
| `forceLazyImages`          | boolean                 | `true`              | Set `loading="eager"` and pin the already-resolved `currentSrc`               |
| `extendScrollableAreas`    | boolean \| `'table'`    | `false`             | Expand scrolling regions; `'table'` limits this to regions containing a table |
| `scrollableAreasMaxHeight` | number                  | `null`              | Cap the expansion instead of removing it                                      |
| `keepSourceCSS`            | boolean                 | `false`             | Copy the page's `<style>` and `<link>` stylesheets into the print document    |
| `keepInlineStyles`         | boolean                 | `true`              | Keep `style` attributes                                                       |
| `removeInlineStyles`       | boolean                 | `false`             | Legacy alias; `true` forces `keepInlineStyles` false                          |
| `injectCustomStyle`        | string                  | `null`              | Extra CSS, appended last                                                      |
| `stripDarkMode`            | boolean                 | `false`             | Force a light color scheme on paper                                           |
| `flattenShadowDom`         | boolean                 | `false`             | Inline open shadow roots into the clone                                       |
| `preserveFormState`        | boolean                 | `true`              | Bake live field values into the clone                                         |
| `transforms`               | `{selector, fn}[]`      | `[]`                | Per-selector clone transforms. Return `null` to drop, an element to replace   |
| `customMethodMap`          | object                  | `null`              | Legacy tag-keyed transform chain                                              |
| `annotations`              | `{selector, text}[]`    | `[]`                | See [Annotations](annotations.md)                                             |

## Security and privacy

| Option               | Type             | Default | What it does                                                                                         |
| -------------------- | ---------------- | ------- | ---------------------------------------------------------------------------------------------------- |
| `sanitize`           | boolean          | `true`  | Strip scripts, `object`/`embed`/`iframe`, inline `on*` handlers and `javascript:` URLs from the copy |
| `redactSelectorList` | string[]         | `[]`    | Destructively redact. See [Redaction](redaction.md)                                                  |
| `redactChar`         | string           | `'█'`   | The character bars are painted with                                                                  |
| `privacy`            | `true` \| object | `null`  | See [Privacy](privacy.md)                                                                            |

## Lifecycle

| Option              | Type     | Default | What it does                                                                   |
| ------------------- | -------- | ------- | ------------------------------------------------------------------------------ |
| `beforePrintCb`     | function | `null`  | Legacy callback, fired before transforms                                       |
| `afterPrintCb`      | function | `null`  | Legacy callback, fired after the dialog closes — now works in iframe mode too  |
| `onError`           | function | `null`  | Swallow the failure and resolve with the job record instead of rejecting       |
| `assetTimeout`      | number   | `8000`  | Milliseconds to wait for images, fonts and stylesheets                         |
| `extraDelay`        | number   | `0`     | Additional wait after assets settle                                            |
| `afterPrintTimeout` | number   | `60000` | Backstop if `afterprint` never fires                                           |
| `on`                | object   | `null`  | Per-job event listeners, detached automatically when the job ends              |
| `hooks`             | object   | `null`  | `beforeClone`, `transformClone`, `beforeAssemble`, `beforePrint`, `afterPrint` |
| `debug`             | boolean  | `null`  | Per-job override of the global debug flag                                      |

See [Events](events.md) for the lifecycle and cancellation.

## The job record

Every job resolves with:

```js
{
  (id,
    name,
    mode,
    status,
    startedAt,
    timings,
    targetCount,
    cancelled,
    error,
    redactions,
    duration,
    documentHTML);
}
```

`status` is one of `done`, `cancelled`, `inspected`, or `error`. `timings` holds
per-stage milliseconds. `redactions` counts privacy-scan matches.
`documentHTML` is captured only in debug or inspect mode.

---

[← Docs index](../../README.md#documentation)
