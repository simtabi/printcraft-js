# Release

Versioning, the publish flow, and the one-time setup a first release needs.

## Versioning

Semantic versioning, with `package.json` as the single source of truth. The
version is injected into the bundle at build time through a Vite `define`, so
`Printcraft.version` can never drift from the package, and a packaging test asserts
they match.

Because the library ships types, a change to the shape of `PrintcraftOptions`
that could break a TypeScript consumer is a minor at minimum, never a patch.

## Cutting a release

1. Update `CHANGELOG.md`: move `## [Unreleased]` entries under a new
   `## [X.Y.Z]` heading with a description.
2. Bump the version:
   ```bash
   npm version minor   # or patch / major
   ```
3. Verify locally:
   ```bash
   npm run typecheck && npm run lint && npm run format:check
   npm test && npm run test:e2e
   npm run lint:pkg && npm run size
   npm pack --dry-run
   ```
4. Push the tag:
   ```bash
   git push origin main --follow-tags
   ```

The `v*` tag triggers `.github/workflows/release.yml`, which builds, publishes to
npm, and creates the GitHub release with the body extracted from that version's
`CHANGELOG.md` section.

## Publishing

Publishing runs from CI through the `npm` GitHub Environment using npm's OIDC
trusted publishing, so there is no `NPM_TOKEN` secret. The workflow requests
`id-token: write`, which is what lets npm verify the release came from this
repository and this workflow, and is what attaches provenance to the published
package.

`prepublishOnly` runs a full build, so a publish can never ship a stale `dist/`.

## What gets published

`files` in `package.json` restricts the tarball to:

```
src/  dist/  README.md  CHANGELOG.md  LICENSE
```

`npm pack --dry-run` is the check. Tests, the demo sources, configs and `docs/`
are not shipped: the docs are hosted, and so is the demo.

## The demo deploy

`.github/workflows/pages.yml` publishes <https://simtabi.github.io/printcraft-js/>
on every push to `main`. It is independent of the release tag: the demo tracks
`main` so a fix is visible immediately, while the package only moves when a
version is cut.

## First-release setup

One-time, before the first `v*` tag can publish:

1. Make the repository public.
2. Create an `npm` GitHub Environment on the repository.
3. Configure the trusted publisher on npmjs for `@simtabi/printcraft`, pointing
   at `simtabi/printcraft-js` and the `release.yml` workflow. The `@simtabi`
   scope must exist before the first publish can succeed.
4. Push the tag.

## Release descriptions

Every release carries a human-readable summary of what changed, sourced from that
version's `CHANGELOG.md` section. The workflow extracts it automatically; a
release with only auto-generated notes is incomplete.

---

[← Docs index](../README.md#documentation)
