// the section picker: hover to highlight, click to multi-select, then print or
// stamp the selection for redaction.

import { NS } from '../support';
import { openToolbar, type ToolbarHandle } from './kit';
import { defaultEnv, el, Z, type UiDeps } from './shared';
import type { Env, InspectController, JobRecord, PrintcraftOptions } from '../types';

export interface PickResult {
  action: 'print' | 'redact' | 'cancel';
  elements?: Element[];
}

/** Enter or the toolbar prints, Esc cancels. resolves with the job or the action. */
export function pickSections(
  deps: UiDeps,
  base?: PrintcraftOptions,
  env?: Env
): Promise<JobRecord | InspectController | PickResult> {
  const scope = env || defaultEnv();
  const doc = scope.document;
  const win = scope.window;
  const opts = base || {};

  return new Promise((resolve) => {
    const selected: Element[] = [];
    const outlines = new Map<Element, HTMLElement>();

    const hover = el(
      doc,
      'div',
      'position:absolute;z-index:' +
        (Z - 2) +
        ';pointer-events:none;border:2px dashed #0f766e;' +
        'background:rgba(15,118,110,.08);display:none;'
    );
    doc.body.appendChild(hover);

    let bar: ToolbarHandle;

    function count(): void {
      bar.setStatus(
        selected.length
          ? selected.length + ' selected · Enter prints, Esc cancels'
          : 'Click sections to select'
      );
      bar.setDisabled('print', selected.length === 0);
      bar.setDisabled('redact', selected.length === 0);
    }

    function boxFor(target: Element): HTMLElement {
      const r = target.getBoundingClientRect();
      const b = el(
        doc,
        'div',
        'position:absolute;z-index:' +
          (Z - 2) +
          ';pointer-events:none;border:2px solid #0f766e;' +
          'background:rgba(15,118,110,.12);' +
          'left:' +
          (r.left + win.scrollX) +
          'px;top:' +
          (r.top + win.scrollY) +
          'px;' +
          'width:' +
          r.width +
          'px;height:' +
          r.height +
          'px;'
      );
      doc.body.appendChild(b);
      return b;
    }

    function pickable(t: Element | null): Element | null {
      if (!t || typeof t.closest !== 'function') return null;
      if (t.closest('[data-prjs-ui]')) return null;
      if (t === doc.body || t === doc.documentElement) return null;
      return t;
    }

    function onMove(e: Event): void {
      const t = pickable(e.target as Element | null);
      if (!t) {
        hover.style.display = 'none';
        return;
      }
      const r = t.getBoundingClientRect();
      hover.style.display = 'block';
      hover.style.left = r.left + win.scrollX + 'px';
      hover.style.top = r.top + win.scrollY + 'px';
      hover.style.width = r.width + 'px';
      hover.style.height = r.height + 'px';
    }

    function onClick(e: Event): void {
      const t = pickable(e.target as Element | null);
      if (!t) return;
      e.preventDefault();
      e.stopPropagation();

      const i = selected.indexOf(t);
      if (i === -1) {
        selected.push(t);
        outlines.set(t, boxFor(t));
      } else {
        selected.splice(i, 1);
        const b = outlines.get(t);
        if (b && b.parentNode) b.parentNode.removeChild(b);
        outlines.delete(t);
      }
      count();
      deps.emit('ui:pick', { selected: selected.slice() });
    }

    function teardown(): void {
      doc.removeEventListener('mousemove', onMove, true);
      doc.removeEventListener('click', onClick, true);
      doc.removeEventListener('keydown', onKey, true);
      if (hover.parentNode) hover.parentNode.removeChild(hover);
      bar.close();
      outlines.forEach((b) => {
        if (b.parentNode) b.parentNode.removeChild(b);
      });
      outlines.clear();
    }

    function finish(action: PickResult['action']): void {
      const els = selected.slice();
      teardown();
      if (action === 'print' && els.length) {
        resolve(deps.print({ ...opts, target: els }, scope));
      } else if (action === 'redact' && els.length) {
        els.forEach((t) => t.setAttribute('data-' + NS + '-redact', ''));
        deps.emit('ui:redact', { elements: els, redacted: true });
        resolve({ action: 'redact', elements: els });
      } else {
        resolve({ action: 'cancel' });
      }
    }

    function onKey(e: Event): void {
      const key = (e as KeyboardEvent).key;
      if (key === 'Escape') {
        e.preventDefault();
        finish('cancel');
      }
      if (key === 'Enter') {
        e.preventDefault();
        finish('print');
      }
    }

    bar = openToolbar(
      {
        label: 'Section picker',
        status: 'Click sections to select',
        actions: [
          {
            id: 'print',
            label: 'Print',
            icon: 'printer',
            tone: 'primary',
            disabled: true,
            onSelect: () => finish('print')
          },
          {
            id: 'redact',
            label: 'Redact',
            icon: 'redact',
            disabled: true,
            onSelect: () => finish('redact')
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

    doc.addEventListener('mousemove', onMove, true);
    doc.addEventListener('click', onClick, true);
    doc.addEventListener('keydown', onKey, true);
    count();
  });
}
