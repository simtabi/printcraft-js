# Architecture

The pipeline every job runs, the module layout behind it, and the reasoning for
the decisions that are not obvious from the code.

## The pipeline

One `Job` owns one print job, start to finish. Every stage emits an event and
records a timing, so a job is observable from outside without instrumenting it.

| Stage     | What happens                                                                                                                                                              | Event                        |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| start     | Options are already normalized; the job record is created                                                                                                                 | `job:start`                  |
| measure   | The **live** tree is read: canvas pixels, laid-out image sizes, `currentSrc`, hidden elements, scrollable regions                                                         | `job:measure`                |
| clone     | Targets are cloned with form state baked in; shadow roots optionally flattened                                                                                            | `job:clone`                  |
| transform | Sanitize, exclude, redact, privacy-scan, reveal, expose links, capture canvases, handle images, expand scroll areas, strip inline styles, annotate, run custom transforms | `job:transform`              |
| mount     | A hidden iframe, a popup, or the inspector overlay                                                                                                                        | `job:mount`                  |
| assemble  | Base href, source CSS, generated page CSS, header/footer, target slots, watermark, marks                                                                                  | —                            |
| assets    | Images, webfonts and imported stylesheets are awaited, bounded by `assetTimeout`                                                                                          | `job:assets`                 |
| print     | Cancellable, then the dialog opens                                                                                                                                        | `job:beforeprint`            |
| done      | The dialog closes, the mount is torn down                                                                                                                                 | `job:afterprint`, `job:done` |

A `false` from any `job:beforeprint` listener, or from the `beforePrint` hook,
cancels cleanly: the mount is removed and the job resolves with
`status: 'cancelled'`.

## Module layout

```
src/
├── index.ts          the public Printcraft class: fluent builder + statics
├── core.ts           internal barrel; also the _internals compatibility facade
├── types.ts          the public type surface
│
├── support/          primitives with no printing knowledge
│   ├── constants.ts  NS, DATA_ID, FORBIDDEN_TAGS
│   ├── lang.ts       assign, clamp, raise, now, camelize
│   ├── dom.ts        toArray, isElement, eachInclusive, replaceNode, …
│   ├── emitter.ts    the pub/sub behind instance events and the global bus
│   └── logger.ts     the debug flag and the namespaced logger
│
├── options/          how a job is described
│   ├── defaults.ts   DEFAULTS and the defaults ref
│   ├── normalize.ts  the one seam every surface converges on
│   └── attributes.ts data-attribute parsing and type coercion
│
├── pipeline/         how a job runs
│   ├── job.ts        the Job class and the stage sequence
│   ├── measure.ts    live-tree measurement, cloning, target resolution, clipping
│   ├── transforms.ts the ordered clone transforms
│   ├── document.ts   page CSS and print-document assembly
│   ├── mounts.ts     iframe / popup / overlay strategies, and the waits
│   └── devtools.ts   the job ring buffer
│
├── privacy/redact.ts redaction, the PII scan, the clone sanitizer
├── production/marks.ts crop marks and bleed
└── ui/               the opt-in interaction layer
```

The demo and the build scripts sit alongside it:

```
demo/
├── index.html        markup only: no inline script, no inline style
└── assets/
    ├── scss/         the component layer (tokens, mixins, components)
    ├── css/          the Tailwind v4 entry
    ├── js/demo.js    every behaviour on the page
    ├── img/          the sample watermark
    ├── favicon/      .ico, .svg, apple-touch, 192/512 PNGs, manifest
    └── data/         the demo's printcraft.config.json

tools/
├── build.mjs         the standalone single-file demo
├── build-assets.mjs  sass + tailwind + static assets
├── build-types.mjs   tsc, plus the .d.mts and .d.cts entry shims
├── build-site.mjs    the GitHub Pages site
└── make-favicons.mjs the raster favicon set
```

The dependency direction is one-way: `support/` knows nothing about printing,
`options/` and `privacy/` depend only on `support/`, `pipeline/` composes all of
them, and `index.ts` is the only file that assembles a public API.

## Why is it shaped this way?

**Why measure the live tree first?** Detached clones have no layout and no canvas
pixels. Anything that needs a computed style or a bounding box (placeholder
sizing for `removeImages`, scrollable-area detection, hidden-element detection)
has to be read before cloning. Each measured element is tagged with a temporary
`data-pc-id` so the matching clone node can be found again, and the tag is swept
off the live tree immediately afterwards.

**Why three mount strategies behind one interface?** A hidden iframe, a popup and
the inspector overlay all need the same thing: settle exactly once, hand back a
window and a document, and guarantee teardown. Written separately, all three grew
the same settle-once/append/onload dance with slightly different bugs. One never
timed out, one handed back a document the browser could still replace. One
`Mount` interface with three implementations makes that shared contract explicit.

**Why is the iframe the default rather than a popup?** Popup blockers eat a
`window.open` unless the call is inside a trusted click handler, and sometimes
even then. The iframe path is invisible, reliable, and fires `afterprint` on its
own `contentWindow`. The popup remains available via `printInIframe: false`, and
a blocked popup raises a clear error instead of failing silently.

**Why is redaction destructive?** A black overlay on live text survives
copy-paste out of a generated PDF. Replacing the text nodes with block characters
and scrubbing the attributes, including `id` and `name`, which routinely encode
the value itself, is the only approach where the print artifact holds nothing
recoverable. The same reasoning drives the privacy scanner: matches are rewritten
in the text nodes, not styled.

**Why does the sanitizer run on every job by default?** The print document is a
fresh same-origin browsing context. Content that was inert on the host page: a
script inside a `<template>`, an `onclick` in user-generated markup, a nested
iframe, would actually execute there. Stripping executable content costs nothing
visually.

**Why does the fluent builder defer normalization?** Holding raw options and
validating only at the terminals means partial chains are legal and reusable,
and `.toOptions()` becomes the seam where the declarative, imperative and fluent
surfaces demonstrably converge on one validated object.

**Why do the tests run against `dist/` rather than `src/`?** The bundle is what
consumers actually load. Testing it caught a literal `</script>` inside a code
comment, which would have truncated the library wherever it was inlined into an
HTML page, a defect invisible at the source level.

**Why is `_internals` kept as a facade?** The suite reaches through it to test
stages in isolation. Keeping it as an explicit re-export layer means the module
split above could happen without touching a single test.

## The demo build

The demo is not a Tailwind CDN page, and its markup carries no inline script or
style. Two compilers feed one stylesheet:

```
demo/assets/css/tailwind.css   ──tailwindcss──┐
                                               ├──► dist/assets/css/demo.css
demo/assets/scss/main.scss     ──sass─────────┘
```

Sass owns the component layer (tokens, mixins, nesting) and Tailwind owns the
utilities and the design tokens the markup reaches for. They are compiled
separately because `@import "tailwindcss"` cannot be fed through Sass, which
resolves bare imports as Sass files. Sass output is concatenated **second**, so
its unlayered component rules win over Tailwind's layered utilities.

`tools/build-assets.mjs` runs both, then copies the favicon set, the sample
watermark and the demo config into `dist/assets/`, mirroring the source layout
under `demo/assets/`.

`tools/build.mjs` then produces `dist/demo-standalone.html` by replacing each
marker pair in the demo markup with an inlined equivalent: stylesheet, library,
demo script, favicon as a `data:` URI, and the page defaults as an inline JSON
block, since a `file://` page cannot fetch a sibling file. The result is a single
file with zero external requests. The generator refuses to inline any asset
containing a literal `</script>`, and refuses to emit a page that still
references a file.

`tools/build-site.mjs` assembles `_site/` for GitHub Pages from the _non_-inlined
demo, so the hosted page exercises the ordinary separate-files path and the
standalone is offered next to it as a download. See [Demo](demo.md).

## Bundle size

The esm build splits, because `static ui = {...}` is a live reference no bundler
can drop. Without the split, someone who only calls `print('#invoice')` would
ship a modal kit, a rasteriser and an email composer they never open.

| Entry                            | Brotli | Budget |
| -------------------------------- | ------ | ------ |
| `@simtabi/printcraft`            | ~22 kB | 24 kB  |
| `+ /ui`                          | ~39 kB | 40 kB  |
| `+ /share`                       | ~40 kB | 45 kB  |
| `printcraft.umd.js` (script tag) | ~38 kB | 45 kB  |

The umd bundle stays whole: a page with no bundler cannot split anything, so
three script tags would cost requests and buy nothing.

Budgets are enforced by `npm run size` in CI, and 45 kB is a ceiling that does
not move. Runtime dependencies: zero, and that is a hard constraint. Playwright
is an optional peer for the command line only, so a browser user never downloads
a browser.

## Known limitations

**A watermark on every page needs pagination.** `position: fixed` paints the
first page and stops, so a repeating mark has to be built into each sheet, and
sheets only exist when the paginator has run. Asking for `repeat: 'every-page'`
turns `paginate` on for that reason, and says so in the log. See
[Watermarks](tools/watermarks.md).

**A block taller than a page cannot be split.** The paginator moves nodes between
sheets; it cannot break a single element that exceeds a whole page on its own.
Such a block is kept whole and overflows, and the job logs which one it was.

**Live markup cannot be clipped faithfully.** At pagination time the browser
re-evaluates media queries against the page box, so a region chosen against a
1280px layout is re-laid-out at 794px before it prints. Measured: a
`min-width: 1000px` rule that makes a block 3000px tall yields one A4 page, not
four. `clipMode: 'capture'` rasterises the region instead, which is why it is the
default. See [Clip printing](tools/clip-printing.md).

---

[← Docs index](../README.md#documentation)
