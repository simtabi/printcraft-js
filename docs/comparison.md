# Comparison

Printcraft is a clean-room reimplementation and extension of the public API of
ezPrintJS v1.1.0. This page records what was audited, what was kept, and what
changed.

## Method

The audit covered the public surface of ezPrintJS v1.1.0 (CodeCanyon item
19379841): the sales page, the live demo site with its sixteen demos, and the
full published options table. The library itself is a commercial product, so its
source was never copied or decompiled. The rebuild recreates the same documented
API and behaviour from scratch in modern TypeScript. APIs and feature lists are
not copyrightable; the original author's code was never used.

## What v1 got right

No server side, selector-driven targeting, the exclusion list, watermarks, and the
overall clone-transform-print-elsewhere pipeline are all sound, and all preserved.

Zero dependencies survived until 3.0, when two arrived and are worth naming:
[`perfect-freehand`](https://github.com/steveruizok/perfect-freehand) for the pen
and [`coloris`](https://github.com/melloware/coloris) for the colour picker. Both
MIT, both with no dependencies of their own, 8.5 kB together. Each replaces
something we had written worse — a stroke that flattened every curve, and a
colour control with no opacity — and rewriting either would have been the
reinvention the rest of this file argues against.

## What changed, and why

| v1 behaviour                                                                       | Problem                                                                                                                         | Printcraft                                                                                                                                          |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `afterPrintCb` documented as "effective only with new window prints"               | The iframe path — the mode everyone should use — had no completion signal at all                                                | Promise-based lifecycle plus `afterprint`, `matchMedia('print')`, and a timeout, working in both modes                                              |
| `customMethodMap` banned arrow functions                                           | Options were smuggled in through `this`, a footgun                                                                              | Options passed as a second argument (`this` binding kept for compatibility), plus a modern `transforms: [{selector, fn}]` API keyed by CSS selector |
| `headerText` / `footerText` "not recommended for multipage prints due overlapping" | Absolutely positioned, so broken for the main use case                                                                          | `thead`/`tfoot` repetition, which browsers repeat on every printed page; the old fixed mode kept as `headerFooterMode: 'once'`                      |
| Popup printing was the default                                                     | Popup blockers eat the window unless the call is in a trusted click handler                                                     | Hidden iframe by default, popup opt-in, and a blocked popup raises instead of failing silently                                                      |
| No handling of form state                                                          | Cloning a subtree drops live values, checked boxes and select choices, so printed forms come out blank                          | Values, `checked` and `selected` are snapshotted into attributes on the clone; passwords and file inputs deliberately excluded                      |
| No asset readiness                                                                 | Nothing waited for images or webfonts, producing the classic blank-images-on-paper failure                                      | All images, `document.fonts.ready`, and imported stylesheets are awaited with a configurable timeout and an optional extra delay                    |
| Measurement on clones                                                              | Detached clones have no computed style or layout metrics                                                                        | The live tree is measured first, tagged with a temporary attribute, and the results applied to the clone                                            |
| Only a global                                                                      | No CommonJS/AMD/ESM story, no project-wide defaults, no cleanup guarantee if a job threw, no error callback, no types, no tests | ESM + UMD + declarations, global defaults, guaranteed teardown, `onError`, a full `PrintcraftOptions` type, and 93 unit tests plus 13 browser tests |
| `printCanvas` silently skipped tainted canvases                                    | No feedback                                                                                                                     | The silent skip is correct and was kept; capture is attempted for any canvas that can produce a data URL                                            |

## Feature parity

All twenty documented v1 options are supported: `target`, `printInIframe`,
`setPrintSize`, `beforePrintCb`, `afterPrintCb` (now working in iframe mode too),
`exposeLinkUrls`, `linkTextTemplate`, `keepSourceCSS`, `watermarkImageURL`,
`watermarkOpacity`, `headerText`, `footerText`, `revealHiddenElements`,
`printCanvas`, `extendScrollableAreas`, `scrollableAreasMaxHeight`,
`excludeSelectorList`, `removeInlineStyles`, `removeImages`,
`injectCustomStyle`, `customMethodMap`, and the Ctrl+P override.

## What Printcraft adds

- A promise API, `onError`, multiple targets with per-target page breaks,
  `pageMargin`, break-before/after/avoid selectors, `documentTitle`
- Text watermarks as generated SVG with angle control
- Form-state preservation, lazy-image forcing with `currentSrc` pinning, shadow
  DOM flattening, dark-mode stripping
- `printHTML` for raw strings, an unbindable hotkey, global defaults
- **Data-driven surfaces**: declarative triggers, JSON configuration, and content
  annotations, all feeding the same normalized options object
- **An observable pipeline**: named stages emitting events, a cancel path, and
  mutation hooks
- **Devtools**: a visual inspector, a namespaced debug logger, and a ring buffer
  of recent job records
- **Redaction and privacy**: destructive declassified-file bars, a PII scanner,
  and an always-on clone sanitizer
- **Print production**: crop marks with bleed, and break-safe note chips
- **An interaction layer**: right-click menu, section picker, and draw-to-print

## Deliberately out of scope

- **PDF generation.** The original excluded it too; use the browser's
  "Save as PDF".
- **Cross-origin iframe or URL printing.** Impossible without a server.
- **A print preview UI.** `Printcraft.inspect()` covers the development case; a
  user-facing preview is an application concern.

---

[← Docs index](../README.md#documentation)
