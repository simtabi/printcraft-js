# The proof sheet

The assembled document, on screen, before anything reaches the printer.

## Why it exists

Until now the flow was: choose what to print, and it printed. The document was
built in a frame nobody saw and handed straight to the browser's dialog, so the
first sight of the result was on paper — and by then a wrong margin, a missing
note, or a page break through the middle of a table has already cost somebody a
sheet.

```
choose what to print   →   the proof sheet   →   print
  region, sections,          annotate it,          the browser dialog,
  element, page              or think better       or a backend
                             of it
```

## What makes it trustworthy

It is not a rendering that resembles the output. The stage mounts the document
itself, from the same `assemblePrintDocument` and `paginate` a real job runs, and
pressing **Print** continues _that job_ rather than starting a second one.

So "what you looked at is what prints" is true by construction rather than by
promise. There is a test that asserts exactly this: the proof's page count is the
job's page count, and the record that resolves is the record the proof was
showing.

## Opening it

```js
await Printcraft.proof({ target: '#report', paginate: true });
Printcraft.print({ target: '#report', proof: true }); // the same thing
```

Right-click, the command palette, the keyboard and the demo's buttons all go
through it. **`Printcraft.print()` called from code does not** — an unattended
job must not sit waiting for somebody who is not there. Pass `proof: true` when a
person is present.

Turn it off for a surface by putting `proof: false` in that interface's base
options:

```js
Printcraft.ui.create({ base: { proof: false } });
```

## What is on it

|               |                                                                                           |
| ------------- | ----------------------------------------------------------------------------------------- |
| **Page rail** | one tab per sheet; click to jump. Hidden when there is one sheet or the browser flowed it |
| **Zoom**      | a sheet at 100% does not fit a laptop, and one that fits is too small to read             |
| **Annotate**  | opens the drawing studio _against the proof's own document_                               |
| **Cancel**    | closes it; the job resolves `cancelled` and nothing prints                                |
| **Print**     | continues the job                                                                         |

`⌘P` inside the proof means "print this", not "open the browser's dialog over the
top of it". Escape cancels.

## Annotating the proof

`openStudio` takes an `Env`, so it is handed the frame's `{ document, window }`
and works unchanged. A mark made there is written straight back to the page
element it came from, which is the only reason the settings panel can exist.

The link is `data-prjs-id`. The pipeline already writes it on the source element
and the clone inherits it — it exists to correlate a measurement with the node it
measured, and is normally swept up at the end of the job. The proof holds it open
and tags the whole subtree rather than only the handful of elements with
something to measure. It is swept when the panel closes: leaving it on a live DOM
is litter, and a later job measuring the same tree would find stale numbers.

A part of the sheet the pipeline _generated_ rather than cloned — a page number,
a cover sheet — has nothing behind it, so a mark there has nowhere to live once
the sheet is rebuilt. The studio says so rather than losing it quietly.

## Changing the sheet while looking at it

**Settings** offers the options that change what the paper looks like: paper size,
orientation, margin, pagination, page numbers, and the cover and notes sheets.
Not a target selector or an asset timeout — by the time there is a sheet on
screen, those have already run.

Applying rebuilds. The panel goes, the pipeline runs again with the changed
options, and a fresh proof takes its place — **with every annotation still on
it**, because the marks are on the page rather than on the copy.

The job you started resolves `cancelled`, and the rebuild is a new one. That is
the honest description of what happened: the sheet you asked for is not the sheet
you printed.

It is deliberately its own small form rather than the print-settings dialog. That
one ends in Print and Preview, and both are wrong here — the proof _is_ the
preview, and its own Print button is six inches away.

`Printcraft.inspect()` opens the same panel to look at rather than to decide, so
it offers no Settings: rebuilding would start a job its caller is not waiting on.

## See also

- [Pagination](pagination.md) — the sheets the rail counts
- [Drawn annotations](tools/annotate.md) — the studio the Annotate button opens
- [Architecture](architecture.md) — where the mount sits in the pipeline

---

[← Docs index](../README.md#documentation)
