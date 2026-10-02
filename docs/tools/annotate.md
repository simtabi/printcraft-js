# Drawn annotations

Pen, highlighter, arrows, boxes, circles and text, drawn on the page and printed with it.

## Opening the tools

Right-click anywhere and choose **Annotate the page…**, press `Ctrl`/`⌘` `Shift` `A`, or:

```js
const studio = await Printcraft.ui.run('annotate');
studio.use('arrow');
studio.undo();
studio.close();
```

Pick a tool, drag on the thing you want to mark. **Pen** opens a small form for colour
and stroke width; `Ctrl`/`⌘` `Z` undoes, `Escape` puts the tools away.

## Why vectors

A canvas overlay would be the easy version and it would be wrong twice over. It prints at
screen resolution onto paper that has four times as much, and it cannot be edited once
drawn. Shapes are `<path>` and `<line>` elements instead: a few hundred bytes, sharp at any
size, and undoable.

It also survives the setting nobody remembers to change. **Background graphics** is off by
default in Chromium's print dialog, and anything built on a CSS background would not print
at all. An `<svg>` is foreground content — the same reason the watermark is an element.

## Where a drawing lives

On the element you started the drag on, in a `data-printcraft-drawing` attribute, exactly
as notes and redactions live on theirs. That is what makes a drawing appear in the notes
panel, reach the notes page, persist with everything else, and print — with none of those
having to know it exists.

Coordinates are fractions of that element's box, from 0 to 1:

```json
{
  "v": 1,
  "shapes": [
    {
      "id": "s1",
      "kind": "ellipse",
      "points": [
        { "x": 0.12, "y": 0.4 },
        { "x": 0.63, "y": 0.78 }
      ],
      "color": "#dc2626",
      "width": 3,
      "opacity": 1
    }
  ]
}
```

So a circle drawn around a total on a 1440px screen is still around that total on a 794px
sheet, and still there after the sidebar collapses. `<html>` is refused as a host: it sits
outside `<body>`, so no target selector could ever reach it and the mark would be made,
stored, and silently missing from the paper.

## The tools

| Tool      | Shape       | Notes                                                  |
| --------- | ----------- | ------------------------------------------------------ |
| Draw      | `pen`       | freehand, smoothed through quadratic segments          |
| Highlight | `highlight` | `mix-blend-mode: multiply`, so the words stay readable |
| Arrow     | `arrow`     | the head is drawn, not markered — see below            |
| Box       | `rect`      |                                                        |
| Circle    | `ellipse`   |                                                        |
| Text      | `text`      | asks for the words, then places them                   |

Strokes carry `vector-effect: non-scaling-stroke`. Without it a 3px line is thin across a
wide element and fat down a tall one, because the overlay's box is stretched unevenly.

Arrow heads are paths rather than `<marker>` elements. A marker needs a uniquely-id'd
`<defs>`, and ids do not survive being cloned into a print document beside another copy of
themselves.

## Working with drawings in code

```js
import { drawings, drawingOn, setDrawing, clearDrawings, openStudio } from '@simtabi/printcraft/ui';

drawings(document); // [{ element, drawing }, …]
drawingOn(el).shapes.length;
setDrawing(el, { v: 1, shapes: [] }); // empty removes the overlay and the attribute
clearDrawings(document); // returns how many elements had one
```

```js
const studio = openStudio(
  { document, window },
  {
    scope: '#report', // only inside this element
    tool: 'highlight',
    color: '#15803d',
    onChange: (el, drawing) => save(el, drawing)
  }
);
```

## Printing

The overlay is rebuilt inside the print copy rather than cloned. The live one carries
`data-prjs-ui`, which the interface strips from anything it hands on, so a screenshot of the
page would otherwise contain the drawing twice.

```js
Printcraft.print({ target: '#report', notesPage: true });
```

Drawings appear in the list on the notes page like any other mark.

## Events

```js
Printcraft.on('ui:draw', ({ opened, element, shapes }) => {});
```

## See also

- [Memory](memory.md) — how drawings survive a reload
- [Pages](../pages.md) — the notes page that lists them
- [Redaction](redaction.md) — the other kind of mark, and the one with rules

---

[← Docs index](../../README.md#documentation)
