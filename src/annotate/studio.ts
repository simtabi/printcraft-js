// Drawing on the page.
//
// The interaction other annotation tools have settled on: pick a tool, drag on
// the thing you want to mark, undo what you did not mean. The drawing belongs to
// whichever element you started on, so it moves with that element and prints
// with it, rather than floating at a page coordinate that stops meaning anything
// the moment the layout changes.

import {
  DEFAULTS,
  isTwoPoint,
  parse,
  serialise,
  shapeId,
  simplify,
  toFraction,
  type Drawing,
  type Point,
  type Shape,
  type ShapeKind
} from './model';
import { chooseImage, imageFrom, placeAt, prepareImage } from './image';
import { mountOverlay, overlayNode, unmountOverlay } from './render';
import { NS } from '../support';
import {
  modal,
  modalOpenOn,
  openToolbar,
  toast,
  type ToolbarChip,
  type ToolbarHandle
} from '../ui/kit';
import type { Env } from '../types';

const DRAW_ATTR = 'data-' + NS + '-drawing';

export interface StudioOptions {
  /** where drawing is allowed. the whole document by default. */
  scope?: string | Element | null;
  /** the tool it opens with */
  tool?: ShapeKind;
  color?: string;
  width?: number;
  /** told when a drawing is committed, so a session can save it */
  onChange?: (el: Element, drawing: Drawing) => void;
}

export interface StudioHandle {
  /** switches tool */
  use(tool: ShapeKind): void;
  undo(): void;
  redo(): void;
  /** stops drawing and takes the toolbar down */
  close(): void;
  readonly isOpen: boolean;
}

interface Step {
  el: HTMLElement;
  shape: Shape;
}

const TOOLS: Array<{ id: ShapeKind; label: string; icon: string }> = [
  { id: 'pen', label: 'Draw', icon: 'draw' },
  { id: 'highlight', label: 'Highlight', icon: 'highlight' },
  { id: 'arrow', label: 'Arrow', icon: 'arrow' },
  { id: 'rect', label: 'Box', icon: 'square' },
  { id: 'ellipse', label: 'Circle', icon: 'circle' },
  { id: 'text', label: 'Text', icon: 'text' }
];

/**
 * The colours the toolbar cycles through.
 *
 * Six, not a picker. A colour wheel on an annotation toolbar is a decision
 * nobody wants to make mid-sentence, and these are chosen to stay legible on
 * white paper and to survive being printed in greyscale, where they separate by
 * lightness rather than hue.
 */
const COLOURS = [
  { name: 'red', value: '#dc2626' },
  { name: 'amber', value: '#d97706' },
  { name: 'green', value: '#15803d' },
  { name: 'blue', value: '#1d4ed8' },
  { name: 'violet', value: '#7c3aed' },
  { name: 'black', value: '#111827' }
] as const;

/** The drawing already on an element. */
export function drawingOn(el: Element): Drawing {
  return parse(el.getAttribute(DRAW_ATTR));
}

/** Writes a drawing onto an element, and repaints it. Empty removes both. */
export function setDrawing(el: HTMLElement, drawing: Drawing): void {
  if (!drawing.shapes.length) {
    el.removeAttribute(DRAW_ATTR);
    unmountOverlay(el);
    return;
  }
  el.setAttribute(DRAW_ATTR, serialise(drawing));
  mountOverlay(el, drawing);
}

/** Every element on the page carrying a drawing. */
export function drawings(doc: Document): Array<{ element: Element; drawing: Drawing }> {
  return [...doc.querySelectorAll('[' + DRAW_ATTR + ']')].map((element) => ({
    element,
    drawing: drawingOn(element)
  }));
}

/** Paints every stored drawing. Called after a restore, and on demand. */
export function repaintAll(doc: Document): number {
  const all = drawings(doc);
  for (const { element, drawing } of all) mountOverlay(element as HTMLElement, drawing);
  return all.length;
}

/**
 * Opens the drawing tools.
 *
 * One pointer capture on the document rather than a listener per element:
 * the target is decided when the drag starts, from what is under the pointer,
 * which is both fewer listeners and the only way to draw on something that was
 * added to the page after the studio opened.
 */
export function openStudio(env: Env, options: StudioOptions = {}): StudioHandle {
  const doc = env.document;
  const win = env.window;

  let tool: ShapeKind = options.tool || 'pen';
  let color = options.color || DEFAULTS.color;
  let width = options.width || DEFAULTS.width;
  let open = true;

  const done: Step[] = [];
  const undone: Step[] = [];

  /* the drag in progress ------------------------------------------------- */

  let host: HTMLElement | null = null;
  let box: DOMRect | null = null;
  let points: Point[] = [];
  let preview: SVGSVGElement | null = null;
  let penPressure = false;
  /** the last element drawn on, so a paste knows where to land */
  let lastHost: HTMLElement | null = null;

  const inScope = (el: Element): boolean => {
    // our own surfaces, and the colour picker, which Coloris mounts on <body>
    // without our marker and which needs its own mouse events
    if (el.closest('[data-prjs-ui], .clr-picker')) return false;

    // `<html>` is the one host a drawing can never be printed from: it sits
    // outside `<body>`, so no target selector reaches it and the mark would be
    // made, stored, and then silently missing from the paper. A pointer landing
    // on the page background targets it, which is easier to do than it sounds.
    if (el === doc.documentElement) return false;

    const scope = options.scope;
    if (!scope) return true;
    const root = typeof scope === 'string' ? doc.querySelector(scope) : scope;
    return !!root && root.contains(el);
  };

  /** What is being drawn right now, over the committed shapes. */
  const paintPreview = (): void => {
    if (!host) return;
    const shape: Shape = {
      id: 'preview',
      kind: tool,
      points: isTwoPoint(tool) ? [points[0]!, points[points.length - 1]!] : points,
      color,
      width,
      opacity: tool === 'highlight' ? 0.4 : 1,
      ...(tool === 'text' ? { text: '', size: DEFAULTS.size } : {})
    };

    preview?.remove();
    preview = overlayNode(doc, { v: 1, shapes: [...drawingOn(host).shapes, shape] });
    preview.setAttribute('data-prjs-preview', '');
    host.appendChild(preview);
  };

  const start = (ev: PointerEvent): void => {
    if (!open || ev.button !== 0) return;
    const target = ev.target as Element | null;
    if (!target || target.nodeType !== 1 || !inScope(target)) return;

    host = target as HTMLElement;
    lastHost = host;
    box = host.getBoundingClientRect();
    if (!box.width || !box.height) {
      host = null;
      return;
    }

    // an element with no room to draw on is never what was meant
    // marked the way mountOverlay marks it, so taking the overlay off (or a
    // click that drew nothing) puts the element back as it was found
    if (win.getComputedStyle(host).position === 'static') {
      if (!host.hasAttribute('data-prjs-was-static')) host.setAttribute('data-prjs-was-static', '');
      host.style.position = 'relative';
    }

    // a pen reports a pressure that changes; a mouse reports a flat 0.5 and a
    // finger usually 0 or 1. only a real pen's is worth storing.
    penPressure = ev.pointerType === 'pen';
    points = [toFraction(ev.clientX, ev.clientY, box, penPressure ? ev.pressure : undefined)];
    ev.preventDefault();
    paintPreview();
  };

  const move = (ev: PointerEvent): void => {
    if (!host || !box) return;

    // every position the browser coalesced, not just the one it delivered. a
    // fast stroke arrives as one event carrying eight moves, and drawing only
    // the last of them is how a quick line comes out as a straight one.
    const batch = typeof ev.getCoalescedEvents === 'function' ? ev.getCoalescedEvents() : [ev];
    for (const point of batch.length ? batch : [ev]) {
      points.push(
        toFraction(point.clientX, point.clientY, box, penPressure ? point.pressure : undefined)
      );
    }
    paintPreview();
  };

  const finish = (ev: PointerEvent): void => {
    if (!host || !box) return;
    const el = host;
    points.push(toFraction(ev.clientX, ev.clientY, box, penPressure ? ev.pressure : undefined));

    preview?.remove();
    preview = null;
    host = null;
    box = null;

    const path = isTwoPoint(tool) ? [points[0]!, points[points.length - 1]!] : simplify(points);
    const dragged =
      Math.abs(path[path.length - 1]!.x - path[0]!.x) > 0.004 ||
      Math.abs(path[path.length - 1]!.y - path[0]!.y) > 0.004;

    // a click that never moved is not a shape. for text it is where the text
    // goes, so that one is allowed through.
    if (!dragged && tool !== 'text') {
      unmountOverlay(el);
      mountOverlay(el, drawingOn(el));
      return;
    }

    if (tool === 'text') {
      void askForText(el, path[0]!, { color, width, size: DEFAULTS.size }, env).then((shape) => {
        if (shape) commit(el, shape);
      });
      return;
    }

    commit(el, {
      id: shapeId(),
      kind: tool,
      points: path,
      color,
      width,
      opacity: tool === 'highlight' ? 0.4 : 1
    });
  };

  /**
   * The browser took the pointer back — a touch that turned into a scroll, a
   * pen leaving range. Nothing is drawn, and the preview does not linger.
   */
  const abandon = (): void => {
    if (!host) return;
    const el = host;
    preview?.remove();
    preview = null;
    host = null;
    box = null;
    unmountOverlay(el);
    mountOverlay(el, drawingOn(el));
  };

  const commit = (el: HTMLElement, shape: Shape): void => {
    const drawing = drawingOn(el);
    drawing.shapes.push(shape);
    setDrawing(el, drawing);
    done.push({ el, shape });
    undone.length = 0;
    options.onChange?.(el, drawing);
    bar?.setStatus(label());
  };

  /* the toolbar ---------------------------------------------------------- */

  /**
   * The status line, as chips.
   *
   * It was one run-on string — `Box · red · 3px · 2 marks` — which is four facts
   * a reader has to parse apart. The colour is a swatch now rather than a word,
   * which is the one of the four you actually need to see.
   */
  const label = (): ToolbarChip[] => {
    const name = TOOLS.find((t) => t.id === tool)?.label || tool;
    const chips: ToolbarChip[] = [
      { label: name, tone: 'primary' },
      { label: width + 'px', swatch: color }
    ];
    if (done.length) chips.push({ label: done.length + (done.length === 1 ? ' mark' : ' marks') });
    return chips;
  };

  let bar: ToolbarHandle | null = null;

  /**
   * The pen's settings, as a form.
   *
   * These were two buttons that cycled blindly through six colours and four
   * widths — you pressed one and watched a word change, with no way to see what
   * you were choosing or to pick anything not on the list. A form shows both,
   * takes any colour including its opacity, and validates what is typed.
   */
  const openSettings = async (): Promise<void> => {
    const result = await modal(
      {
        title: 'Pen',
        description: 'Used by every tool until you change it again',
        icon: 'draw',
        size: 'sm',
        fields: [
          {
            type: 'color',
            name: 'color',
            label: 'Colour',
            value: color,
            swatches: COLOURS.map((c) => c.value),
            hint: 'Opacity is part of the colour; a highlighter is one at about 40%'
          },
          {
            type: 'range',
            name: 'width',
            label: 'Stroke',
            min: 1,
            max: 24,
            step: 1,
            value: width,
            unit: 'px'
          }
        ],
        actions: [
          { id: 'cancel', label: 'Cancel', tone: 'ghost' },
          { id: 'save', label: 'Use it', tone: 'primary', validates: true }
        ]
      },
      env
    );

    if (result.action !== 'save') return;
    if (typeof result.values['color'] === 'string' && result.values['color'].trim()) {
      color = result.values['color'].trim();
    }
    const next = Number(result.values['width']);
    if (Number.isFinite(next) && next > 0) width = next;
    bar?.setStatus(label());
  };

  const handle: StudioHandle = {
    get isOpen() {
      return open;
    },

    use(next: ShapeKind): void {
      // pressed state, so a screen reader hears which tool is in use
      bar?.setActive(tool, false);
      bar?.setActive(next, true);
      tool = next;
      bar?.setStatus(label());
    },

    undo(): void {
      const step = done.pop();
      if (!step) return;
      const drawing = drawingOn(step.el);
      drawing.shapes = drawing.shapes.filter((s) => s.id !== step.shape.id);
      setDrawing(step.el, drawing);
      undone.push(step);
      options.onChange?.(step.el, drawing);
      bar?.setStatus(label());
    },

    redo(): void {
      const step = undone.pop();
      if (!step) return;
      const drawing = drawingOn(step.el);
      drawing.shapes.push(step.shape);
      setDrawing(step.el, drawing);
      done.push(step);
      options.onChange?.(step.el, drawing);
      bar?.setStatus(label());
    },

    close(): void {
      if (!open) return;
      open = false;
      preview?.remove();
      doc.removeEventListener('pointerdown', start, true);
      doc.removeEventListener('pointermove', move, true);
      doc.removeEventListener('pointerup', finish, true);
      doc.removeEventListener('pointercancel', abandon, true);
      doc.removeEventListener('keydown', onKey, true);
      doc.removeEventListener('paste', onPaste, true);
      doc.removeEventListener('drop', onDrop, true);
      doc.removeEventListener('dragover', onDragOver, true);
      bar?.close();
    }
  };

  /**
   * Turns a file into a shape on whichever element the pointer last touched.
   *
   * `lastHost` rather than the pointer's current target, because a paste has no
   * position and a click on the toolbar would otherwise put the picture on the
   * toolbar.
   */
  const placeImage = async (file: Blob, at?: { x: number; y: number }): Promise<void> => {
    const el = lastHost || (doc.body as HTMLElement);
    if (!el) return;

    try {
      const image = await prepareImage(file, doc);
      const hostBox = el.getBoundingClientRect();
      const where = at || { x: 0.5, y: 0.5 };
      const [from, to] = placeAt(where, image, { width: hostBox.width, height: hostBox.height });

      commit(el, {
        id: shapeId(),
        kind: 'image',
        points: [from, to],
        color,
        width,
        opacity: 1,
        href: image.href
      });

      if (image.resampled) {
        toast({ message: 'Image added, scaled down to fit', tone: 'default' }, env);
      } else {
        toast({ message: 'Image added', tone: 'success' }, env);
      }
    } catch (e) {
      toast(
        { message: (e as Error).message || 'That image could not be used', tone: 'danger' },
        env
      );
    }
  };

  const pickImage = async (): Promise<void> => {
    const file = await chooseImage(doc);
    if (file) await placeImage(file);
  };

  const onPaste = (ev: Event): void => {
    const file = imageFrom((ev as ClipboardEvent).clipboardData);
    if (!file) return;
    ev.preventDefault();
    void placeImage(file);
  };

  const onDrop = (ev: Event): void => {
    const drag = ev as DragEvent;
    const file = imageFrom(drag.dataTransfer);
    if (!file) return;
    ev.preventDefault();

    const target = drag.target as Element | null;
    if (target && target.nodeType === 1 && inScope(target)) lastHost = target as HTMLElement;

    const onto = lastHost?.getBoundingClientRect();
    void placeImage(
      file,
      onto && onto.width && onto.height
        ? { x: (drag.clientX - onto.left) / onto.width, y: (drag.clientY - onto.top) / onto.height }
        : undefined
    );
  };

  const onDragOver = (ev: Event): void => {
    if ((ev as DragEvent).dataTransfer?.types?.includes('Files')) ev.preventDefault();
  };

  const onKey = (ev: Event): void => {
    // the Pen and Text dialogs open over the studio, and Escape or Ctrl+Z there
    // belongs to the dialog and its text field
    if (modalOpenOn(doc)) return;
    const e = ev as KeyboardEvent;
    if (e.key === 'Escape') {
      e.preventDefault();
      handle.close();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) handle.redo();
      else handle.undo();
    }
  };

  doc.addEventListener('pointerdown', start, true);
  doc.addEventListener('pointermove', move, true);
  doc.addEventListener('pointerup', finish, true);
  doc.addEventListener('pointercancel', abandon, true);
  doc.addEventListener('keydown', onKey, true);
  doc.addEventListener('paste', onPaste, true);
  doc.addEventListener('drop', onDrop, true);
  doc.addEventListener('dragover', onDragOver, true);

  bar = openToolbar(
    {
      label: 'Annotating',
      status: label(),
      actions: [
        ...TOOLS.map((t) => ({
          id: t.id,
          label: t.label,
          icon: t.icon,
          active: t.id === tool,
          onSelect: () => handle.use(t.id)
        })),
        { id: 'image', label: 'Image', icon: 'image', onSelect: () => void pickImage() },
        { id: 'style', label: 'Pen', icon: 'settings', onSelect: () => void openSettings() },
        { id: 'undo', label: 'Undo', icon: 'undo', onSelect: () => handle.undo() },
        {
          id: 'done',
          label: 'Done',
          icon: 'check',
          tone: 'primary',
          onSelect: () => handle.close()
        }
      ]
    },
    env
  );

  return handle;
}

/** Asks for the words, then makes a text shape out of them. */
async function askForText(
  el: HTMLElement,
  at: Point,
  style: { color: string; width: number; size: number },
  env: Env
): Promise<Shape | null> {
  const { promptFor } = await import('../ui/kit');
  const text = await promptFor(
    {
      title: 'Text annotation',
      label: 'Text',
      hint: 'Drawn on the page, and printed with it.',
      placeholder: 'provisional until audit'
    },
    env
  );

  if (!text) {
    // nothing was typed, so put the element back the way it was found
    if (!drawingOn(el).shapes.length) unmountOverlay(el);
    return null;
  }
  toast({ message: 'Text added', tone: 'success' }, env);
  return {
    id: shapeId(),
    kind: 'text',
    points: [at],
    color: style.color,
    width: style.width,
    opacity: 1,
    text,
    size: style.size
  };
}

/** Removes every drawing on the page. Returns how many elements had one. */
export function clearDrawings(doc: Document): number {
  const all = drawings(doc);
  for (const { element } of all) {
    element.removeAttribute(DRAW_ATTR);
    unmountOverlay(element as HTMLElement);
  }
  return all.length;
}
