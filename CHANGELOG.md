# Changelog

All notable changes to this project are documented here. This project adheres to
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] — scoped release, hardening, and a real type surface

Published as **`@simtabi/printcraft`** from `simtabi/printcraft-js`. The public
API is unchanged; the type layer is not, which is why this is a minor rather than
a patch.

### Added

- **A real option type.** `Options = Record<string, any>` is replaced by a full
  `PrintcraftOptions` interface, alongside `ResolvedOptions`, `Hooks`,
  `Annotation`, `ClipRect`, `Transform`, `PrivacyConfig`, `PrinterMarks`,
  `JobRecord`, `InspectController`, and a `PrintcraftEvent` union. All exported.
- **A Playwright suite** (13 tests, Chromium) covering what jsdom cannot: real
  layout, real `@page` CSS, real webfonts, and a real canvas captured to PNG.
- **Regression tests**, one per bug fixed below, plus structural guards that the
  bundle version matches `package.json`, that `Printcraft._bus` is exposed, and
  that the standalone demo has no external references.
- `breakAfter()` and `headerFooter()` on the fluent builder, completing the
  one-to-one mapping between setters and options.
- Full OSS scaffolding: `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`,
  `CODE_OF_CONDUCT.md`, issue and PR templates, Dependabot, and three CI
  workflows.
- A hosted documentation tree under `docs/`, replacing the reference material
  that used to live in the README.

### Fixed

- **Printing an `<img>` or `<canvas>` directly threw a `TypeError`.** The
  transforms called `parentNode.replaceChild` on a clone root, which is detached.
- **`off()` could not remove a listener registered with `once()`.** The wrapper
  was compared instead of the original function.
- **Printing a form field directly lost its value.** The form-state snapshot
  walked descendants only, never the root.
- **A print frame that never loaded hung the job forever**, with the iframe still
  attached. All three mounts now settle once, time out, and always tear down.
- **The popup path could lose its content**, because the freshly-opened
  `about:blank` document was used before the browser had finished replacing it.
- **Concurrent jobs saw each other's per-job listeners.** `Printcraft.print()`
  passed the global bus as the job's own emitter, so `options.on` handlers fired
  for every other job in flight. Every job now gets a private emitter and mirrors
  to the bus.
- **`keepSourceCSS` could print unstyled.** The asset wait covered images and
  webfonts but not the stylesheets it had just imported.
- **Relative URLs resolved against nothing.** The print document now carries a
  `<base href>` from the source page — the popup path was outright broken without
  it.
- **Overlapping target selectors printed the same element twice.**
- **A crashed job left `data-pc-id` attributes on the live page permanently.**
  Cleanup now sweeps the whole target subtree.
- **A privacy pattern without the `/g` flag blanked only the first match** in each
  text node — a silent leak. Non-global patterns are re-created with the flag.
- **An invalid selector in `redactSelectorList` was silently skipped**, printing
  the content the caller asked to hide. It now raises.
- **`waitForDialogClose` leaked its `matchMedia('print')` subscription** and left
  its timeout running; `waitForAssets` leaked the loser of its race.
- **The sanitizer did not strip nested `iframe`/`frame` elements**, which load in
  the print document's fresh same-origin context.
- **Redaction left `id` and `name` intact** — the attributes most likely to encode
  the value being hidden. Both are now scrubbed; `class` survives, since the
  redaction CSS needs it.
- **Selector options could inject arbitrary CSS.** A `}` in a break selector
  closed the generated rule. `{`, `}`, `<` and `/*` are now rejected at
  normalization.
- `pageBreakBetweenTargets: false` emitted a dangling empty CSS rule.
- Declarative triggers hijacked middle-clicks and clicks another handler had
  already claimed.
- `package.json` shipped a placeholder `YOUR_ORG` repository URL, listed a
  `printcraft.config.json` that did not exist, pointed `browser` at the UMD
  build, and claimed a `LICENSE` file that was missing.

### Changed

- **The demo carries no inline script or style.** Its markup is markup; behaviour
  lives in `demo/assets/js/demo.js` and styling in `demo/assets/scss/`, with the
  sources grouped under `demo/assets/{scss,css,js,img,favicon,data}`. A packaging
  test fails the build if a `<style>` block, a `style` attribute, or a script body
  reappears in the HTML.
- **A Sass component layer** — tokens, mixins, and components — compiled alongside
  the Tailwind utility layer and concatenated, so each tool does what it is good
  at. Sass goes second, so components win over utilities on equal specificity.
- **A favicon set**: `.ico` with three packed sizes, an SVG, an apple-touch icon,
  192/512 PNGs, and a web manifest, generated by `npm run favicons`.
- **The demo is hosted** at <https://simtabi.github.io/printcraft-js/>, deployed
  from `main`. The published page uses the ordinary separate-files build; the
  single-file standalone sits beside it at `/standalone.html`.
- **The demo is fully offline again.** It had regressed to the Tailwind Play CDN;
  the stylesheet is compiled by the Tailwind v4 CLI from `demo/tailwind.css` and
  inlined alongside the library, so `dist/demo-standalone.html` is one file with
  an empty network panel and no production warning.
- **`src/` is reorganised into concern folders** — `support/`, `options/`,
  `pipeline/`, `privacy/`, `production/`, `ui/` — and the 1,160-line `core.ts`
  with its 190-line `runJob` is now a `Job` class, three `Mount` strategies behind
  one interface, and a named transform chain. `core.ts` remains the barrel, and
  `Printcraft._internals` is unchanged.
- **TypeScript runs strict**, with `noUncheckedIndexedAccess`, `noUnusedLocals`
  and `noUnusedParameters`.
- **Tests moved to Vitest** (93 tests) and still run against the built UMD bundle.
- The version is injected from `package.json` at build time, so
  `Printcraft.version` can no longer drift.
- The draw-to-print rectangle no longer double-dims the page.
- `terser` removed — nothing used it; Vite 8 minifies with oxc.
- Node floor is `^20.19 || >=22.12` for the package, matching Vite 8. Developing
  needs Node 22+, because jsdom 30 does; `.nvmrc` pins it and CI runs 22 and 24.
- The demo's image-watermark job no longer fetches an SVG from Wikipedia, and its
  sample data is seeded rather than random, so the page it doubles as a visual
  test sheet for is reproducible.

## 1.1.0 — interaction, privacy, and TypeScript

Source migrated to TypeScript with a Vite build (ESM + UMD + declarations).
The runtime keeps zero dependencies. UMD global and every 1.0 API unchanged;
all 47 legacy tests pass against the new bundle, 21 new tests cover the
additions.

Fluent API: `Printcraft.job('#el')` returns a chainable builder
(`.exclude() .redact() .privacy() .marks() .watermark() .header() .annotate()
.clip() .transform() .hook() .on()` and friends) with validation deferred to
the `.print()` / `.inspect()` / `.toOptions()` terminals.

Interaction layer (`Printcraft.ui`, opt-in, Tabler icons, MIT):

- Right-click context menu: print page/element, pick sections, draw print
  area, toggle redaction, add note, inspect.
- Section picker: hover highlight, multi-select, floating toolbar, Enter
  prints, Esc cancels.
- Draw-to-print: drag a rectangle, see live dimensions, and print exactly
  that region via a clipped whole-body clone (`clipRect` option).
- Redactions and notes persist as `data-printcraft-*` attributes so every
  later job honors them.

Redaction and privacy:

- `redactSelectorList` + `data-printcraft-redact`: destructive declassified-
  file bars. Text becomes block characters, media becomes black boxes, and
  identifying attributes (href/src/title/alt/value/data-*) are scrubbed, so
  the print copy cannot be un-redacted.
- `privacy: true | {emails, phones, ssn, creditCards, custom}` auto-blanks
  PII by pattern scan; match count lands on the job record.
- Always-on clone sanitizer (`sanitize: false` to opt out): scripts,
  object/embed, inline `on*` handlers, and `javascript:` URLs never travel
  into the print document.

Print production:

- `printerMarks: true | {crop, bleed, markColor, markLength}` draws corner
  crop marks and a bleed inset on every page.
- `annotations: [{selector, text}]` and `data-printcraft-note` render
  break-safe note chips next to their elements.

## 1.0.0 — initial public release

Data-driven client-side printing library. Zero dependencies, single-file
IIFE/UMD.

- Core pipeline: clone target regions, transform the copy, assemble a print
  document in a hidden iframe (or popup), open the dialog, resolve a promise
  with a job record when it closes.
- Three driving surfaces: imperative API, declarative data-printcraft
  attributes with typed coercion, and JSON config (linked file, inline block,
  or runtime loadConfig/applyConfig).
- Content annotations: data-printcraft-exclude / -break-before / -break-after /
  -avoid-break / -reveal honored by every job.
- Transforms: exclusions, hidden-element reveal, link URL exposure, canvas
  snapshot, image stripping/lazy pinning, scrollable expansion, inline style
  strip, shadow DOM flattening, form-state preservation, selector transforms,
  legacy customMethodMap.
- Page setup: @page size and margins, per-target and selector-driven page
  breaks, repeating headers/footers, image and text watermarks.
- Events on instance and global bus for every stage, cancelable
  job:beforeprint, mutation hooks, per-job listeners via options.on.
- Devtools: visual inspector overlay, debug logging with per-stage timings,
  job record ring buffer with report().
- 47 unit tests (node --test + jsdom), Tailwind demo page, standalone demo
  build with the library inlined.

Lineage: a clean-room reimplementation and extension of the public API of
ezPrintJS v1.1.0 (2017). No code from that commercial library was used.
