# Installation

Three ways to load Printcraft, and what each build in `dist/` is for.

## Requirements

Printcraft runs entirely in the browser and has no runtime dependencies. It needs
a browser with `afterprint`, `document.fonts`, and `break-before`: Chrome, Edge,
Firefox and Safari, current and two versions back.

Building from source requires Node `^20.19` or `>=22.12`.

## From npm

```bash
npm install @simtabi/printcraft
```

```js
import Printcraft from '@simtabi/printcraft';
```

The package ships ESM, UMD, and TypeScript declarations, wired through
`exports`, so bundlers, `require()`, and `node16` type resolution all pick the
right file without configuration.

## From a script tag

```html
<script src="printcraft.umd.js"></script>
```

The UMD build sets a `Printcraft` global. It also **auto-boots** on load: it
installs the delegated listener for `data-printcraft` triggers, reads any inline
JSON config, and exposes a `window.printcraft(options)` shorthand.

Two attributes on the script tag control that:

| Attribute                               | Effect                               |
| --------------------------------------- | ------------------------------------ |
| `data-auto-init="false"`                | Skip the auto-boot entirely          |
| `data-config="/printcraft.config.json"` | Fetch page-wide defaults from a file |

```html
<script src="printcraft.umd.js" data-config="/printcraft.config.json"></script>
```

> The auto-boot is a genuine import side effect. If you `import '@simtabi/printcraft'`
> purely for the declarative layer and your bundler is aggressive about unused
> imports, assign the default export to something so the module is retained.

## Build output

`npm run build` produces:

| File                        | What it is                                             |
| --------------------------- | ------------------------------------------------------ |
| `dist/printcraft.mjs`       | ESM bundle, for `import`                               |
| `dist/printcraft.umd.js`    | UMD bundle, for a script tag or `require()`            |
| `dist/types/*.d.ts`         | TypeScript declarations, including `PrintcraftOptions` |
| `dist/assets/`              | Compiled demo assets: css, js, favicon, img, data      |
| `dist/demo-standalone.html` | The whole demo as one self-contained file              |

Both bundles ship source maps.

## Trying it without installing anything

The hosted demo is at **<https://simtabi.github.io/printcraft-js/>**, with nothing to
install.

`dist/demo-standalone.html` is the same page as a single file, with the library,
the stylesheet, the demo script and even the favicon inlined. Open it from
`file://` with no server and no network; every job in it runs offline.

The repo demo at `demo/index.html` loads `../dist/` instead, so it needs
`npm run build` and `npm run demo` to serve the repo root. See [Demo](demo.md).

---

[← Docs index](../README.md#documentation)
