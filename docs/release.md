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

### npm or GitHub Packages

This repository was created after 2026-07-15, so GitHub issues it immutable OIDC subjects, which npm's trusted
publishing does not accept yet ([npm/cli#9969](https://github.com/npm/cli/issues/9969)): the token exchange
succeeds and the upload is refused with `403 OIDC permission denied`. `release.yml` therefore publishes three
ways. A tag push goes to the registry the repository variable `PUBLISH_REGISTRY` names (`npm` when unset):

| Route                                  | Credential                                                                           | Provenance |
| -------------------------------------- | ------------------------------------------------------------------------------------ | ---------- |
| npm, trusted publishing                | the job's OIDC token                                                                 | yes        |
| npm, `NPM_TOKEN` secret set            | a granular npm token; the OIDC variables are hidden from npm, which tries them first | no         |
| GitHub Packages (`npm.pkg.github.com`) | the run's own `GITHUB_TOKEN`                                                         | no         |

One command publishes every release tag that is not out yet, oldest first, to either registry:

```bash
.dev/tools/npm-release github        # GitHub Packages; needs no npm token
.dev/tools/npm-release npm           # npm, with a granular token (npm_…) on the clipboard
.dev/tools/npm-release               # npm if the clipboard holds a token npm accepts, GitHub Packages otherwise
```

`--dry-run` changes nothing, `--keep-token` uses the `NPM_TOKEN` secret already set, and naming tags
(`v3.0.0`) publishes only those; `--help` lists the rest. It needs `gh` signed in as a maintainer. A version a
registry already has is reported, not failed, so running it again is safe; a hand-started run never touches
the tag's GitHub release.

GitHub Packages asks for authentication even to install a public package. A project installing from it adds
`@simtabi:registry=https://npm.pkg.github.com` and `//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}` to its
`.npmrc`, with a token that has `read:packages`.

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
