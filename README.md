# @simtabi/printcraft

[![npm](https://img.shields.io/npm/v/@simtabi/printcraft.svg)](https://www.npmjs.com/package/@simtabi/printcraft)
[![Tests](https://img.shields.io/github/actions/workflow/status/simtabi/printcraft-js/tests.yml?branch=main&label=Tests)](https://github.com/simtabi/printcraft-js/actions/workflows/tests.yml)
[![Static analysis](https://img.shields.io/github/actions/workflow/status/simtabi/printcraft-js/static-analysis.yml?branch=main&label=Static%20analysis)](https://github.com/simtabi/printcraft-js/actions/workflows/static-analysis.yml)
[![License MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> Data-driven client-side printing: print any region of a page cleanly, drive jobs from JavaScript, data attributes, JSON config or a right-click menu, redact like a declassified file, auto-blank PII, and draw the exact area you want on paper.

Runs in any browser with `afterprint` and `document.fonts`: Chrome, Edge, Firefox and Safari, current and two back. TypeScript source, zero runtime dependencies, ESM + UMD builds.

**[Try the demo](https://simtabi.github.io/printcraft-js/)**: twenty-three print jobs, the interaction layer, and the inspector, with nothing to install.

## Install

```bash
npm install @simtabi/printcraft
```

```js
import Printcraft from '@simtabi/printcraft'; // esm
const Printcraft = require('@simtabi/printcraft'); // cjs (umd build)
```

Or a script tag. The UMD build sets a `Printcraft` global and boots the
declarative layer automatically:

```html
<script src="printcraft.umd.js"></script>
<button data-printcraft="#invoice">Print</button>
```

## <a name="documentation"></a>Documentation

Full documentation: **<https://opensource.simtabi.com/documentation/simtabi/printcraft-js/>**

### Guides

- [Installation](docs/installation.md) — package, script tag, and build output
- [Demo](docs/demo.md) — where to run it, and how its assets are built
- [Getting started](docs/getting-started.md) — your first job, in each of the three surfaces
- [Surfaces](docs/surfaces.md) — imperative, declarative, and JSON config
- [Configuration](docs/configuration.md) — page defaults, config files, content annotations
- [Architecture](docs/architecture.md) — the pipeline, the module layout, and why it is shaped this way
- [Comparison](docs/comparison.md) — lineage from ezPrintJS, and what changed
- [Release](docs/release.md) — versioning and the publish process

### Reference

- [Options](docs/tools/options.md) — every option, grouped by concern
- [Events](docs/tools/events.md) — the job lifecycle, hooks, and cancellation
- [Redaction](docs/tools/redaction.md) — destructive, declassified-file bars
- [Privacy](docs/tools/privacy.md) — the PII scanner
- [Printer marks](docs/tools/printer-marks.md) — crop marks and bleed
- [Annotations](docs/tools/annotations.md) — note chips in the print copy
- [Clip printing](docs/tools/clip-printing.md) — printing an exact rectangle
- [Watermarks](docs/tools/watermarks.md) — text and image watermarks
- [Interaction UI](docs/tools/interaction-ui.md) — context menu, picker, draw-to-print
- [Devtools](docs/tools/devtools.md) — the inspector, the debug log, job records

### Recipes

- [Print an invoice](docs/recipes/print-an-invoice.md)
- [Redact before printing](docs/recipes/redact-before-printing.md)
- [Draw a print area](docs/recipes/draw-a-print-area.md)
- [Crop marks for press](docs/recipes/crop-marks-for-press.md)
- [Page defaults from JSON](docs/recipes/defaults-from-json.md)
- [Override Ctrl+P](docs/recipes/override-ctrl-p.md)

## Community

Questions and ideas belong in
[GitHub Discussions](https://github.com/simtabi/printcraft-js/discussions);
bugs in [Issues](https://github.com/simtabi/printcraft-js/issues).

## Contributing & security

See [CONTRIBUTING.md](CONTRIBUTING.md) for local setup and conventions, and
[SECURITY.md](SECURITY.md) to report a vulnerability privately.

## License

MIT. A clean-room reimplementation and extension of the public API of ezPrintJS
v1.1.0 (2017); no code from that commercial library was used. Icon artwork from
[Tabler Icons](https://tabler.io/icons) (MIT).
