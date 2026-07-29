// Selecting an area of the page to print.
//
// Draw a box, then move it, resize it from any of eight handles, and only when
// you confirm does anything happen. Nothing is captured on mouse-up, because a
// selection you cannot adjust is one you have to get right first time.
//
// The confirm step shows what will actually print and takes an optional title
// and description.

import { h as node, modal, openToolbar, toast, type ToolbarHandle } from './kit';
import { computeRect } from './annotations';
import { defaultEnv, el, Z, type UiDeps } from './shared';
import type { ClipRect, Env, InspectController, JobRecord, PrintcraftOptions } from '../types';

export interface DrawResult {
  action: 'cancel';
}

export interface DrawOptions extends PrintcraftOptions {
  /** ask for a title and description before printing. on by default. */
  describe?: boolean;
  /** smallest selection worth printing, in css pixels */
  minSize?: number;
}

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

const CURSORS: Record<Handle, string> = {
  nw: 'nwse-resize',
  n: 'ns-resize',
  ne: 'nesw-resize',
  e: 'ew-resize',
  se: 'nwse-resize',
  s: 'ns-resize',
  sw: 'nesw-resize',
  w: 'ew-resize'
};

/** where each handle sits inside the box, as a fraction of its size */
const ANCHORS: Record<Handle, [number, number]> = {
  nw: [0, 0],
  n: [0.5, 0],
  ne: [1, 0],
  e: [1, 0.5],
  se: [1, 1],
  s: [0.5, 1],
  sw: [0, 1],
  w: [0, 0.5]
};

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MM_PER_PX = 25.4 / 96;

const mm = (px: number): number => Math.round(px * MM_PER_PX);

/**
 * Opens the selection overlay. Resolves with the print job once confirmed, or
 * `{ action: 'cancel' }` if dismissed.
 */
export function drawArea(
  deps: UiDeps,
  base?: DrawOptions,
  env?: Env
): Promise<JobRecord | InspectController | DrawResult> {
  const scope = env || defaultEnv();
  const doc = scope.document;
  const win = scope.window;
  const opts: DrawOptions = base || {};
  const minSize = opts.minSize ?? 16;

  return new Promise((resolve) => {
    let box: Box | null = null;
    let mode: 'idle' | 'drawing' | 'moving' | 'resizing' = 'idle';
    let activeHandle: Handle | null = null;
    let origin = { x: 0, y: 0 };
    let startBox: Box = { x: 0, y: 0, w: 0, h: 0 };
    let bar: ToolbarHandle;
    let settled = false;

    /* the overlay ------------------------------------------------------- */

    const layer = el(
      doc,
      'div',
      'position:fixed;inset:0;z-index:' + Z + ';cursor:crosshair;touch-action:none;'
    );
    layer.setAttribute('data-pc-draw', '');

    // four panels dim everything outside the selection, so the chosen area reads
    // as a hole cut in the page rather than a rectangle drawn on top of it
    const shades = [0, 1, 2, 3].map(() =>
      el(doc, 'div', 'position:fixed;background:rgba(20,20,24,.55);pointer-events:none;')
    );
    shades.forEach((s) => layer.appendChild(s));

    const frame = el(
      doc,
      'div',
      'position:fixed;display:none;border:1px solid #fff;' +
        'box-shadow:0 0 0 1px rgba(0,0,0,.5);cursor:move;'
    );
    frame.setAttribute('data-pc-region', '');
    layer.appendChild(frame);

    const grips = new Map<Handle, HTMLElement>();
    for (const name of HANDLES) {
      const grip = el(
        doc,
        'div',
        'position:fixed;display:none;width:12px;height:12px;background:#fff;' +
          'box-shadow:0 0 0 1px rgba(0,0,0,.55);cursor:' +
          CURSORS[name] +
          ';'
      );
      grip.setAttribute('data-pc-handle', name);
      grips.set(name, grip);
      layer.appendChild(grip);
    }

    const readout = el(
      doc,
      'div',
      'position:fixed;display:none;background:#17181b;color:#fff;padding:3px 8px;' +
        'border-radius:4px;font:12px/1.4 ui-monospace,Consolas,Menlo,monospace;' +
        'pointer-events:none;white-space:nowrap;'
    );
    readout.setAttribute('data-pc-dims', '');
    layer.appendChild(readout);

    doc.body.appendChild(layer);

    /* painting ---------------------------------------------------------- */

    function paint(): void {
      if (!box) {
        frame.style.display = 'none';
        readout.style.display = 'none';
        grips.forEach((g) => (g.style.display = 'none'));
        shades.forEach((s) => (s.style.display = 'none'));
        bar?.setDisabled('print', true);
        return;
      }

      const { x, y, w, h } = box;
      frame.style.display = 'block';
      frame.style.left = x + 'px';
      frame.style.top = y + 'px';
      frame.style.width = w + 'px';
      frame.style.height = h + 'px';

      const vw = win.innerWidth;
      const vh = win.innerHeight;
      const rects = [
        { left: 0, top: 0, width: vw, height: y },
        { left: x + w, top: y, width: Math.max(0, vw - x - w), height: h },
        { left: 0, top: y + h, width: vw, height: Math.max(0, vh - y - h) },
        { left: 0, top: y, width: x, height: h }
      ];
      shades.forEach((shade, i) => {
        const r = rects[i]!;
        shade.style.display = 'block';
        shade.style.left = r.left + 'px';
        shade.style.top = r.top + 'px';
        shade.style.width = r.width + 'px';
        shade.style.height = r.height + 'px';
      });

      for (const [name, grip] of grips) {
        const [fx, fy] = ANCHORS[name];
        grip.style.display = 'block';
        grip.style.left = x + w * fx - 6 + 'px';
        grip.style.top = y + h * fy - 6 + 'px';
      }

      readout.style.display = 'block';
      readout.style.left = x + 'px';
      readout.style.top = (y > 34 ? y - 28 : y + h + 8) + 'px';
      readout.textContent =
        Math.round(w) + ' × ' + Math.round(h) + ' px · ' + mm(w) + ' × ' + mm(h) + ' mm';

      const usable = w >= minSize && h >= minSize;
      bar?.setDisabled('print', !usable);
      bar?.setStatus(usable ? 'Drag to move, handles to resize' : 'Too small to print');
    }

    function clampToViewport(next: Box): Box {
      const vw = win.innerWidth;
      const vh = win.innerHeight;
      const w = Math.max(1, Math.min(next.w, vw));
      const h = Math.max(1, Math.min(next.h, vh));
      return {
        w,
        h,
        x: Math.max(0, Math.min(next.x, vw - w)),
        y: Math.max(0, Math.min(next.y, vh - h))
      };
    }

    /* pointer ----------------------------------------------------------- */

    function onPointerDown(ev: PointerEvent): void {
      const target = ev.target as HTMLElement;
      const handle = target.getAttribute('data-pc-handle') as Handle | null;
      origin = { x: ev.clientX, y: ev.clientY };

      if (handle && box) {
        mode = 'resizing';
        activeHandle = handle;
        startBox = { ...box };
      } else if (box && target === frame) {
        mode = 'moving';
        startBox = { ...box };
      } else {
        mode = 'drawing';
        box = { x: ev.clientX, y: ev.clientY, w: 0, h: 0 };
      }

      try {
        layer.setPointerCapture(ev.pointerId);
      } catch {
        /* synthetic events in tests have no real pointer */
      }
      ev.preventDefault();
      paint();
    }

    function onPointerMove(ev: PointerEvent): void {
      if (mode === 'idle') return;
      const dx = ev.clientX - origin.x;
      const dy = ev.clientY - origin.y;

      if (mode === 'drawing') {
        box = {
          x: Math.min(origin.x, ev.clientX),
          y: Math.min(origin.y, ev.clientY),
          w: Math.abs(dx),
          h: Math.abs(dy)
        };
      } else if (mode === 'moving') {
        box = clampToViewport({ ...startBox, x: startBox.x + dx, y: startBox.y + dy });
      } else if (mode === 'resizing' && activeHandle) {
        box = resize(startBox, activeHandle, dx, dy);
      }
      paint();
    }

    function onPointerUp(ev: PointerEvent): void {
      if (mode === 'idle') return;
      mode = 'idle';
      activeHandle = null;
      try {
        layer.releasePointerCapture(ev.pointerId);
      } catch {
        /* the pointer may already be gone */
      }
      // deliberately not printing here: the selection is now editable, and only
      // the toolbar commits it
      paint();
    }

    function resize(from: Box, handle: Handle, dx: number, dy: number): Box {
      let left = from.x;
      let top = from.y;
      let width = from.w;
      let height = from.h;

      if (handle.includes('w')) {
        left = from.x + dx;
        width = from.w - dx;
      }
      if (handle.includes('e')) width = from.w + dx;
      if (handle.includes('n')) {
        top = from.y + dy;
        height = from.h - dy;
      }
      if (handle.includes('s')) height = from.h + dy;

      // dragging past the opposite edge flips the box rather than inverting it
      if (width < 0) {
        left += width;
        width = -width;
      }
      if (height < 0) {
        top += height;
        height = -height;
      }
      return clampToViewport({ x: left, y: top, w: width, h: height });
    }

    /* keyboard ---------------------------------------------------------- */

    function onKey(ev: KeyboardEvent): void {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        finish('cancel');
        return;
      }
      if (ev.key === 'Enter' && box) {
        ev.preventDefault();
        void commit();
        return;
      }
      if (!box || !ev.key.startsWith('Arrow')) return;

      ev.preventDefault();
      const step = ev.shiftKey ? 10 : 1;
      const grow = ev.altKey;
      const next = { ...box };

      // alt resizes from the bottom-right; otherwise the whole box moves
      if (ev.key === 'ArrowLeft') {
        if (grow) next.w -= step;
        else next.x -= step;
      } else if (ev.key === 'ArrowRight') {
        if (grow) next.w += step;
        else next.x += step;
      } else if (ev.key === 'ArrowUp') {
        if (grow) next.h -= step;
        else next.y -= step;
      } else if (ev.key === 'ArrowDown') {
        if (grow) next.h += step;
        else next.y += step;
      }

      box = clampToViewport(next);
      paint();
    }

    /* committing --------------------------------------------------------- */

    function toPageRect(b: Box): ClipRect {
      return computeRect(b.x, b.y, b.x + b.w, b.y + b.h, win.scrollX || 0, win.scrollY || 0);
    }

    async function commit(): Promise<void> {
      if (!box || box.w < minSize || box.h < minSize) {
        toast({ message: 'Draw a larger area first', tone: 'danger' }, scope);
        return;
      }
      const rect = toPageRect(box);

      // hide our own furniture before previewing or capturing anything
      layer.style.display = 'none';

      const details =
        opts.describe === false ? { ok: true, title: '', description: '' } : await ask(rect, box);

      if (!details.ok) {
        layer.style.display = 'block';
        paint();
        return;
      }

      teardown();
      deps.emit('ui:draw', { rect, title: details.title, description: details.description });

      const jobOptions: PrintcraftOptions = { ...opts, clipRect: rect, target: null };
      if (details.title) jobOptions.documentTitle = details.title;
      if (details.description) {
        jobOptions.annotations = [
          ...(Array.isArray(opts.annotations) ? opts.annotations : []),
          { selector: '.pc-capture', text: details.description }
        ];
      }

      settled = true;
      resolve(deps.print(jobOptions, scope));
    }

    /** the confirm step: what will print, plus an optional caption */
    async function ask(
      rect: ClipRect,
      viewportBox: Box
    ): Promise<{ ok: boolean; title: string; description: string }> {
      const preview = node(doc, 'div', {
        style:
          'border:1px solid #d8d8d3;border-radius:4px;overflow:hidden;background:#f2f2ef;' +
          'display:flex;justify-content:center;width:fit-content;max-width:100%;margin:0 auto;'
      });

      let blank = false;
      try {
        const { rasterize } = await import('../share/rasterize');
        // rendered at the layout you selected against, then cropped to the
        // selection. an earlier version shrank a full-viewport shot with a
        // transform, and the host page's `img { max-width: 100% }` resized it
        // out from under the arithmetic, so the box came out empty.
        const raster = await rasterize(doc.documentElement, {
          width: win.innerWidth,
          height: win.innerHeight,
          clip: { x: viewportBox.x, y: viewportBox.y, width: viewportBox.w, height: viewportBox.h },
          scale: 1,
          background: '#ffffff',
          assetTimeout: 4000
        });

        blank = raster.uniform === true;
        const shot = node(doc, 'img', {
          class: 'pc-k-media',
          attrs: { alt: 'The area you selected' },
          style: 'max-height:240px;'
        }) as HTMLImageElement;
        shot.src = raster.dataUrl;
        preview.appendChild(shot);
      } catch {
        preview.textContent = 'Preview unavailable. The selection is still valid.';
        preview.setAttribute('style', 'color:#55575e;');
      }

      // never let someone confirm a rectangle that would print nothing
      const body = blank
        ? node(doc, 'div', {
            children: [
              preview,
              node(doc, 'p', {
                style: 'margin-top:8px;color:#8a3324;font-size:13px;',
                text: 'This area looks empty. Printing it would give you a blank page — keep adjusting to cover some content.'
              })
            ]
          })
        : preview;

      const result = await modal(
        {
          title: 'Print this area?',
          description:
            Math.round(rect.width) +
            ' × ' +
            Math.round(rect.height) +
            ' px · ' +
            mm(rect.width) +
            ' × ' +
            mm(rect.height) +
            ' mm',
          size: 'md',
          body,
          fields: [
            {
              type: 'text',
              name: 'title',
              label: 'Title',
              placeholder: 'Optional',
              hint: 'Becomes the document title, and the default name when saving as PDF'
            },
            {
              type: 'textarea',
              name: 'description',
              label: 'Description',
              placeholder: 'Optional',
              rows: 2,
              hint: 'Printed as a note beneath the capture'
            }
          ],
          actions: [
            { id: 'back', label: 'Keep adjusting', tone: 'ghost' },
            { id: 'print', label: 'Print', tone: 'primary', icon: 'printer' }
          ]
        },
        scope
      );

      return {
        ok: result.action === 'print',
        title: String(result.values['title'] || '').trim(),
        description: String(result.values['description'] || '').trim()
      };
    }

    function teardown(): void {
      doc.removeEventListener('keydown', onKey, true);
      bar?.close();
      if (layer.parentNode) layer.parentNode.removeChild(layer);
    }

    function finish(action: 'cancel'): void {
      if (settled) return;
      settled = true;
      teardown();
      resolve({ action });
    }

    /* wiring ------------------------------------------------------------- */

    layer.addEventListener('pointerdown', onPointerDown as EventListener);
    layer.addEventListener('pointermove', onPointerMove as EventListener);
    layer.addEventListener('pointerup', onPointerUp as EventListener);
    layer.addEventListener('pointercancel', onPointerUp as EventListener);
    doc.addEventListener('keydown', onKey, true);

    bar = openToolbar(
      {
        label: 'Print area',
        status: 'Drag to select an area',
        actions: [
          {
            id: 'print',
            label: 'Continue',
            icon: 'printer',
            tone: 'primary',
            disabled: true,
            onSelect: () => void commit()
          },
          {
            id: 'reset',
            label: 'Start over',
            icon: 'crop',
            onSelect: () => {
              box = null;
              paint();
              bar.setStatus('Drag to select an area');
            }
          },
          {
            id: 'cancel',
            label: 'Cancel',
            icon: 'close',
            tone: 'ghost',
            onSelect: () => finish('cancel')
          }
        ]
      },
      scope
    );

    paint();
  });
}
