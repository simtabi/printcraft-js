// A modal from a spec.
//
// Native `alert`, `confirm` and `prompt` are not used anywhere in this library.
// They block the event loop, cannot be styled or themed, are throttled or
// suppressed outright in cross-origin frames, and give no way to ask for more
// than one value.

import { button, h, root, type ButtonSpec } from './dom';
import { tooltip } from './floating';
import { buildForm, type Field, type FieldValue, type FormHandle } from './form';
import { Surface, type SurfaceOptions } from './surface';
import type { Env } from '../../types';

export interface ModalAction extends Omit<ButtonSpec, 'onClick'> {
  id: string;
  /** run the form's validation before resolving. defaults to true for primary. */
  validates?: boolean;
  /** keep the modal open; the handler decides what happens next */
  keepOpen?: boolean;
}

export interface ModalSpec {
  title: string;
  /** a line under the title, for context the title cannot carry */
  description?: string;
  /** plain paragraphs, or nodes you built yourself */
  body?: string | string[] | Node;
  fields?: Field[];
  actions?: ModalAction[];
  size?: 'sm' | 'md' | 'lg' | 'full';
  /** clicking the backdrop or pressing Escape closes. default true. */
  dismissible?: boolean;
  icon?: string;
}

export interface ModalResult {
  /** the action taken, or null when dismissed */
  action: string | null;
  values: Record<string, FieldValue>;
}

class Modal extends Surface {
  private form: FormHandle | null = null;
  private settle: ((result: ModalResult) => void) | null = null;
  private answered = false;

  constructor(
    private readonly spec: ModalSpec,
    options: SurfaceOptions
  ) {
    super(options);
  }

  protected build(): HTMLElement {
    const doc = this.doc;
    const spec = this.spec;
    const titleId = 'prjs-m-title-' + Math.random().toString(36).slice(2, 8);

    const panel = h(doc, 'div', {
      class: 'prjs-modal-box',
      attrs: {
        'data-size': spec.size || 'md',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': titleId
      }
    });

    const heading = h(doc, 'div', { class: 'prjs-modal-head' });
    const titles = h(doc, 'div', { style: 'flex:1' });
    titles.appendChild(
      h(doc, 'h2', { class: 'prjs-title', text: spec.title, attrs: { id: titleId } })
    );
    if (spec.description) {
      titles.appendChild(h(doc, 'p', { class: 'prjs-sub', text: spec.description }));
    }
    heading.appendChild(titles);

    // an icon-only corner button, not a second text button. a modal that offered
    // "Close" up here and "OK" down there read as two different things and was
    // one thing.
    if (spec.dismissible !== false) {
      const dismiss = button(doc, {
        label: '',
        tone: 'ghost',
        icon: 'close',
        attrs: {
          'aria-label': 'Close',
          'data-size': 'sm',
          'data-icon-only': '',
          'data-prjs-modal-close': ''
        },
        onClick: () => this.finish(null)
      });
      heading.appendChild(dismiss);
      this.addCleanup(
        tooltip(dismiss, { text: 'Close', keys: 'Esc', side: 'left' }, this.options.env)
      );
    }
    panel.appendChild(heading);

    // built either way, appended only if it took something. an empty body is a
    // 36px band of nothing between the title and the buttons.
    const body = h(doc, 'div', { class: 'prjs-modal-body' });
    let filled = false;

    if (typeof spec.body === 'string') {
      if (spec.body.trim()) {
        body.appendChild(h(doc, 'p', { text: spec.body }));
        filled = true;
      }
    } else if (Array.isArray(spec.body)) {
      for (const line of spec.body) {
        if (!line.trim()) continue;
        body.appendChild(h(doc, 'p', { text: line }));
        filled = true;
      }
    } else if (spec.body) {
      body.appendChild(spec.body);
      filled = true;
    }

    if (spec.fields?.length) {
      this.form = buildForm(doc, spec.fields);
      body.appendChild(this.form.element);
      filled = true;
    }
    if (filled) panel.appendChild(body);

    const actions = spec.actions?.length
      ? spec.actions
      : ([{ id: 'ok', label: 'OK', tone: 'primary' }] as ModalAction[]);

    const foot = h(doc, 'div', { class: 'prjs-modal-action' });
    for (const action of actions) {
      foot.appendChild(
        button(doc, {
          label: action.label,
          tone: action.tone,
          icon: action.icon,
          disabled: action.disabled,
          attrs: { 'data-prjs-action': action.id },
          onClick: () => this.choose(action)
        })
      );
    }
    panel.appendChild(foot);

    const scrim = root(doc, 'div', { class: 'prjs-scrim', attrs: { 'data-prjs-modal': '' } });
    scrim.appendChild(panel);

    if (spec.dismissible !== false) {
      scrim.addEventListener('mousedown', (ev) => {
        // only a click on the backdrop itself, not one that started inside and
        // drifted out while selecting text
        if (ev.target === scrim) this.finish(null);
      });
    }
    // a submit inside the body should do what the primary action does
    scrim.addEventListener('keydown', (ev) => {
      const key = (ev as KeyboardEvent).key;
      const target = ev.target as HTMLElement | null;
      if (key !== 'Enter' || target?.tagName === 'TEXTAREA') return;
      const primary = actions.find((a) => a.tone === 'primary');
      if (primary) {
        ev.preventDefault();
        this.choose(primary);
      }
    });

    return scrim;
  }

  protected override mounted(): void {
    if (this.form) this.form.focusFirst();
  }

  private choose(action: ModalAction): void {
    const validates = action.validates ?? action.tone === 'primary';
    if (validates && this.form && !this.form.validate()) return;
    if (action.keepOpen) {
      this.settle?.({ action: action.id, values: this.form?.values() || {} });
      return;
    }
    this.finish(action.id);
  }

  private finish(action: string | null): void {
    if (this.answered) return;
    this.answered = true;
    const values = this.form?.values() || {};
    this.close();
    this.settle?.({ action, values });
  }

  result(): Promise<ModalResult> {
    return new Promise((resolve) => {
      this.settle = resolve;
    });
  }

  protected override unmounting(): void {
    // escape and backdrop both route through close(), so honour them here too
    if (!this.answered) {
      this.answered = true;
      const values = this.form?.values() || {};
      queueMicrotask(() => this.settle?.({ action: null, values }));
    }
  }
}

/** Opens a modal and resolves with the action taken and the field values. */
export function modal(spec: ModalSpec, env?: Env): Promise<ModalResult> {
  const scope = env || { document, window };
  const instance = new Modal(spec, {
    env: scope,
    dismissOnEscape: spec.dismissible !== false
  });
  const result = instance.result();
  instance.open();
  return result;
}

/** Asks for a single line of text. What `window.prompt` was for. */
export async function promptFor(
  spec: {
    title: string;
    label: string;
    value?: string;
    hint?: string;
    placeholder?: string;
    multiline?: boolean;
  },
  env?: Env
): Promise<string | null> {
  const result = await modal(
    {
      title: spec.title,
      size: 'sm',
      fields: [
        {
          type: spec.multiline ? 'textarea' : 'text',
          name: 'value',
          label: spec.label,
          value: spec.value || '',
          placeholder: spec.placeholder,
          hint: spec.hint
        }
      ],
      actions: [
        { id: 'cancel', label: 'Cancel', tone: 'ghost' },
        { id: 'save', label: 'Save', tone: 'primary' }
      ]
    },
    env
  );

  if (result.action !== 'save') return null;
  return String(result.values['value'] ?? '');
}
