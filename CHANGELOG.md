# Changelog

All notable changes to this project are documented here. This project adheres to
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [3.0.0] - 2026-10-02 — a proof sheet before every print, daisyUI underneath, and one prefix

The class names and data attributes the kit renders are part of the public
surface, and this renames all of them; the component css underneath is
daisyUI's own; and choosing what to print now shows you the assembled
document before anything reaches the printer.

### Breaking

- **Class and attribute prefixes.** `pc-k-*` and `pc-*` are now `prjs-*`;
  `data-pc-*` is now `data-prjs-*`. **`data-printcraft-*` is unchanged** — it is
  the declarative API in users' HTML, it was already unambiguous, and renaming it
  would break every page using it for nothing.
- **Modal part names** follow daisyUI's anatomy: `prjs-panel` → `prjs-modal-box`,
  `prjs-head` → `prjs-modal-head`, `prjs-body` → `prjs-modal-body`, `prjs-foot` →
  `prjs-modal-action`.
- **Theme keys** are daisyUI's. `ink`/`paper`/`paperDim`/`rule` become
  `baseContent`/`base100`/`base200`/`base300`; `radius`/`radiusSm`/`radiusLg`
  become `radiusField`/`radiusSelector`/`radiusBox`. `danger` and `warn` still work
  as aliases for `error` and `warning`. `accent` is now daisyUI's accent colour
  rather than a second name for `primary`.
- The `draw` action is the region tool, as before. Drawn annotations are
  `annotate`, on `mod+shift+a`.

### The flow changed

Choosing what to print now shows you the assembled document before anything
reaches the printer. Right-click, the palette, the keyboard and the demo buttons
all open a **proof sheet**: the real document, the real page count, with Annotate,
Cancel and Print.

What it shows is not a rendering that resembles the output — it is the document,
mounted from the same `assemblePrintDocument` and `paginate` a real job runs, and
pressing Print continues _that job_ rather than starting a second one.

`Printcraft.print()` called from code still prints directly. An unattended job
must not sit waiting for somebody who is not there. `print({ proof: true })` and
`Printcraft.proof()` opt in.

### Added

- **Drawn annotations** (`src/annotate/`). Pen, highlighter, arrow, box, circle and
  text, as SVG rather than canvas so they print sharp and survive _Background
  graphics_ being off. Coordinates are fractions of the element they mark, so a
  circle round a total stays round that total on a narrower sheet. Undo, redo,
  colour and stroke width. Drawings are marks: they appear in the notes panel, on
  the notes page, and in the store, with no special-casing anywhere.
- **Memory** (`src/state/`). Marks, options, configuration, recent actions and
  unfinished work, over `memoryStore`, `localStore`, `sessionStore`, `httpStore` or
  a store you write. Opt-in with `persist: true`. A mark whose element cannot be
  found again is **reported, never guessed at**.
- **Configuration layers.** `defaults → backend → file → attribute → session →
call`, with `explain()` naming which layer set each value. A source can be an
  object, a url, an async function or a store; a layer that throws is skipped
  rather than fatal.
- **`coverPage`** and **`notesPage`** — the title and description on a sheet of
  their own at the front, and every mark listed at the back. Both take `true`, an
  object, or a function that builds the sheet. An unmarked document prints no notes
  sheet rather than an empty one.
- **Triangle carets** on every tooltip and popover, facing the side the browser
  actually drew on rather than the one that was asked for.
- **daisyUI's design system**, mirrored under `--prjs-`: all eight semantic
  colours, the base ramp, three radii, two sizes, border, depth and noise. The demo
  uses real daisyUI; the library mirrors it, because `.btn` and `.modal` are global
  names and a library must not take them.
- **`npm run vendor:audit`** plus a weekly workflow, comparing the tokens daisyUI
  declares with the ones the kit emits and opening an issue when they drift.
- `Printcraft.ui.buildActions()`, the stock catalogue as a plain array.
- **The demo shows the new work.** A proof section with four buttons: the proof
  over the report, the whole page paginated with a cover and a notes sheet, the
  annotation tools, and the colour picker. Its buttons predated all four, so
  there was no way to reach any of them without opening the console.
- **Two tests that guard against drift**: every event the code emits must be in
  the public `PrintcraftEvent` union, and every option in `PrintcraftOptions`
  must appear in `docs/tools/options.md`. Both failed when written — five events
  had drifted out of the union, including the whole `state:*` family, and
  `proof`, `coverPage` and `notesPage` shipped undocumented.

- **The kit is drawn by daisyUI itself.** Not its tokens mirrored under our own
  rules — its own component stylesheets, run through
  `tools/vendor-daisyui.mjs`, which unwraps the `@layer` blocks and renames every
  class to carry the `prjs-` prefix. Thirteen components: `button`, `input`,
  `select`, `textarea`, `range`, `checkbox`, `radio`, `fieldset`, `label`,
  `modal`, `card`, `badge`, `kbd`. About four hundred lines of our own component
  css are gone in exchange.

  Only components whose anatomy matches ours are taken. daisyUI's menu is
  `ul.menu > li > a` and ours is buttons in a div; its tooltip is a `::before`
  driven by `data-tip` and ours is a node in the top layer with a caret. Those
  would be rules matching nothing.

  The variables it reads are declared on `.prjs`, not `:root`, so they reach our
  surfaces and nothing else. A test asserts every class in the injected sheet is
  prefixed.

- **`Printcraft.proof()`** and the `proof` option. `src/proof/`, loaded on demand.
- **Settings on the proof.** Paper, orientation, margin, pagination, page
  numbers, cover and notes sheets, changed while looking at the sheet. Applying
  rebuilds it — and every annotation is still there afterwards, because a mark
  made on the proof is written back to the page element behind it rather than
  living on the copy. The link is `data-prjs-id`, which the pipeline already
  writes and normally sweeps up; the proof holds it open, tags the whole subtree
  rather than only what needed measuring, and sweeps it on close.
- **Action scopes.** An action now says which surfaces offer it —
  `page`, `element`, `region`, `selection`, `proof`, `annotation` — so a surface
  shows what belongs on it instead of everything. Unscoped actions default to
  `['page', 'element']`, so nothing a host registered disappears.
- **A context menu on the drawn region.** Right-click inside a selection and get
  the three things that are about a selection. The page menu no longer offers
  them, and the region menu no longer offers the page's.
- **A colour field with opacity**, on [Coloris](https://github.com/melloware/coloris)
  — 5.4 kB, no dependencies, real alpha. It is a field in the form system, so it
  gets the label, hint, validation and error slot every other field has. Its
  stylesheet is generated into the bundle by `npm run vendor:css`, so there is
  still no external request and the standalone build still opens from `file://`.
- **A `range` field**, with a live readout, and **fieldsets** so a settings dialog
  stops being one flat column.
- **Images in annotations.** Paste, drop or pick. Downscaled to fit a byte budget,
  stored as a data URI — never a remote URL, which would print as an empty box on
  a slow connection and fine on a fast one.
- The annotation toolbar's **Pen** button opens a form rather than cycling blindly
  through six colours, and its status line is chips with a real swatch.

### Changed

- **Freehand drawing is freehand.** The pen ran every stroke through a 0.002
  tolerance and then joined the survivors with quadratic curves, which flattened
  a quick loop into an oval. It uses
  [perfect-freehand](https://github.com/steveruizok/perfect-freehand) now — 2 kB,
  no dependencies — for a real variable-width stroke that thins with speed and
  honours pen pressure. The outline is a **filled** path, which is what lets the
  width vary, and is computed in pixel space: a fill cannot use
  `vector-effect: non-scaling-stroke`, so on a 900×40 heading a 3px nib was
  coming out 27px across and 0.13px tall.
- **Toolbars stack.** Every one was `position: fixed; bottom: 22px`, so two open
  at once landed on top of each other. They share a lane now, and the lane moves
  to the opposite edge when it would cover the selection it is describing.
- **`perfect-freehand` and `coloris` are the first two runtime dependencies.**
  Both MIT, both leaf, 8.5 kB together. The README's "zero dependencies" becomes
  "two, both leaf".
- The UMD budget is **80 kB**, up from 60. It measures 78.83, of which 8.6 kB is
  daisyUI's own component css, 5.4 kB Coloris and 2 kB perfect-freehand. Roughly
  four hundred lines of hand-written component css came out in exchange.
- **The vendored daisyUI sheet is a committed build input.** `prebuild` used to
  regenerate it from whichever daisyUI the `^5.7.4` range resolved, and with no
  lock file CI took 5.7.47, which put the UMD bundle at 81.99 kB with nothing in
  this repository changed. The build now bundles the committed file, and CI checks
  it against the range's floor (`vendor-daisyui.mjs --check --floor`).
- **daisyUI's breakpoint copies are no longer bundled.** Every component arrived
  again once per breakpoint under `sm:` `md:` `lg:` `xl:` `2xl:`, renamed to
  `prjs-sm:btn` and the like, which nothing in the kit or the docs uses — sizes
  and tones go through `data-size` and `data-tone`. Every plain rule, variant
  included, is unchanged. The `2xl:` copies were also escaped as `.\32 xl\:`,
  which the rename did not recognise, so they reached the host page unprefixed.
  The UMD bundle drops from 79.76 to 76.86 kB and core + `/ui` from 56 to 53.17.

### Fixed

- **A menu taller than the viewport could not be scrolled.** The dismiss-on-scroll
  listener was bound at the document in capture, so scrolling the menu's own
  `overflow: auto` box closed it. Scrolling the page still dismisses it.
- **A window resize threw the menu away.** It is put back in view instead.
- **A modal with nothing to say rendered an empty band** between its title and its
  buttons. `notify` maps `message` onto the header sub-line, so its body took
  nothing and drew 36px of it.
- **Two controls for one action.** The header offered a text button reading
  "Close" beside a footer button reading "OK". The header is now an icon-only `×`.
- **The command palette had no visible way out.** Escape worked and the footer said
  so, which is not the same thing.
- **A second action registered as `draw` silently replaced the region tool**,
  removing it from the menu and the palette with nothing failing. Two tests now
  guard the catalogue against duplicate ids and duplicate keybindings.
- **The notes page would have reprinted redacted text.** An element's description
  quotes its content, which for a redacted element is the secret. The leak verifier
  caught it; redaction lines now carry the structural pointer alone.
- Drawing on `<html>` is refused: it sits outside `<body>`, so no target selector
  could reach it and the mark would be stored and then silently missing.

- **Right-clicking a drawn region opened Chrome's menu, not ours.** The region
  tool takes its actions from the registry, and `Printcraft.ui.drawArea()` — which
  is what the demo's button and every documented call use — never passed one. The
  handler returned before `preventDefault`, so the browser's own menu opened over
  our overlay, and from there the tool looked entirely broken. The surface passes
  the shared interface's registry now, and **no tool overlay lets the native menu
  through under any circumstances**: its entries are about a document the overlay
  is covering.

  The test that was supposed to catch this drove `ui.run('draw')`, which carries
  the registry in its action context. Every one of these paths now has a test
  that clicks the demo's own button.

- **`inspect` still mounted the old overlay.** The proof sheet was built to
  replace it and the last release only stopped short of doing so, which left two
  panels answering the same question and a stale one that intercepted clicks.
  `Printcraft.inspect()` opens the proof read-only; `mountOverlay` and its two
  hundred lines are deleted.
- **The notes panel had two ways out** — a header `×` and a footer "Close".
  The footer one is gone.
- **Two toolbar actions could share an id**, which made the first one unreachable
  from `setDisabled` and `setActive`. The annotation bar shipped with two `pen`s.
  It warns now.
- **The packaging test was reading the wrong file.** It checked
  `printcraft-core.mjs`, which is a shared chunk that happens to be named like an
  entry, and passed because that chunk once held the paginator. It follows the
  static import graph from the real entry now — and immediately caught a static
  edge from core into the component kit that the proof sheet had introduced.

- **Four layers were collapsed into one by the 32-bit `z-index` ceiling.** The
  base sat at 2147483600 with offsets running to +70, and anything over
  2147483647 is clamped to it — so the toolbar, the modal scrim, the menu and the
  toasts all resolved to the same number and their order was really the order
  they happened to be appended in. The base is 2147483000 now, and a test
  asserts no layer clamps.
- **The region toolbar oscillated and could not be clicked.** It moves off the
  selection it describes, which stopped it colliding, which moved it back, which
  made it collide again — forever, at five hertz. It reads the band it _would_
  occupy at the bottom rather than where it currently is, so the decision is
  stable.
- **A tool overlay covered its own toolbar.** The overlay's z-index was
  hard-coded at 2147483645, outside the theme stack entirely, and only sat below
  the toolbar because the toolbar's value clamped two higher. It derives from the
  theme's base now, at +40, between the proof and the controls that drive it.
- **A surface could open behind the surface that opened it.** The proof panel
  shipped at `z + 60`, above the modal scrim at `z + 40`, so its own Settings
  dialog rendered behind it: visible, and impossible to click. The stack now
  follows what opens over what — proof 30, toolbar 50, modal 55, menu 60,
  toast 70 — and a test asserts the order, because nothing about it is apparent
  from reading either file.

- **Six dead exports removed** — `srOnly`, `alphaOf`, `failColor`, `warnEmpty`,
  `pullMarks` and `isProof`. Five were written this release and never called;
  unused public surface still has to be maintained and documented.
- **Three docs still described the removed inspector overlay** and its Print /
  Log HTML / Close controls.

- **Two open proofs crossed their links.** Every measurement numbered its
  `data-prjs-id` links from 1, so two proofs on one page tagged different
  elements with the same ids, and closing either swept every link in the
  document. Links now carry a per-job owner, and a proof releases only its own.

- **A proof of a drawn region could not keep a mark.** The clip path measured
  nothing, so no part of a region proof linked back to the page, and Settings
  rebuilt it without the marks. A reflowed region is now tagged like any other
  target. A mark with nothing behind it — a captured region's raster, a page
  number, a cover sheet — still prints with that sheet, and Settings switches off
  for the proof so a rebuild cannot lose it.

- **Most interactive prints skipped the proof.** Only Print this element and
  Print the page went through it; picking sections, the region tool, area
  redaction, the notes panel, the settings dialog and the demo's job tickets all
  went straight to the printer. Every handoff now goes through one helper that
  honours `proof: false`, and the settings dialog no longer reports pages "sent
  to the printer" for a proof that was cancelled.

- **A drawing moved a positioned element on paper.** The overlay needs a
  containing block, and the transform gave every host without an inline
  `position` an inline `position: relative`, so an element a stylesheet
  positioned — `.badge { position: absolute }` — was pulled back into flow. The
  print document now sets it with a zero-specificity `:where()` rule that only
  replaces `static`, and a photographed copy asks for the computed position.

- **A colour field accepted things that are not colours.** Anything starting
  `rgb(`, `hsl(` or `color(` and every bare word passed, so `rgb(nope)` and
  `notacolor` reached an svg that drew no ink. The field now asks the browser's
  css parser.

- **Loading a page with `persist` on deleted its lost marks.** The observer that
  saves marks was running while saved marks were put back, so restoring them
  counted as an edit, and 250ms later the store held only the marks that
  resolved. Restoration is no longer saved as an edit; a change made while it
  runs still is.

- **A restored drawing was invisible on the page.** Restoring put the
  `data-printcraft-drawing` attribute back and nothing drew it, so the drawing
  printed but could not be seen after a reload. Restoring now repaints it;
  `repaintAll` existed for exactly this and had no caller.

- **A mark made on an empty element reattached after the element gained words.**
  An anchor with no text was accepted on its selector alone, so a redaction made
  on an empty slot was put back on whatever that slot held later. It is now
  reported lost, like any other element whose content changed.

- **`persist` only remembered marks.** Options, activity and progress were
  documented and never wired up. An interface created with `persist` now
  remembers the settings of every job it prints (under the host's own `base`),
  lifts recently used actions to the top of the palette, and brings back a region
  selection that was drawn and never printed. A failed store read or write is
  reported as `state:error` instead of an unhandled rejection, and data in the
  wrong shape is skipped rather than thrown on.
- **`configure()` never reached the right-click menu.** The menu captured the
  options object when it was installed and `configure()` replaces it, so jobs
  started from a right-click ignored it. The menu now reads them when it opens.

- **A mark on an image, a field or an empty box could reattach to the wrong
  one.** With no text to compare, an anchor was matched on its selector alone,
  and an `nth-of-type` path moves when a sibling of the same tag is inserted.
  Such anchors now store a structural fingerprint and the text either side, and
  both must match; an element nothing distinguishes is trusted only by `id`.
  Anchors saved without the new fields keep the old rule.

- **Faint text failed contrast.** Group headings, the palette placeholder and
  the notes panel's "where" lines use the faint ink at 10-11px, at 3.1-3.4:1 on
  the kit's surfaces in both schemes. It is now `#6b6d74` light and `#909299`
  dark, at least 4.5:1 on both surfaces, and a test checks every text colour.

- **Keys reached the surface underneath a dialog.** Every surface listened on
  the document in capture and the one opened first heard a key first, so Escape
  in the proof's Settings dialog cancelled the proof, Tab in it was pulled back
  to the proof on every press, arrow keys in the region tool's Title field moved
  the hidden box, and Escape or Ctrl+Z in the studio's Pen and Text dialogs
  closed the studio or undid a mark. Only the topmost dialog answers now.
- **Enter on Cancel ran the primary action.** A modal turned every Enter into
  its primary button; Enter on a button now means that button.

- **Proof lifecycle gaps.** A Settings rebuild that failed rejected into a
  promise nobody held; it is now reported through `job:error` only. An inspected
  proof closed with Escape or Cancel left its source links on the page. A
  flowed (unpaginated) proof showed an empty page rail. A double-click on
  Settings opened two dialogs and could start two rebuilds, and a chunk that
  failed to load surfaced as an unhandled rejection. The rail is now a labelled
  navigation landmark marking the current page, and zoom changes are announced.

- **Drawing tools left things behind.** Undoing a pen stroke left its resize
  watcher running, which redrew the stroke when the host resized. A click with
  the studio open made the element `position: relative` for good. The studio
  drew on Coloris's colour area and blocked it, and a touch that became a scroll
  left the preview on the page. In the region tool, the toolbar's Start over
  kept the old box for the next visit, and a right-click on the box started a
  move that followed the mouse.

- **Memory lost work in four ways.** The first edit after a restore deleted
  every mark the restore had reported lost; they are now kept and written back
  until `clearMarks()` or `forget()`. `destroy()` dropped a save still waiting
  on its 250ms debounce, and so did leaving the page; both now write it.
  `used()` and `rememberOptions()` raced over a slow store and dropped updates;
  writes are now queued. A restore that finished after `destroy()` still wrote
  marks onto the page.
- **`httpStore` treated a 404 on `PUT` as success**, so a wrong url swallowed
  every save. A record a newer build wrote to `localStore` was read as if it
  were current; it is now left alone.
- **`Printcraft.ui.memory` read the wrong session.** It returned the shared
  interface's, which never persists, and reading it installed a second menu and
  keymap. It is now the live interface created with `persist`.

- **Docs that promised more than the code did.** `docs/tools/memory.md`
  listed configuration as remembered, imported the stores from
  `@simtabi/printcraft/ui` (now exported there), and listed `PC_MARK_LOST` as
  thrown; the events table had payload fields that were not sent, and the
  options save now sends `count` and `store` like the others. The annotate page
  described a toolbar that cycled colours, which became the Pen form.

- **`httpStore().clear()` emptied the whole collection** — on a per-user state
  service, every page's marks. It now deletes only keys under its new `prefix`
  option, one at a time, and without a prefix refuses unless called as
  `clear({ all: true })`.
- **A `localStore` `limit` evicted other pages' records.** Every page shares the
  prefix; the limit now counts one page's records at a time.
- **A config object with a `store` key was taken for a store source**, so
  `{ store: 'main' }` threw and its layer was skipped. A store is now recognised
  by having `get` and `set`.

- **Two region tools shared one selection.** A single slot held the open
  selection, so a second tool took it over and region actions from the first
  page acted on the second. Each document now answers for its own.

- **The proof's keys did nothing with focus inside the sheet.** After clicking
  the paper, or with the drawing tools open, Escape did not cancel and the print
  shortcut opened the browser's own dialog. The proof now hears both from its
  frame, leaving a key the drawing tools already handled to them.

- **The colour picker ignored `alpha: false`, and a failed load was final.**
  Opacity was configured once for every field, and a picker that failed to load
  never tried again until a reload. A field without alpha now gets a picker
  without it, and the next field retries a failed load.

- **Toolbars vanished after the host replaced `<body>`.** The lanes they dock
  in were attached once; they are now put back when the next toolbar opens,
  bringing any bar still in them along.

- **Three accessibility gaps.** Removing a mark in the notes panel dropped
  focus to `<body>`; it now moves to the next mark, the previous one, or the
  panel. The studio's tool buttons now say which is pressed. Colour swatches
  were read out as hex; they now have names ("Red", or "Colour #123456") and a
  labelled group.

### Not fixed

- The ⊗ floating in the Description box in two of the screenshots is not ours.
  Nothing in `form.ts` renders it and no absolutely-positioned node exists in that
  modal; it is a browser extension.

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
- **A crashed job left `data-prjs-id` attributes on the live page permanently.**
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
