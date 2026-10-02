// The floating bar the picker, the region tool and the annotation studio share.
//
// Data-driven like everything else here: a status line that can be updated and
// a list of buttons, so a new mode is a spec rather than another DOM builder.
//
// Two of these open at once used to land on top of each other. Every bar was
// `position: fixed; bottom: 22px`, so drawing a region while the annotation
// tools were out gave one unreadable pile of buttons at the foot of the screen,
// each half-covering the other. They share a stack now: one container per
// document, bars laid out in it, the newest nearest the edge.

import { button, h, iconNode, root, type ButtonSpec } from './dom';
import { Surface, type SurfaceOptions } from './surface';
import { ensureStyles } from './theme';
import type { Env } from '../../types';

export interface ToolbarAction extends Omit<ButtonSpec, 'onClick'> {
  id: string;
  onSelect: () => void;
  /** shown with a tick, for a mode that is currently on */
  active?: boolean;
}

/** One piece of the status line. Several read better than one long string. */
export interface ToolbarChip {
  label: string;
  /** a swatch drawn before the label, for a colour */
  swatch?: string;
  tone?: string;
}

export interface ToolbarSpec {
  status?: string | ToolbarChip[];
  actions: ToolbarAction[];
  label?: string;
  /** which edge it sits against. bottom by default. */
  dock?: 'bottom' | 'top';
  /**
   * A rectangle the bar should keep clear of.
   *
   * The region tool's bar sat over the very selection it was describing. Given
   * the box, the stack moves to the other edge rather than covering it.
   */
  avoid?: () => DOMRect | null;
}

/* the stack --------------------------------------------------------------- */

interface Docked {
  el: HTMLElement;
  dock: 'bottom' | 'top';
  avoid?: (() => DOMRect | null) | undefined;
}

const stacks = new WeakMap<Document, ToolbarStack>();

/**
 * Where every toolbar in a document lives.
 *
 * A flex column per edge. Bars are appended, so the newest is nearest the edge
 * it is docked to, which is where the eye already is when a new tool opens.
 */
class ToolbarStack {
  private readonly bottom: HTMLElement;
  private readonly top: HTMLElement;
  private readonly bars: Docked[] = [];

  constructor(private readonly doc: Document) {
    ensureStyles(doc);
    this.bottom = this.lane('bottom');
    this.top = this.lane('top');
  }

  private lane(edge: 'bottom' | 'top'): HTMLElement {
    const el = root(this.doc, 'div', {
      class: 'prjs-toolbar-stack',
      attrs: { 'data-dock': edge, 'data-prjs-toolbar-stack': '' }
    });
    (this.doc.body || this.doc.documentElement).appendChild(el);
    return el;
  }

  add(bar: Docked): void {
    this.bars.push(bar);
    (bar.dock === 'top' ? this.top : this.bottom).appendChild(bar.el);
    this.reflow();
  }

  remove(el: HTMLElement): void {
    const at = this.bars.findIndex((b) => b.el === el);
    if (at >= 0) this.bars.splice(at, 1);
    el.remove();
    this.reflow();
  }

  /**
   * Moves a lane out of the way of what its bars are about.
   *
   * Only the bottom lane shifts, and only when something asked it to: a bar
   * with no `avoid` never moves, so a tool that does not care is not surprised
   * by a jumping toolbar.
   */
  reflow(): void {
    const win = this.doc.defaultView;
    if (!win) return;

    const wants = this.bars.filter((b) => b.dock === 'bottom' && b.avoid);
    if (!wants.length) {
      this.bottom.setAttribute('data-shifted', 'false');
      return;
    }

    const lane = this.bottom.getBoundingClientRect();
    if (!lane.height) return;

    // Measured against where the lane *would* sit at the bottom, never against
    // where it currently sits.
    //
    // Using its live rectangle oscillates: it moves to the top, stops colliding,
    // moves back down, collides again, forever. The bar then never holds still
    // long enough to be clicked — which reads as a button that does not work.
    const EDGE = 22;
    const top = win.innerHeight - EDGE - lane.height;
    const bottom = win.innerHeight - EDGE;

    const collides = wants.some((b) => {
      const box = b.avoid?.();
      return !!box && box.bottom > top - 12 && box.top < bottom;
    });
    this.bottom.setAttribute('data-shifted', collides ? 'true' : 'false');
  }
}

function stackFor(doc: Document): ToolbarStack {
  let stack = stacks.get(doc);
  if (!stack) {
    stack = new ToolbarStack(doc);
    stacks.set(doc, stack);
  }
  return stack;
}

/* the bar ----------------------------------------------------------------- */

class Toolbar extends Surface {
  private statusNode: HTMLElement | null = null;
  private buttons = new Map<string, HTMLButtonElement>();
  private stack: ToolbarStack | null = null;
  private watch: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly spec: ToolbarSpec,
    options: SurfaceOptions
  ) {
    super(options);
  }

  protected build(): HTMLElement {
    const doc = this.doc;
    const bar = h(doc, 'div', {
      class: 'prjs-toolbar',
      attrs: { role: 'toolbar', 'data-prjs-toolbar': '', 'aria-label': this.spec.label || 'Tools' }
    });

    this.statusNode = h(doc, 'span', {
      class: 'prjs-toolbar-status',
      attrs: { 'data-prjs-status': '', 'aria-live': 'polite' }
    });
    this.paintStatus(this.spec.status || '');
    bar.appendChild(this.statusNode);

    for (const action of this.spec.actions) {
      // the map keys by id, so a duplicate silently makes the first button
      // unreachable by setDisabled and setActive. the annotation bar shipped
      // with two `pen`s — a tool and a settings button — and neither could be
      // driven from code.
      if (this.buttons.has(action.id)) {
        try {
          console.warn('[printcraft] two toolbar actions share the id "' + action.id + '"');
        } catch {
          /* noop */
        }
      }
      const el = button(doc, {
        label: action.label,
        tone: action.tone,
        icon: action.icon,
        disabled: action.disabled,
        attrs: {
          'data-prjs-act': action.id,
          ...(action.active ? { 'data-active': 'true', 'aria-pressed': 'true' } : {})
        },
        onClick: () => action.onSelect()
      });
      this.buttons.set(action.id, el);
      bar.appendChild(el);
    }
    return bar;
  }

  /**
   * The stack owns placement, so the bar is added to it rather than to the body.
   *
   * `Surface.open()` has already appended the node; moving it into the lane is
   * one `appendChild`, and `close()` puts it back through the stack so the rest
   * reflow.
   */
  protected override mounted(): void {
    const node = this.node;
    if (!node) return;

    this.stack = stackFor(this.doc);
    this.stack.add({
      el: node,
      dock: this.spec.dock || 'bottom',
      avoid: this.spec.avoid
    });

    // the rectangle to avoid is dragged and resized by the tool that owns it,
    // and it does not tell us. cheap to re-measure; only runs while a bar that
    // asked for it is open.
    if (this.spec.avoid) {
      this.watch = setInterval(() => this.stack?.reflow(), 200);
      this.addCleanup(() => clearInterval(this.watch));
    }
  }

  protected override unmounting(): void {
    if (this.node) this.stack?.remove(this.node);
  }

  private paintStatus(status: string | ToolbarChip[]): void {
    const node = this.statusNode;
    if (!node) return;
    node.textContent = '';

    if (typeof status === 'string') {
      node.appendChild(this.doc.createTextNode(status));
      return;
    }
    for (const chip of status) {
      const el = h(this.doc, 'span', {
        class: 'prjs-toolbar-chip',
        ...(chip.tone ? { attrs: { 'data-tone': chip.tone } } : {})
      });
      if (chip.swatch) {
        el.appendChild(
          h(this.doc, 'span', {
            class: 'prjs-toolbar-swatch',
            style: 'background:' + chip.swatch
          })
        );
      }
      el.appendChild(this.doc.createTextNode(chip.label));
      node.appendChild(el);
    }
  }

  setStatus(status: string | ToolbarChip[]): void {
    this.paintStatus(status);
  }

  setDisabled(id: string, disabled: boolean): void {
    const el = this.buttons.get(id);
    if (el) el.disabled = disabled;
  }

  setActive(id: string, active: boolean): void {
    const el = this.buttons.get(id);
    if (!el) return;
    if (active) {
      el.setAttribute('data-active', 'true');
      el.setAttribute('aria-pressed', 'true');
    } else {
      el.removeAttribute('data-active');
      el.removeAttribute('aria-pressed');
    }
  }
}

export interface ToolbarHandle {
  setStatus(status: string | ToolbarChip[]): void;
  setDisabled(id: string, disabled: boolean): void;
  /** marks a mode button as the one currently on */
  setActive(id: string, active: boolean): void;
  close(): void;
  readonly element: HTMLElement | null;
}

export function openToolbar(spec: ToolbarSpec, env?: Env): ToolbarHandle {
  const instance = new Toolbar(spec, {
    env: env || { document, window },
    trapFocus: false,
    // the tool that owns the toolbar decides what Escape means
    dismissOnEscape: false
  });
  instance.open();
  return {
    setStatus: (s) => instance.setStatus(s),
    setDisabled: (id, d) => instance.setDisabled(id, d),
    setActive: (id, a) => instance.setActive(id, a),
    close: () => instance.close(),
    get element() {
      return instance.element;
    }
  };
}

/** Icon-only overflow trigger, for a bar with more controls than room. */
export function overflowButton(doc: Document, onSelect: () => void): HTMLButtonElement {
  const el = button(doc, {
    label: '',
    tone: 'ghost',
    attrs: { 'aria-label': 'More tools', 'data-icon-only': '', 'data-prjs-act': 'overflow' },
    onClick: onSelect
  });
  el.appendChild(iconNode(doc, 'settings'));
  return el;
}
