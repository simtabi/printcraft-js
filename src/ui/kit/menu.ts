// A menu built from data.
//
// Items are a plain array, so the context menu, a toolbar dropdown and anything
// a host app wants to add all describe themselves the same way. Submenus,
// separators, group headings, keyboard navigation and type-ahead come free.

import { h, iconNode, root } from './dom';
import { applyPlacement, place, type Anchor } from './position';
import { Surface, type SurfaceOptions } from './surface';
import type { Env } from '../../types';

export interface MenuItem<Ctx = unknown> {
  id: string;
  label: string;
  icon?: string;
  /** keyboard hint shown on the right, as key caps */
  kbd?: string | string[];
  /** secondary text under the label */
  hint?: string;
  /** colours the row */
  tone?: string;
  /** shown with a tick, for a toggle */
  checked?: boolean;
  /** true disables it; a string disables it and says why in a tooltip */
  disabled?: boolean | string;
  /** hide the item entirely unless this returns true */
  when?: (ctx: Ctx) => boolean;
  /** a submenu; `run` is ignored when present */
  items?: MenuItem<Ctx>[];
  run?: (ctx: Ctx) => void | Promise<void>;
}

export interface MenuSeparator {
  separator: true;
}

export interface MenuGroup {
  group: string;
}

export type MenuEntry<Ctx = unknown> = MenuItem<Ctx> | MenuSeparator | MenuGroup;

export interface MenuSpec<Ctx = unknown> {
  entries: MenuEntry<Ctx>[];
  /** passed to `when` and `run` */
  context?: Ctx;
  anchor: Anchor;
  /** aria label for the menu itself */
  label?: string;
  /** a heading at the top of the menu, so it says whose menu it is */
  title?: string;
  /** one line under the title */
  description?: string;
  /** an icon beside the title */
  icon?: string;
  onClose?: () => void;
}

const isItem = <C>(e: MenuEntry<C>): e is MenuItem<C> => 'id' in e;
const isSeparator = <C>(e: MenuEntry<C>): e is MenuSeparator => 'separator' in e;

class Menu<Ctx> extends Surface {
  private items: HTMLButtonElement[] = [];
  private cursor = -1;
  private submenu: Menu<Ctx> | null = null;
  private typeahead = '';
  private typeaheadAt = 0;

  constructor(
    private readonly spec: MenuSpec<Ctx>,
    options: SurfaceOptions
  ) {
    super(options);
  }

  protected build(): HTMLElement {
    const doc = this.doc;
    const menu = root(doc, 'div', {
      class: 'pc-k-menu',
      attrs: { role: 'menu', 'data-pc-menu': '', 'aria-label': this.spec.label || 'Actions' }
    });

    if (this.spec.title) {
      const head = h(doc, 'div', { class: 'pc-k-menu-head' });
      const title = h(doc, 'div', { class: 'pc-k-menu-title' });
      if (this.spec.icon) title.appendChild(iconNode(doc, this.spec.icon));
      title.appendChild(doc.createTextNode(this.spec.title));
      head.appendChild(title);
      if (this.spec.description) {
        head.appendChild(h(doc, 'div', { class: 'pc-k-menu-desc', text: this.spec.description }));
      }
      menu.appendChild(head);
    }

    const ctx = this.spec.context as Ctx;
    const visible = this.spec.entries.filter((e) => !isItem(e) || !e.when || e.when(ctx));

    visible.forEach((entry, i) => {
      if (isSeparator(entry)) {
        // never open or close on a rule, and never two in a row
        const prev = visible[i - 1];
        if (i === 0 || i === visible.length - 1 || (prev && isSeparator(prev))) return;
        menu.appendChild(h(doc, 'div', { class: 'pc-k-sep', attrs: { role: 'separator' } }));
        return;
      }
      if (!isItem(entry)) {
        menu.appendChild(h(doc, 'div', { class: 'pc-k-group', text: entry.group }));
        return;
      }
      menu.appendChild(this.buildItem(entry));
    });

    return menu;
  }

  private buildItem(item: MenuItem<Ctx>): HTMLButtonElement {
    const doc = this.doc;
    const hasSub = !!item.items?.length;

    const off = !!item.disabled;
    const row = h(doc, 'button', {
      class: 'pc-k-item',
      attrs: {
        type: 'button',
        role: item.checked === undefined ? 'menuitem' : 'menuitemcheckbox',
        'data-pc-item': item.id,
        ...(item.tone ? { 'data-tone': item.tone } : {}),
        ...(item.checked === undefined ? {} : { 'aria-checked': item.checked ? 'true' : 'false' }),
        'aria-haspopup': hasSub ? 'menu' : undefined,
        'aria-expanded': hasSub ? 'false' : undefined,
        // the reason a row is off is worth reading, and a disabled button has
        // no tooltip of its own, so it goes in the title
        title: typeof item.disabled === 'string' ? item.disabled : undefined,
        disabled: off,
        tabindex: -1
      }
    });

    const glyph = item.checked ? 'check' : item.icon;
    if (glyph) {
      row.appendChild(
        h(doc, 'span', { class: 'pc-k-item-icon', children: [iconNode(doc, glyph)] })
      );
    }

    const text = h(doc, 'span', { class: 'pc-k-item-text' });
    text.appendChild(h(doc, 'span', { class: 'pc-k-item-label', text: item.label }));
    if (item.hint) text.appendChild(h(doc, 'span', { class: 'pc-k-item-hint', text: item.hint }));
    row.appendChild(text);

    if (item.kbd) {
      const caps = h(doc, 'span', { class: 'pc-k-item-kbd' });
      for (const cap of Array.isArray(item.kbd) ? item.kbd : [item.kbd]) {
        caps.appendChild(h(doc, 'kbd', { class: 'pc-k-kbd', text: cap }));
      }
      row.appendChild(caps);
    }
    if (hasSub) row.appendChild(h(doc, 'span', { class: 'pc-k-item-more', text: '›' }));

    if (!off) {
      row.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (hasSub) this.openSubmenu(item, row);
        else this.run(item);
      });
      row.addEventListener('mouseenter', () => {
        this.cursor = this.items.indexOf(row);
        this.paintCursor();
        if (hasSub) this.openSubmenu(item, row);
        else this.closeSubmenu();
      });
      this.items.push(row);
    }
    return row;
  }

  private run(item: MenuItem<Ctx>): void {
    this.close();
    try {
      void item.run?.(this.spec.context as Ctx);
    } catch (e) {
      try {
        console.error('[printcraft] menu item "' + item.id + '" threw:', e);
      } catch {
        /* noop */
      }
    }
  }

  private openSubmenu(item: MenuItem<Ctx>, row: HTMLElement): void {
    this.closeSubmenu();
    const box = row.getBoundingClientRect();
    row.setAttribute('aria-expanded', 'true');

    this.submenu = new Menu<Ctx>(
      {
        entries: item.items || [],
        context: this.spec.context,
        label: item.label,
        anchor: {
          x: box.right,
          y: box.top,
          rect: { left: box.left, top: box.top, right: box.right, bottom: box.bottom }
        },
        onClose: () => {
          row.setAttribute('aria-expanded', 'false');
          this.submenu = null;
        }
      },
      { env: this.options.env, trapFocus: false, dismissOnEscape: false }
    );
    this.submenu.placeMode = 'beside';
    this.submenu.open();
  }

  private closeSubmenu(): void {
    this.submenu?.close();
    this.submenu = null;
  }

  /** submenus flank their parent row; top-level menus hang off the pointer */
  private placeMode: 'point' | 'beside' = 'point';

  protected override mounted(): void {
    const node = this.node;
    if (!node) return;

    applyPlacement(node, place(node, this.spec.anchor, this.win, { mode: this.placeMode }));

    // a click anywhere else, or any scroll, dismisses. capture, so it still
    // fires when the click lands on something that stops propagation.
    this.on(
      this.doc,
      'mousedown',
      (ev) => {
        const target = ev.target as Element | null;
        if (target?.closest?.('[data-pc-menu]')) return;
        this.close();
      },
      true
    );
    this.on(this.doc, 'scroll', () => this.close(), true);
    this.on(this.win, 'resize', () => this.close());

    // a menu opened from a right-click should already be keyboard-ready
    if (this.placeMode === 'point') this.setCursor(0);
  }

  protected override unmounting(): void {
    this.closeSubmenu();
    this.spec.onClose?.();
  }

  protected override onKeydown(ev: KeyboardEvent): void {
    // a submenu is open: let it have the keys
    if (this.submenu?.isOpen) return;

    switch (ev.key) {
      case 'Escape':
        ev.preventDefault();
        ev.stopPropagation();
        this.close();
        return;
      case 'ArrowDown':
        ev.preventDefault();
        this.moveCursor(1);
        return;
      case 'ArrowUp':
        ev.preventDefault();
        this.moveCursor(-1);
        return;
      case 'Home':
        ev.preventDefault();
        this.setCursor(0);
        return;
      case 'End':
        ev.preventDefault();
        this.setCursor(this.items.length - 1);
        return;
      case 'Enter':
      case ' ':
        ev.preventDefault();
        this.items[this.cursor]?.click();
        return;
      case 'ArrowRight':
        ev.preventDefault();
        this.items[this.cursor]?.click();
        return;
      case 'Tab':
        ev.preventDefault();
        this.close();
        return;
      default:
        break;
    }

    // type-ahead: jump to the next item starting with what was typed
    if (ev.key.length === 1 && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
      const now = Date.now();
      this.typeahead = now - this.typeaheadAt > 700 ? ev.key : this.typeahead + ev.key;
      this.typeaheadAt = now;

      const needle = this.typeahead.toLowerCase();
      const from = this.cursor + (this.typeahead.length === 1 ? 1 : 0);
      for (let i = 0; i < this.items.length; i++) {
        const at = (from + i) % this.items.length;
        const text = this.items[at]?.textContent?.trim().toLowerCase() || '';
        if (text.startsWith(needle)) {
          this.setCursor(at);
          return;
        }
      }
    }
  }

  private moveCursor(delta: number): void {
    if (!this.items.length) return;
    const next = this.cursor < 0 ? (delta > 0 ? 0 : this.items.length - 1) : this.cursor + delta;
    this.setCursor((next + this.items.length) % this.items.length);
  }

  private setCursor(index: number): void {
    this.cursor = index;
    this.paintCursor();
    this.items[index]?.focus({ preventScroll: true });
  }

  private paintCursor(): void {
    this.items.forEach((el, i) => el.setAttribute('data-active', String(i === this.cursor)));
  }
}

export interface MenuHandle {
  close(): void;
  readonly isOpen: boolean;
}

/** Opens a menu at a point. Returns a handle so the caller can close it. */
export function openMenu<Ctx>(spec: MenuSpec<Ctx>, env?: Env): MenuHandle {
  const instance = new Menu<Ctx>(spec, {
    env: env || { document, window },
    trapFocus: false
  });
  instance.open();
  return {
    close: () => instance.close(),
    get isOpen() {
      return instance.isOpen;
    }
  };
}
