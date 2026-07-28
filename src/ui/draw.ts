// draw-to-print: drag a rectangle, release, and print exactly that region through
// the clipRect option.

import { computeRect } from './annotations';
import { defaultEnv, el, FONT, Z, type UiDeps } from './shared';
import type { Env, InspectController, JobRecord, PrintcraftOptions } from '../types';

export interface DrawResult {
  action: 'cancel';
}

export function drawArea(
  deps: UiDeps,
  base?: PrintcraftOptions,
  env?: Env
): Promise<JobRecord | InspectController | DrawResult> {
  const scope = env || defaultEnv();
  const doc = scope.document;
  const win = scope.window;
  const opts = base || {};

  return new Promise((resolve) => {
    const layer = el(
      doc,
      'div',
      'position:fixed;inset:0;z-index:' + Z + ';cursor:crosshair;background:rgba(20,20,24,.25);'
    );
    layer.setAttribute('data-pc-draw', '');

    const hint = el(
      doc,
      'div',
      'position:fixed;top:14px;left:50%;transform:translateX(-50%);background:#17181b;color:#fff;' +
        'padding:7px 12px;border-radius:6px;' +
        FONT,
      ''
    );
    hint.textContent = 'Drag to draw the print area · Esc cancels';

    // the layer already dims the page, so the rectangle only needs to read as clear
    const rectEl = el(
      doc,
      'div',
      'position:fixed;display:none;border:2px solid #0f766e;background:rgba(255,255,255,.85);'
    );
    const dims = el(
      doc,
      'div',
      'position:fixed;display:none;background:#0f766e;color:#fff;padding:2px 7px;border-radius:4px;' +
        FONT
    );

    layer.appendChild(rectEl);
    layer.appendChild(dims);
    layer.appendChild(hint);
    doc.body.appendChild(layer);

    let sx = 0;
    let sy = 0;
    let drawing = false;

    function teardown(): void {
      doc.removeEventListener('keydown', onKey, true);
      if (layer.parentNode) layer.parentNode.removeChild(layer);
    }

    function onKey(e: Event): void {
      if ((e as KeyboardEvent).key === 'Escape') {
        e.preventDefault();
        teardown();
        resolve({ action: 'cancel' });
      }
    }
    doc.addEventListener('keydown', onKey, true);

    layer.addEventListener('mousedown', (e: MouseEvent) => {
      drawing = true;
      sx = e.clientX;
      sy = e.clientY;
      rectEl.style.display = 'block';
      dims.style.display = 'block';
      e.preventDefault();
    });

    layer.addEventListener('mousemove', (e: MouseEvent) => {
      if (!drawing) return;
      const x = Math.min(sx, e.clientX);
      const y = Math.min(sy, e.clientY);
      const w = Math.abs(e.clientX - sx);
      const h = Math.abs(e.clientY - sy);
      rectEl.style.left = x + 'px';
      rectEl.style.top = y + 'px';
      rectEl.style.width = w + 'px';
      rectEl.style.height = h + 'px';
      dims.style.left = x + 4 + 'px';
      dims.style.top = y - 26 + 'px';
      dims.textContent = w + ' × ' + h + ' px';
    });

    layer.addEventListener('mouseup', (e: MouseEvent) => {
      if (!drawing) return;
      drawing = false;
      const rect = computeRect(sx, sy, e.clientX, e.clientY, win.scrollX || 0, win.scrollY || 0);
      teardown();
      if (rect.width < 8 || rect.height < 8) {
        resolve({ action: 'cancel' });
        return;
      }
      deps.emit('ui:draw', { rect });
      resolve(deps.print({ ...opts, clipRect: rect, target: null }, scope));
    });
  });
}
