// the right-click context menu: the entry point to every other ui mode.

import { NS } from '../support';
import { icon } from './icons';
import { annotate, toggleRedact } from './annotations';
import { drawArea } from './draw';
import { pickSections } from './picker';
import { defaultEnv, el, FONT, Z, type UiDeps } from './shared';
import type { Env, PrintcraftOptions } from '../types';

interface MenuItem {
  id: string;
  label: string;
  icon: string;
  run: (ctx: { target: Element; env: Env; base: PrintcraftOptions }) => void;
}

export function buildMenuItems(deps: UiDeps): MenuItem[] {
  return [
    {
      id: 'print-page',
      label: 'Print page',
      icon: 'printer',
      run: ({ env, base }) => {
        void deps.print({ ...base, target: 'body' }, env);
      }
    },
    {
      id: 'print-element',
      label: 'Print this element',
      icon: 'click',
      run: ({ target, env, base }) => {
        void deps.print({ ...base, target }, env);
      }
    },
    {
      id: 'pick',
      label: 'Pick sections…',
      icon: 'marquee',
      run: ({ env, base }) => {
        void pickSections(deps, base, env);
      }
    },
    {
      id: 'draw',
      label: 'Draw print area…',
      icon: 'crop',
      run: ({ env, base }) => {
        void drawArea(deps, base, env);
      }
    },
    {
      id: 'redact',
      label: 'Toggle redaction',
      icon: 'redact',
      run: ({ target }) => {
        const on = toggleRedact(target);
        deps.emit('ui:redact', { element: target, redacted: on });
      }
    },
    {
      id: 'note',
      label: 'Add note…',
      icon: 'note',
      run: ({ target }) => {
        const text = annotate(target);
        if (text != null) deps.emit('ui:annotate', { element: target, text });
      }
    },
    {
      id: 'inspect',
      label: 'Inspect print',
      icon: 'inspect',
      run: ({ target, env, base }) => {
        void deps.inspect({ ...base, target }, env);
      }
    }
  ];
}

export interface ContextMenuOptions {
  /** options merged into every job the menu triggers. */
  base?: PrintcraftOptions;
  /** subset of item ids, in the order they should appear. */
  items?: string[];
}

/** installs the right-click menu. the returned function removes it again. */
export function contextMenu(deps: UiDeps, cfg?: ContextMenuOptions, env?: Env): () => void {
  const scope = env || defaultEnv();
  const doc = scope.document;
  const base = cfg?.base || {};

  let all = buildMenuItems(deps);
  if (cfg?.items) {
    const byId = new Map(all.map((i) => [i.id, i]));
    all = cfg.items.map((id) => byId.get(id)).filter((i): i is MenuItem => !!i);
  }

  let menu: HTMLElement | null = null;
  let lastTarget: Element | null = null;

  function close(): void {
    if (menu && menu.parentNode) menu.parentNode.removeChild(menu);
    menu = null;
  }

  function open(x: number, y: number, target: Element): void {
    close();
    lastTarget = target;

    const node = el(
      doc,
      'div',
      'position:fixed;z-index:' +
        Z +
        ';min-width:210px;background:#fff;color:#17181b;' +
        'border:1px solid #d8d8d3;border-radius:6px;box-shadow:0 8px 24px rgba(0,0,0,.18);' +
        'padding:4px;' +
        FONT
    );
    node.setAttribute('role', 'menu');
    node.setAttribute('data-pc-menu', '');

    all.forEach((item) => {
      const row = el(
        doc,
        'button',
        'display:flex;align-items:center;gap:9px;width:100%;text-align:left;background:none;' +
          'border:0;border-radius:4px;padding:7px 9px;cursor:pointer;color:inherit;' +
          FONT
      ) as HTMLButtonElement;
      row.type = 'button';
      row.setAttribute('role', 'menuitem');
      row.setAttribute('data-pc-item', item.id);
      row.innerHTML =
        '<span style="display:inline-flex;color:#55575e">' +
        icon(item.icon) +
        '</span><span></span>';

      const labelSpan = row.lastChild as HTMLElement | null;
      if (labelSpan) labelSpan.textContent = item.label;

      row.addEventListener('mouseenter', () => {
        row.style.background = '#f2f2ef';
      });
      row.addEventListener('mouseleave', () => {
        row.style.background = 'none';
      });
      row.addEventListener('click', () => {
        close();
        try {
          if (lastTarget) item.run({ target: lastTarget, env: scope, base });
        } catch (e) {
          try {
            console.error('[' + NS + ']', e);
          } catch {
            /* noop */
          }
        }
      });
      node.appendChild(row);
    });

    doc.body.appendChild(node);
    menu = node;

    // keep the menu inside the viewport
    const vw = scope.window.innerWidth || 1024;
    const vh = scope.window.innerHeight || 768;
    const mw = node.offsetWidth || 220;
    const mh = node.offsetHeight || all.length * 34;
    node.style.left = Math.max(0, Math.min(x, vw - mw - 8)) + 'px';
    node.style.top = Math.max(0, Math.min(y, vh - mh - 8)) + 'px';
  }

  function onContext(e: Event): void {
    const t = e.target as Element | null;
    // leave the native menu alone on printcraft's own ui
    if (!t || (typeof t.closest === 'function' && t.closest('[data-pc-ui]'))) return;
    e.preventDefault();
    const me = e as MouseEvent;
    open(me.clientX, me.clientY, t);
    deps.emit('ui:menu', { target: t });
  }

  function onDismiss(e: Event): void {
    if (!menu) return;
    const t = e.target as Element | null;
    if (t && typeof t.closest === 'function' && t.closest('[data-pc-menu]')) return;
    close();
  }

  function onKey(e: Event): void {
    if ((e as KeyboardEvent).key === 'Escape') close();
  }

  doc.addEventListener('contextmenu', onContext);
  doc.addEventListener('click', onDismiss, true);
  doc.addEventListener('scroll', close, true);
  doc.addEventListener('keydown', onKey, true);

  return function disable(): void {
    close();
    doc.removeEventListener('contextmenu', onContext);
    doc.removeEventListener('click', onDismiss, true);
    doc.removeEventListener('scroll', close, true);
    doc.removeEventListener('keydown', onKey, true);
  };
}
