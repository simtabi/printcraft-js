// the section picker: hover to highlight, click to multi-select, then print or
// stamp the selection for redaction.

import { NS } from '../support';
import { icon } from './icons';
import { defaultEnv, el, FONT, Z, type UiDeps } from './shared';
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

    const bar = el(
      doc,
      'div',
      'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:' +
        Z +
        ';' +
        'display:flex;gap:8px;align-items:center;background:#17181b;color:#fff;padding:9px 12px;' +
        'border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.3);' +
        FONT
    );
    bar.innerHTML =
      '<span data-pc-count>Click sections to select · 0 selected</span>' +
      '<button data-pc-act="print" type="button"></button>' +
      '<button data-pc-act="redact" type="button"></button>' +
      '<button data-pc-act="cancel" type="button"></button>';

    const btnStyle =
      'display:inline-flex;align-items:center;gap:6px;background:#fff;color:#17181b;' +
      'border:0;border-radius:5px;padding:6px 10px;cursor:pointer;' +
      FONT;

    const actionButton = (act: string): HTMLElement | null =>
      bar.querySelector<HTMLElement>('[data-pc-act="' + act + '"]');

    const setBtn = (act: string, ic: string, label: string): void => {
      const b = actionButton(act);
      if (!b) return;
      b.setAttribute('style', btnStyle);
      b.innerHTML = '<span style="display:inline-flex">' + icon(ic) + '</span><span></span>';
      const labelSpan = b.lastChild as HTMLElement | null;
      if (labelSpan) labelSpan.textContent = label;
    };
    setBtn('print', 'printer', 'Print');
    setBtn('redact', 'redact', 'Redact');
    setBtn('cancel', 'close', 'Cancel');
    doc.body.appendChild(bar);

    function count(): void {
      const c = bar.querySelector<HTMLElement>('[data-pc-count]');
      if (!c) return;
      c.textContent = selected.length
        ? selected.length + ' selected · Enter prints, Esc cancels'
        : 'Click sections to select · 0 selected';
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
      if (t.closest('[data-pc-ui]')) return null;
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
      [hover, bar].forEach((n) => {
        if (n.parentNode) n.parentNode.removeChild(n);
      });
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

    actionButton('print')?.addEventListener('click', () => finish('print'));
    actionButton('redact')?.addEventListener('click', () => finish('redact'));
    actionButton('cancel')?.addEventListener('click', () => finish('cancel'));
    doc.addEventListener('mousemove', onMove, true);
    doc.addEventListener('click', onClick, true);
    doc.addEventListener('keydown', onKey, true);
    count();
  });
}
