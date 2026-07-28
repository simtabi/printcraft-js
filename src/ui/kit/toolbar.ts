// The floating bar the picker and the region tool share.
//
// Data-driven like everything else here: a status line that can be updated and
// a list of buttons, so a new mode is a spec rather than another DOM builder.

import { button, h, root, type ButtonSpec } from './dom';
import { Surface, type SurfaceOptions } from './surface';
import type { Env } from '../../types';

export interface ToolbarAction extends Omit<ButtonSpec, 'onClick'> {
  id: string;
  onSelect: () => void;
}

export interface ToolbarSpec {
  status?: string;
  actions: ToolbarAction[];
  label?: string;
}

class Toolbar extends Surface {
  private statusNode: HTMLElement | null = null;
  private buttons = new Map<string, HTMLButtonElement>();

  constructor(
    private readonly spec: ToolbarSpec,
    options: SurfaceOptions
  ) {
    super(options);
  }

  protected build(): HTMLElement {
    const doc = this.doc;
    const bar = root(doc, 'div', {
      class: 'pc-k-toolbar',
      attrs: { role: 'toolbar', 'data-pc-toolbar': '', 'aria-label': this.spec.label || 'Tools' }
    });

    this.statusNode = h(doc, 'span', {
      class: 'pc-k-toolbar-status',
      text: this.spec.status || '',
      attrs: { 'data-pc-status': '', 'aria-live': 'polite' }
    });
    bar.appendChild(this.statusNode);

    for (const action of this.spec.actions) {
      const el = button(doc, {
        label: action.label,
        tone: action.tone,
        icon: action.icon,
        disabled: action.disabled,
        attrs: { 'data-pc-act': action.id },
        onClick: () => action.onSelect()
      });
      this.buttons.set(action.id, el);
      bar.appendChild(el);
    }
    return bar;
  }

  setStatus(text: string): void {
    if (this.statusNode) this.statusNode.textContent = text;
  }

  setDisabled(id: string, disabled: boolean): void {
    const el = this.buttons.get(id);
    if (el) el.disabled = disabled;
  }
}

export interface ToolbarHandle {
  setStatus(text: string): void;
  setDisabled(id: string, disabled: boolean): void;
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
    setStatus: (t) => instance.setStatus(t),
    setDisabled: (id, d) => instance.setDisabled(id, d),
    close: () => instance.close(),
    get element() {
      return instance.element;
    }
  };
}
