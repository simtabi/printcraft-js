# Contributing

Thanks for helping improve Printcraft. This page covers the local setup, the
conventions the codebase follows, and what a reviewable pull request looks like.

## Local development

```bash
git clone https://github.com/simtabi/printcraft-js.git
cd printcraft-js
npm install
npm run build
npm test
```

Node `^20.19` or `>=22.12` is required — that is Vite 8's floor, and the build
fails below it.

| Command                 | What it does                                                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `npm run build`         | Cleans `dist/`, bundles ESM + UMD, emits declarations, compiles the demo stylesheet, and generates the standalone demo |
| `npm run dev`           | Rebuilds the bundles on change                                                                                         |
| `npm run demo`          | Serves the repo demo at `/demo/index.html` (run `npm run build` first)                                                 |
| `npm test`              | Builds, then runs the Vitest suite against the built UMD bundle                                                        |
| `npm run test:watch`    | Vitest in watch mode, no rebuild                                                                                       |
| `npm run test:coverage` | Coverage report over `src/`                                                                                            |
| `npm run test:e2e`      | Playwright suite in Chromium                                                                                           |
| `npm run typecheck`     | `tsc` in strict mode                                                                                                   |
| `npm run lint`          | oxlint                                                                                                                 |
| `npm run format`        | Prettier                                                                                                               |
| `npm run lint:pkg`      | `publint` + `attw` — package metadata and type resolution                                                              |
| `npm run size`          | Bundle-size budgets                                                                                                    |

For a watch loop, run `npm run dev` and `npm run demo` in two terminals.

## How the source is organised

```
src/
├── index.ts          the public Printcraft class: fluent builder + statics
├── core.ts           internal barrel, and the _internals compatibility facade
├── types.ts          the public type surface
├── support/          primitives with no printing knowledge
├── options/          how a job is described (defaults, normalize, attributes)
├── pipeline/         how a job runs (job, measure, transforms, document, mounts)
├── privacy/          redaction, the PII scan, and the clone sanitizer
├── production/       printer marks
└── ui/               the opt-in interaction layer

demo/
├── index.html        markup only — no inline script, no inline style
└── assets/           scss/ css/ js/ img/ favicon/ data/

tools/
├── build.mjs         the standalone single-file demo
├── build-assets.mjs  sass + tailwind + static assets
├── build-types.mjs   tsc, plus the .d.mts and .d.cts entry shims
├── build-site.mjs    the GitHub Pages site
└── make-favicons.mjs the raster favicon set
```

The demo's markup carries **no inline script or style** — a packaging test fails
the build if any creeps back in. Behaviour goes in `demo/assets/js/demo.js`,
styling in `demo/assets/scss/`. See [docs/demo.md](docs/demo.md).

Every job — imperative, fluent, declarative, or triggered from the UI — converges
on `normalizeOptions()` and then runs the same ordered stages in
`pipeline/job.ts`. If you are adding behaviour, it almost certainly belongs in a
stage rather than in a new entry point.

`Printcraft._internals` is a deliberate compatibility facade: the test suite
reaches through it, so removing or renaming an entry there is a breaking change
even though it is underscore-prefixed.

## Conventions

- **TypeScript, strict.** `strict`, `noUncheckedIndexedAccess`, `noUnusedLocals`
  and `noUnusedParameters` are all on. Do not reach for `any`; if a DOM API needs
  narrowing, narrow it.
- **Zero runtime dependencies.** This is a hard constraint, not a preference.
  Anything added to `dependencies` will be rejected.
- **Comments explain why, not what.** The existing comments are the model: they
  record the reasoning that is not visible in the code.
- **No decorative emoji** in code, docs, or commit messages.

## Tests

The suite runs against `dist/printcraft.umd.js`, not the source. That is
deliberate — it is the artifact consumers actually load, and it is what caught a
literal `</script>` inside a code comment once before.

- Behaviour changes need a test in `test/`.
- Bug fixes go in `test/regressions.test.ts`, one test per bug, named after the
  failure it locks down.
- Anything that needs real layout, real `@page` CSS, or a real canvas belongs in
  `test/e2e/` — jsdom cannot do those.

jsdom has no canvas implementation, so the demo's chart logs errors under jsdom.
That is expected and covered by the e2e suite instead; please do not chase it.

## Pull requests

1. Branch off `main`.
2. Keep the change focused — one concern per PR.
3. Run `npm run typecheck && npm run lint && npm test` before pushing.
4. Update `CHANGELOG.md` under an `## [Unreleased]` heading.
5. Write commit subjects in the imperative mood, 72 characters or fewer, with the
   body explaining _why_.

## Security

Please do not open a public issue for a security problem. See
[SECURITY.md](SECURITY.md) — disclosures go to `opensource@simtabi.com`.
