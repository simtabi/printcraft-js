// The right-click menu: the way into every other mode.
//
// The menu itself is the kit's now, so this file is the item catalogue and the
// listener that opens it. Adding an entry means adding an object, and a host can
// extend or replace the whole set.

import { askForNote, toggleRedact } from './annotations';
import { drawArea } from './draw';
import { pickSections } from './picker';
import { printDialog } from './print-dialog';
import { openMenu, toast, type MenuEntry, type MenuHandle } from './kit';
import { defaultEnv, type UiDeps } from './shared';
import type { Env, PrintcraftOptions } from '../types';

/** what a menu item is handed when it runs */
export interface MenuContext {
  target: Element;
  env: Env;
  base: PrintcraftOptions;
  deps: UiDeps;
}

export type ContextMenuEntry = MenuEntry<MenuContext>;

/**
 * The stock entries, grouped. Exported so a host can start from these and add,
 * remove or reorder rather than rebuild the lot.
 */
export function buildMenuItems(deps: UiDeps): ContextMenuEntry[] {
  return [
    { group: 'Print' },
    {
      id: 'print-element',
      label: 'Print this element',
      icon: 'click',
      hint: 'Just what you right-clicked',
      run: ({ target, env, base }) => void deps.print({ ...base, target }, env)
    },
    {
      id: 'print-page',
      label: 'Print the page',
      icon: 'printer',
      run: ({ env, base }) => void deps.print({ ...base, target: 'body' }, env)
    },
    {
      id: 'settings',
      label: 'Print settings…',
      icon: 'settings',
      hint: 'Paper, margins, page numbers, borders',
      run: ({ target, env, base }) => void printDialog(deps, { ...base, target }, env)
    },
    { separator: true },

    { group: 'Choose what prints' },
    {
      id: 'pick',
      label: 'Pick sections…',
      icon: 'marquee',
      hint: 'Click several, then print them together',
      run: ({ env, base }) => void pickSections(deps, base, env)
    },
    {
      id: 'draw',
      label: 'Draw a print area…',
      icon: 'crop',
      hint: 'Drag a rectangle over the page',
      run: ({ env, base }) => void drawArea(deps, base, env)
    },
    { separator: true },

    { group: 'Mark up' },
    {
      id: 'redact',
      label: 'Toggle redaction',
      icon: 'redact',
      hint: 'Blacks it out destructively',
      run: ({ target, env }) => {
        const on = toggleRedact(target);
        deps.emit('ui:redact', { element: target, redacted: on });
        toast(
          {
            message: on ? 'Marked for redaction' : 'Redaction removed',
            action: {
              label: 'Undo',
              onSelect: () => {
                toggleRedact(target);
                deps.emit('ui:redact', { element: target, redacted: !on });
              }
            }
          },
          env
        );
      }
    },
    {
      id: 'note',
      label: 'Add a note…',
      icon: 'note',
      run: ({ target, env }) => {
        void askForNote(target, env).then((text) => {
          if (text == null) return;
          deps.emit('ui:annotate', { element: target, text });
          toast({ message: text ? 'Note attached' : 'Note removed' }, env);
        });
      }
    },
    { separator: true },

    {
      id: 'inspect',
      label: 'Preview the print',
      icon: 'inspect',
      hint: 'Opens the assembled document, no dialog',
      run: ({ target, env, base }) => void deps.inspect({ ...base, target }, env)
    }
  ];
}

export interface ContextMenuOptions {
  /** merged into every job the menu starts */
  base?: PrintcraftOptions;
  /** item ids to keep, in the order you want them */
  items?: string[];
  /** entries appended after the stock ones */
  extra?: ContextMenuEntry[];
  /** replace the catalogue outright */
  entries?: ContextMenuEntry[];
  /** return false to leave the native menu alone for this target */
  shouldOpen?: (target: Element) => boolean;
}

type ContextMenuItem = Extract<ContextMenuEntry, { id: string }>;

const isItem = (e: ContextMenuEntry): e is ContextMenuItem => 'id' in e;

/** Installs the right-click menu. The returned function removes it again. */
export function contextMenu(deps: UiDeps, cfg?: ContextMenuOptions, env?: Env): () => void {
  const scope = env || defaultEnv();
  const doc = scope.document;
  const base = cfg?.base || {};

  let entries = cfg?.entries || buildMenuItems(deps);
  if (cfg?.items) {
    const byId = new Map<string, ContextMenuItem>(
      entries.filter(isItem).map((e) => [e.id, e] as const)
    );
    entries = cfg.items
      .map((id) => byId.get(id))
      .filter((e): e is ContextMenuItem => e !== undefined);
  }
  if (cfg?.extra?.length) entries = entries.concat(cfg.extra);

  let open: MenuHandle | null = null;

  function onContext(ev: Event): void {
    const target = ev.target as Element | null;
    // never take over the menu on the kit's own surfaces
    if (!target || (typeof target.closest === 'function' && target.closest('[data-pc-ui]'))) return;
    if (cfg?.shouldOpen && !cfg.shouldOpen(target)) return;

    ev.preventDefault();
    open?.close();

    const me = ev as MouseEvent;
    open = openMenu<MenuContext>(
      {
        entries,
        context: { target, env: scope, base, deps },
        anchor: { x: me.clientX, y: me.clientY },
        label: 'Printcraft actions',
        onClose: () => {
          open = null;
        }
      },
      scope
    );
    deps.emit('ui:menu', { target, entries: entries.filter(isItem).map((e) => e.id) });
  }

  doc.addEventListener('contextmenu', onContext);

  return function disable(): void {
    open?.close();
    open = null;
    doc.removeEventListener('contextmenu', onContext);
  };
}

/** Opens the same menu at a point, without waiting for a right-click. */
export function openContextMenuAt(
  deps: UiDeps,
  at: { x: number; y: number; target: Element },
  cfg?: ContextMenuOptions,
  env?: Env
): MenuHandle {
  const scope = env || defaultEnv();
  return openMenu<MenuContext>(
    {
      entries: cfg?.entries || buildMenuItems(deps),
      context: { target: at.target, env: scope, base: cfg?.base || {}, deps },
      anchor: { x: at.x, y: at.y },
      label: 'Printcraft actions'
    },
    scope
  );
}
