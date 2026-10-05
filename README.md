# @simtabi/printcraft

[![npm](https://img.shields.io/npm/v/@simtabi/printcraft.svg)](https://www.npmjs.com/package/@simtabi/printcraft)
[![Tests](https://img.shields.io/github/actions/workflow/status/simtabi/printcraft-js/tests.yml?branch=main&label=Tests)](https://github.com/simtabi/printcraft-js/actions/workflows/tests.yml)
[![Static analysis](https://img.shields.io/github/actions/workflow/status/simtabi/printcraft-js/static-analysis.yml?branch=main&label=Static%20analysis)](https://github.com/simtabi/printcraft-js/actions/workflows/static-analysis.yml)
[![License MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> Client-side printing you can aim: real paginated sheets with numbers and borders, a region tool that prints what you drew, redaction that is verified rather than hoped for, and a right-click menu, command palette and keyboard commands that are there the moment the script loads.

Runs in any browser with `afterprint` and `document.fonts`: Chrome, Edge, Firefox and Safari, current and two back. TypeScript source, two runtime dependencies (both leaf), ESM + UMD builds, and a command line for CI.

**[Try the demo](https://simtabi.github.io/printcraft-js/)**: every job, the interaction layer and the inspector, with nothing to install.

## Install

```bash
npm install @simtabi/printcraft
```

3.0.0 is on npm. Releases after it are published to GitHub Packages while npm's trusted publishing cannot take a publish from this repository ([npm/cli#9969](https://github.com/npm/cli/issues/9969)). GitHub Packages asks for a token even for a public package, so to install one, add a GitHub token with `read:packages` to the project's `.npmrc` first:

```ini
@simtabi:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

See [npm or GitHub Packages](docs/release.md#npm-or-github-packages).

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

## Quick start guide and usage

### Getting started

Nothing to configure: once the module is imported (or the UMD script is loaded),
`Printcraft` is ready to print. Two optional script-tag attributes control the
UMD auto-boot:

1. `data-auto-init="false"` skips the auto-boot entirely.
2. `data-config="/printcraft.config.json"` fetches page-wide defaults from a file.

### Usage

```js
const job = await Printcraft.print('#invoice');
console.log(job.status, job.duration + 'ms');
```

```js
await Printcraft.print({
  target: '#invoice',
  excludeSelectorList: ['.ads', 'nav'],
  headerText: 'ACME CO',
  setPrintSize: 'A4 portrait',
  pageMargin: '18mm'
});
```

```js
await Printcraft.job('#invoice').exclude('.ads').redact('.ssn').watermark('DRAFT', 0.15).print();
```

The full walkthrough is in [Getting started](docs/getting-started.md); everything else is in the [documentation index](#documentation).

## <a name="documentation"></a>Documentation

Full documentation: **<https://opensource.simtabi.com/documentation/simtabi/printcraft-js/>**

### Guides

- [Installation](docs/installation.md) — package, script tag, and build output
- [Demo](docs/demo.md) — where to run it, and how its assets are built
- [Getting started](docs/getting-started.md) — your first job, in each of the three surfaces
- [Surfaces](docs/surfaces.md) — imperative, declarative, and JSON config
- [Configuration](docs/configuration.md) — page defaults, config files, content annotations
- [Architecture](docs/architecture.md) — the pipeline, the module layout, and why it is shaped this way
- [Pagination](docs/pagination.md) — real sheets, page numbers, borders and running bands
- [The proof sheet](docs/proof.md) — see the assembled document before it prints
- [Cover and notes pages](docs/pages.md) — the title at the front, every mark listed at the back
- [Security](docs/security.md) — the threat model, and what redaction guarantees
- [Print backends](docs/backends.md) — sending a job to a server or a companion service
- [Comparison](docs/comparison.md) — lineage from ezPrintJS, and what changed
- [Release](docs/release.md) — versioning and the publish process

### Reference

- [Options](docs/tools/options.md) — every option, grouped by concern
- [Events](docs/tools/events.md) — the job lifecycle, hooks, and cancellation
- [Redaction](docs/tools/redaction.md) — destructive, declassified-file bars
- [Privacy](docs/tools/privacy.md) — the PII scanner
- [Printer marks](docs/tools/printer-marks.md) — crop marks and bleed
- [Annotations](docs/tools/annotations.md) — note chips in the print copy
- [Drawn annotations](docs/tools/annotate.md) — pen, highlighter, arrows, boxes and text
- [Clip printing](docs/tools/clip-printing.md) — printing an exact rectangle
- [Watermarks](docs/tools/watermarks.md) — text and image watermarks
- [The interaction layer](docs/tools/interaction-ui.md) — actions, menu, command palette, keyboard, theming
- [The component kit](docs/tools/component-kit.md) — modals, menus, forms, toasts, tooltips, popovers
- [Sharing](docs/tools/sharing.md) — screenshots, clipboard and email
- [Memory](docs/tools/memory.md) — remembering marks, options and activity between visits
- [Errors and logging](docs/tools/logging.md) — codes, levels, sinks and events
- [The command line](docs/tools/cli.md) — print, doctor and init, for CI
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
