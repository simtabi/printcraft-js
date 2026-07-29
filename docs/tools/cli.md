# The command line

Render a page the way the library would, from a terminal or a CI job.

## Install

```bash
npm install -D @simtabi/printcraft playwright
npx playwright install chromium
```

Playwright is an optional peer, so a browser user importing the library never downloads a browser. The CLI loads it on demand and, when it is missing, says exactly what to install rather than failing with a module-resolution error.

```bash
npx printcraft --help
```

## `print`

```bash
printcraft print <url|file> --pdf out.pdf
```

Loads the page in Chromium, runs the same pipeline a browser user gets (clone, exclude, redact, sanitise, paginate) and writes the result out. Nothing here re-implements any of it, which is why the output matches what the page would have printed.

| Flag                        | What it does                                                 |
| --------------------------- | ------------------------------------------------------------ |
| `--pdf <file>`              | Write a pdf                                                  |
| `--png <file>`              | Write a full-page png                                        |
| `--html <file>`             | Write the assembled print document                           |
| `-t, --target <selector>`   | What to print. The whole page by default.                    |
| `--page-size <size>`        | `A4`, `Letter`, `A4 landscape`, or an explicit size          |
| `-m, --margin <length>`     | Page margin                                                  |
| `--paginate`                | Lay the content out as real sheets                           |
| `--page-numbers`            | Number them; implies `--paginate`                            |
| `-w, --watermark <text>`    | Mark every page                                              |
| `-r, --redact <selectors>`  | Destroy these, comma-separated                               |
| `-x, --exclude <selectors>` | Leave these out                                              |
| `--privacy`                 | Blank emails, phones, SSNs and card numbers                  |
| `-c, --config <file>`       | Read defaults from a config file                             |
| `--viewport <w>x<h>`        | The layout width the page renders at. `1280x900` by default. |

At least one of `--pdf`, `--png` or `--html` is required: a render with nowhere to go is refused before a browser opens.

```bash
printcraft print report.html \
  --target "#report" \
  --paginate --page-numbers \
  --watermark CONFIDENTIAL \
  --redact ".ssn,.account" --privacy \
  --margin 12mm \
  --pdf report.pdf
```

```
printcraft print  file:///home/you/report.html

  ✓ load            838ms
  ✓ render           52ms  4 sheets, 6 redactions
  ✓ write            73ms  1 file

  /home/you/report.pdf  40 kB
```

`--viewport` matters more than it looks. Media queries resolve against it, so a page rendered at `375x812` prints its mobile layout. It is the one setting that changes what the content _is_ rather than how it is laid on paper.

## `doctor`

```bash
printcraft doctor report.html
```

Three questions, which are the ones that come up when a print is wrong and nobody can see why: what would print, what would leak, and what did not load.

```
printcraft doctor  file:///home/you/report.html

  What would print
    sheets      browser-flowed
    elements    15
    characters  232
    images      0
    size        2 kB

  What would leak
  ✗ 1 email address
  ✗ 3 phone numbers
  ✗ 1 social security number
  ✗ 1 card number

    Add --privacy, or name them with --redact.

  What did not load
  ✓ everything resolved
```

| Exit code | Meaning                              |
| --------- | ------------------------------------ |
| `0`       | Nothing matched the privacy patterns |
| `1`       | The check could not run              |
| `2`       | Something would leak                 |

The non-zero exit on a leak is what makes this useful in CI: a build can fail when a template starts printing something it should not.

```yaml
- run: npx printcraft doctor dist/invoice.html --redact ".account-number"
```

It takes the same flags `print` does, so you can check the configuration you actually ship.

## `init`

```bash
printcraft init
```

Writes a `printcraft.config.json` to start from. `--out` puts it somewhere else, `--force` overwrites an existing one. Without it, an existing file is left alone and the command exits `1`.

The same file works in both places:

```js
Printcraft.loadConfig('/printcraft.config.json');
```

```bash
printcraft print page.html --config printcraft.config.json
```

## Output

Colour is on when stdout is a terminal and off otherwise, so a CI log or a pipe gets plain text. `NO_COLOR=1` turns it off explicitly; `FORCE_COLOR=1` turns it on.

Failures name what caused them, and a mistyped flag suggests the one that was meant:

```
Unknown option --pdff. Did you mean --pdf?

printcraft print --help  for the full list
```

## See also

- [Options](options.md) — every option the config file accepts
- [Redaction](redaction.md) — what `--redact` destroys, and how it is verified
- [Pagination](../pagination.md) — what `--paginate` changes

---

[← Docs index](../../README.md#documentation)
