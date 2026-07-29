# Changelog

All notable changes to this project are documented here. This project adheres to
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] — pages you can count, regions that print what you drew, and an interface

The version says 2.0 because the option surface grew a great deal and two
defaults changed: the right-click menu now installs itself, and `clipMode`
defaults to `capture`. Everything that worked in 1.2 still works.

### Fixed

- **A drawn region printed a blank page.** The print frame was mounted 0×0, so
  the clone laid out against a zero-width viewport: every media query collapsed
  to its narrowest breakpoint and the content reflowed into something nobody had
  seen. Measured on the demo: 5935px of content where the real page is 4140px.
  Every job was affected; a clipped one was fatal, because the rectangle landed
  on whatever had moved there. The frame is now mounted at the sheet size.
- **The region preview drew nothing.** The raster was fine, a 1280×900 png with
  no errors, but the `<img>` showing it laid out at 77×54: the host page's
  `img { max-width: 100% }` sized it to its container before the transform meant
  to position it, and the negative offsets put what was left outside the box.
  The preview is a crop now, so there is no arithmetic for host css to
  invalidate, and the kit re-states the styles it depends on.
- **A watermark marked one page.** It was a single `position: fixed` element on
  the body: 794×1123 in a 5089px document, and under pagination it sat outside
  the sheets entirely, so six sheets shared one mark.
- **`annotate(el, null)` did nothing.** Null meant "cancelled" and returned
  early, which made removal-by-null look like it worked.
- **The interface never installed itself at boot.** The boot ran before the `/ui`
  entry had attached anything, so it reached for a surface that was not there
  yet. Importing both `/ui` and `/share` also built the surface twice, and one
  right-click opened two menus.
- **Keybindings were bound to the wrong modifier** wherever `userAgentData`
  disagreed with `navigator.platform`, which it does under an automated browser.
- **`keepSourceCSS` copied the interface's own stylesheet** into every printed
  document.

### Added

- **A paginator.** Real sheets, page numbers, per-page borders and padding,
  running headers and footers, and `@page { margin: 0 }`, which is what removes
  the browser's own date, title, url and page count. Browsers do not implement
  the Paged Media margin boxes any of this would otherwise need.
- **Region capture.** `clipMode: 'capture'` rasterises the region at the layout
  it was chosen against. At pagination time the browser re-evaluates media
  queries against the page box, so live markup cannot be clipped faithfully:
  measured, a `min-width: 1000px` rule that makes a block 3000px tall yields one
  A4 page, not four.
- **A region tool** with eight handles, move, arrow-key nudge, a live readout in
  px and mm, and a confirm step that shows what will print and says so when the
  selection is empty.
- **A print settings dialog** owning everything up to the browser's handoff.
- **A component kit** — modals, confirms, menus, forms, toolbars, toasts,
  tooltips, popovers and a command palette — with semantic tones, dark mode and
  a token set a host can restyle. Tooltips and popovers use the platform's
  `popover` attribute and CSS anchor positioning where they exist.
- **An actions registry.** Every capability is one registered thing with an id,
  a description, an icon, a keybinding, a `when` that can say why it is off, and
  a `run`. The menu renders them, the palette searches them, the keymap fires
  them, and a host adds, replaces, reorders or removes any of them by id.
- **A command palette** on `Mod+K`, matching by subsequence and showing which
  characters matched.
- **Keyboard commands** for every bound action, suppressed while typing.
- **Multiple instances.** `Printcraft.ui.create()` gives a panel its own
  registry, menu, keymap and scope; `destroy()` takes it all down.
- **The right-click menu installs itself**, with a heading, a one-line
  description, a description on every row and red rows for destructive ones.
  `data-menu="false"` turns it off.
- **A notes panel** listing every note and redaction, with scroll-to, edit and
  remove, before anything prints.
- **A printed heading.** `documentTitle` and `documentDescription` are drawn
  above the content, so a title stops being only a save-as-PDF filename.
- **Redaction by dragging.** A rectangle resolves to the characters it covers,
  so half a paragraph redacts as half a paragraph.
- **A redaction verifier.** The assembled document is re-read for every string
  redaction destroyed. A hit throws `PC_REDACTION_LEAK` and nothing prints.
- **Screenshots, clipboard and email**, all from the transformed clone, so a
  redacted document stays redacted in the png, the clipboard payload and the
  attachment.
- **Print backends.** `PrintBackend` with the browser as the default, plus
  working `httpBackend` and `socketBackend` transports.
- **Coded errors.** Every failure carries a stable code, a hint saying what to
  change, and the context that made it specific.
- **A structured logger** with levels, sinks and a ring buffer that fills
  whatever the level is, so `logger.export()` works after the fact.
- **A command line.** `printcraft print`, `doctor` and `init`, with Playwright as
  an optional peer. `doctor` exits non-zero when something would leak, which
  makes it a CI gate.
- **`afterPaginate` and `beforeBackend` hooks.** The first receives the sheets as
  live elements, which is the only place to reach one in particular. The second
  is the last look before a job leaves the browser, against the payload a
  backend actually receives rather than the mounted document; returning an
  object replaces the job and `false` cancels it.
- **`contributeActions`**, so a layer that is not always loaded can add its own.
  `/share` uses it to put screenshot, copy and email in the menu without the
  catalogue importing a rasteriser.
- **Subpath exports.** `@simtabi/printcraft` is 22 kB; `/ui` and `/share` are
  opt-in. The umd bundle stays whole.

### Changed

- **The right-click menu is on by default.** `data-menu="false"`, or
  `Printcraft.autoMenu = false`, restores the browser's.
- **`clipMode` defaults to `capture`.** `'reflow'` is the old behaviour.
- **`watermark` is an object** with position, size, rotation, colour, font,
  tiling and layer. The flat `watermarkText` options still work as aliases.
- **A repeating watermark turns pagination on**, because `position: fixed` paints
  the first page and stops. The job logs that it did.
- **`redactionPolicy` defaults to `strict`** for any job with redaction.
- **`.watermark()` takes the object form.** It previously accepted arbitrary
  options and merged them.
- **Theme tones are objects** — background, foreground, border and a soft
  variant — and can be given as one colour. `accent` still works.
- **The sanitiser checks urls against an allowlist** rather than looking for
  `javascript:`, and removes `base`, `template`, `srcdoc`, `meta[http-equiv]`
  and external svg `use` references.

### Removed

- `buildMenuItems` and `openContextMenuAt`, replaced by the actions registry.

### Upgrading

- **A configured `documentTitle` now prints a heading.** It used to reach only
  the browser's save-as-PDF filename. Set `printHeading: false` alongside it to
  keep the old behaviour, which is what the demo's own config does.
- **The right-click menu installs itself.** `data-menu="false"` on the script
  tag, or `Printcraft.autoMenu = false` before load, restores the browser's.
- **`clipMode` defaults to `capture`.** Pass `'reflow'` for the old behaviour.
- **`.watermark()` takes a watermark**, not arbitrary options. `.set()` is where
  arbitrary options were always meant to go.
- **`redactionPolicy` defaults to `strict`.** A job whose redaction did not take
  now throws instead of printing. `'warn'` restores the old behaviour.

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
