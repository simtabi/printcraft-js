# Cover and notes pages

Two sheets that are not the content: the title and description at the front, every mark
listed at the back.

## Why they exist

A title that only reaches the browser's save-as-PDF filename is invisible on the paper. And
a note marked on a paragraph prints as a chip beside it and nowhere else, so somebody
holding twelve printed sheets has no way to see that three of them were annotated, or what
the annotations said.

```js
Printcraft.print({
  target: '#report',
  documentTitle: 'Quarterly production report',
  documentDescription: 'Prepared for the board.',
  coverPage: true,
  notesPage: true,
  printHeading: false
});
```

Both off by default. A receipt wants neither.

## Three ways to show a title

They are different things, and asking for one should not silently give another.

| Option         | Where the words go                           |
| -------------- | -------------------------------------------- |
| `printHeading` | above the content, on sheet one              |
| `coverPage`    | a sheet of its own, at the front             |
| `notesPage`    | repeated at the top of the list, at the back |

An invoice wants a heading. A report wants a cover. All three can be on at once.

## Shaping them

Either option takes `true`, an object, or a function.

```js
Printcraft.print({
  target: '#invoice',
  documentTitle: 'invoice-4417', // still the save-as-PDF filename
  coverPage: {
    title: 'Invoice 4417', // what the paper says
    description: 'Due 30 days from issue.',
    meta: true // true stamps the date; a string prints it
  }
});
```

```js
Printcraft.print({
  target: '#report',
  coverPage: (doc, options) => {
    const el = doc.createElement('div');
    el.innerHTML = '<h1>' + options.documentTitle + '</h1><img src="/logo.svg" alt="">';
    return el;
  }
});
```

A cover with nothing to say is not printed, rather than adding a blank sheet somebody has to
throw away.

## The notes page

Every note, redaction and drawing, numbered, with a pointer back to the element it belongs
to. One element carrying all three is three lines.

```
Quarterly production report
Prepared for the board.

3 MARKS

1. Note       provisional until the audit closes
              p#q3-total · Total output 41,220 units
2. Redacted   content removed from the print copy
              p.contact
3. Drawing    2 arrows, 1 circle
              figure#variance
```

**A redaction's line never carries its content.** Every other line quotes enough of the
element's text to recognise it by; a redacted one gets the structural pointer alone.
Printing the quoted form would put on the last sheet exactly what page two destroyed — the
leak verifier stops the job when it happens, which is how this rule got written.

`notesPage: true` on a document nobody marked prints no sheet at all.

## Paginated jobs

The cover becomes sheet one and the notes sheet is pushed onto the end, both counted in
`{pages}`. Unpaginated jobs use `break-before: page`, which is all a browser can do without
real sheets.

```js
Printcraft.print({
  target: '#report',
  paginate: true,
  pageNumbers: { template: 'Page {page} of {pages}' },
  coverPage: true,
  notesPage: true
});
```

## See also

- [Pagination](pagination.md) — real sheets, numbers, borders and bands
- [Annotations](tools/annotations.md) — note chips beside their elements
- [Drawn annotations](tools/annotate.md) — pen, shapes and text
- [Options](tools/options.md) — every option, grouped by concern

---

[← Docs index](../README.md#documentation)
