// Fields from a schema.
//
// One renderer serves the email composer, the print-settings panel and the
// redaction review, which is the point: a new dialog is a data structure, not
// another pile of createElement calls.

import { buildColorField, validateColor } from './color';
import { h } from './dom';

export type FieldValue = string | number | boolean | string[];

interface BaseField {
  name: string;
  label: string;
  hint?: string;
  required?: boolean;
  disabled?: boolean;
  /** shown only when this returns true for the current values */
  when?: (values: Record<string, FieldValue>) => boolean;
  /** return a message to mark the field invalid */
  validate?: (value: FieldValue, values: Record<string, FieldValue>) => string | null;
}

export type Field =
  | (BaseField & { type: 'text' | 'email' | 'url'; value?: string; placeholder?: string })
  | (BaseField & { type: 'textarea'; value?: string; placeholder?: string; rows?: number })
  | (BaseField & { type: 'number'; value?: number; min?: number; max?: number; step?: number })
  | (BaseField & { type: 'checkbox'; value?: boolean })
  | (BaseField & {
      type: 'color';
      value?: string;
      /** offer an opacity channel. on by default. */
      alpha?: boolean;
      /** one-click colours under the field */
      swatches?: string[];
    })
  | (BaseField & {
      type: 'range';
      value?: number;
      min?: number;
      max?: number;
      step?: number;
      /** printed after the live readout: px, mm, % */
      unit?: string;
    })
  | (BaseField & { type: 'length'; value?: string; placeholder?: string })
  | (BaseField & {
      type: 'select' | 'radio';
      value?: string;
      choices: Array<{ value: string; label: string }>;
    });

export interface FormHandle {
  element: HTMLElement;
  values(): Record<string, FieldValue>;
  /** true when everything validates; marks and focuses the first problem when not */
  validate(): boolean;
  focusFirst(): void;
}

const TEXTUAL = new Set(['text', 'email', 'url', 'length']);

/** A css length, which is what page margins, borders and padding all take. */
const LENGTH = /^-?\d*\.?\d+(px|pt|pc|in|cm|mm|q|em|rem|%)?$/i;

export function buildForm(doc: Document, fields: Field[]): FormHandle {
  const form = h(doc, 'div', { class: 'prjs-form' });
  const inputs = new Map<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>();
  const wrappers = new Map<string, HTMLElement>();
  const errors = new Map<string, HTMLElement>();
  const radios = new Map<string, HTMLInputElement[]>();

  const read = (): Record<string, FieldValue> => {
    const values: Record<string, FieldValue> = {};
    for (const field of fields) {
      if (field.type === 'radio') {
        const picked = (radios.get(field.name) || []).find((r) => r.checked);
        values[field.name] = picked ? picked.value : '';
        continue;
      }
      const el = inputs.get(field.name);
      if (!el) continue;
      if (field.type === 'checkbox') values[field.name] = (el as HTMLInputElement).checked;
      else if (field.type === 'number') values[field.name] = Number(el.value);
      else values[field.name] = el.value;
    }
    return values;
  };

  /** fields with a `when` appear and disappear as the values around them change */
  const applyVisibility = (): void => {
    const values = read();
    for (const field of fields) {
      const wrapper = wrappers.get(field.name);
      if (!wrapper) continue;
      const visible = !field.when || field.when(values);
      wrapper.hidden = !visible;
    }
  };

  const setError = (name: string, message: string | null): void => {
    const slot = errors.get(name);
    const input = inputs.get(name);
    if (slot) {
      slot.textContent = message || '';
      slot.hidden = !message;
    }
    if (input) {
      if (message) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    }
  };

  for (const field of fields) {
    const id = 'prjs-f-' + field.name;
    const wrapper = h(doc, 'div', { class: 'prjs-field' });
    const errorSlot = h(doc, 'span', {
      class: 'prjs-error',
      attrs: { hidden: true, role: 'alert' }
    });

    if (field.type === 'checkbox') {
      const input = h(doc, 'input', {
        class: 'prjs-checkbox',
        attrs: { type: 'checkbox', id, disabled: field.disabled }
      }) as HTMLInputElement;
      input.checked = !!field.value;
      inputs.set(field.name, input);

      const label = h(doc, 'label', { class: 'prjs-label prjs-check', attrs: { for: id } });
      label.appendChild(input);
      label.appendChild(doc.createTextNode(field.label));
      wrapper.appendChild(label);
    } else if (field.type === 'radio') {
      const group = h(doc, 'div', { attrs: { role: 'radiogroup', 'aria-label': field.label } });
      group.appendChild(h(doc, 'span', { class: 'prjs-label', text: field.label }));
      const buttons: HTMLInputElement[] = [];

      field.choices.forEach((choice, i) => {
        const rid = id + '-' + i;
        const input = h(doc, 'input', {
          class: 'prjs-radio',
          attrs: { type: 'radio', id: rid, name: field.name, value: choice.value }
        }) as HTMLInputElement;
        input.checked = field.value === choice.value;
        buttons.push(input);

        const label = h(doc, 'label', { class: 'prjs-check', attrs: { for: rid } });
        label.appendChild(input);
        label.appendChild(doc.createTextNode(choice.label));
        group.appendChild(label);
      });
      radios.set(field.name, buttons);
      wrapper.appendChild(group);
    } else {
      wrapper.appendChild(
        h(doc, 'label', { class: 'prjs-label', text: field.label, attrs: { for: id } })
      );

      let input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
      if (field.type === 'textarea') {
        input = h(doc, 'textarea', {
          class: 'prjs-textarea',
          attrs: {
            id,
            rows: field.rows || 4,
            placeholder: field.placeholder,
            disabled: field.disabled
          }
        });
        input.value = field.value || '';
      } else if (field.type === 'select') {
        input = h(doc, 'select', { class: 'prjs-select', attrs: { id, disabled: field.disabled } });
        for (const choice of field.choices) {
          const option = h(doc, 'option', { text: choice.label, attrs: { value: choice.value } });
          input.appendChild(option);
        }
        input.value = field.value || field.choices[0]?.value || '';
      } else if (field.type === 'color') {
        // Coloris takes over a text input, so the field keeps the label, the
        // hint and the error slot every other field has
        const built = buildColorField(doc, id, {
          value: field.value ?? '',
          ...(field.alpha === undefined ? {} : { alpha: field.alpha }),
          ...(field.swatches ? { swatches: field.swatches } : {}),
          label: field.label
        });
        input = built.input;
        inputs.set(field.name, input);
        wrapper.appendChild(built.element);
        if (field.hint)
          wrapper.appendChild(h(doc, 'span', { class: 'prjs-hint', text: field.hint }));
        wrapper.appendChild(errorSlot);
        errors.set(field.name, errorSlot);
        wrappers.set(field.name, wrapper);
        form.appendChild(wrapper);
        continue;
      } else if (field.type === 'range') {
        const row = h(doc, 'div', { class: 'prjs-range-row' });
        input = h(doc, 'input', {
          class: 'prjs-range',
          attrs: {
            id,
            type: 'range',
            min: field.min ?? 0,
            max: field.max ?? 100,
            step: field.step ?? 1,
            disabled: field.disabled
          }
        });
        input.value = String(field.value ?? field.min ?? 0);
        row.appendChild(input);

        // a slider with no number is a slider you cannot describe to anyone
        const readout = h(doc, 'output', {
          class: 'prjs-range-value',
          attrs: { for: id },
          text: input.value + (field.unit || '')
        });
        input.addEventListener('input', () => {
          readout.textContent = (input as HTMLInputElement).value + (field.unit || '');
        });
        row.appendChild(readout);

        inputs.set(field.name, input);
        wrapper.appendChild(row);
        if (field.hint)
          wrapper.appendChild(h(doc, 'span', { class: 'prjs-hint', text: field.hint }));
        wrapper.appendChild(errorSlot);
        errors.set(field.name, errorSlot);
        wrappers.set(field.name, wrapper);
        form.appendChild(wrapper);
        continue;
      } else {
        const type = field.type === 'number' ? 'number' : 'text';
        input = h(doc, 'input', {
          class: 'prjs-input',
          attrs: {
            id,
            type: field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : type,
            placeholder: 'placeholder' in field ? field.placeholder : undefined,
            min: field.type === 'number' ? field.min : undefined,
            max: field.type === 'number' ? field.max : undefined,
            step: field.type === 'number' ? field.step : undefined,
            disabled: field.disabled
          }
        });
        input.value = field.value == null ? '' : String(field.value);
      }

      inputs.set(field.name, input);
      wrapper.appendChild(input);
    }

    if (field.hint) wrapper.appendChild(h(doc, 'span', { class: 'prjs-hint', text: field.hint }));
    wrapper.appendChild(errorSlot);
    errors.set(field.name, errorSlot);
    wrappers.set(field.name, wrapper);
    form.appendChild(wrapper);
  }

  // clearing an error as soon as it is addressed beats leaving it until submit
  for (const [name, input] of inputs) {
    input.addEventListener('input', () => {
      setError(name, null);
      applyVisibility();
    });
    input.addEventListener('change', applyVisibility);
  }
  for (const group of radios.values()) {
    for (const input of group) input.addEventListener('change', applyVisibility);
  }
  applyVisibility();

  return {
    element: form,
    values: read,

    validate(): boolean {
      const values = read();
      let firstBad: string | null = null;

      for (const field of fields) {
        if (wrappers.get(field.name)?.hidden) continue;
        const value = values[field.name];
        let message: string | null = null;

        const empty = value == null || value === '' || (Array.isArray(value) && value.length === 0);
        if (field.required && (empty || value === false)) {
          message = field.label + ' is required';
        } else if (!empty && TEXTUAL.has(field.type) && field.type === 'email') {
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value)))
            message = 'That is not an email address';
        } else if (!empty && field.type === 'length' && !LENGTH.test(String(value))) {
          message = 'Use a css length, like 18mm or 24px';
        } else if (!empty && field.type === 'color') {
          // a colour can be typed as well as picked, and a typo should be caught
          // here rather than by an svg silently drawing nothing
          message = validateColor(value, field.label, doc.defaultView);
        }
        if (!message && field.validate) message = field.validate(value as FieldValue, values);

        setError(field.name, message);
        if (message && !firstBad) firstBad = field.name;
      }

      if (firstBad) {
        (inputs.get(firstBad) || radios.get(firstBad)?.[0])?.focus();
        return false;
      }
      return true;
    },

    focusFirst(): void {
      for (const field of fields) {
        if (wrappers.get(field.name)?.hidden) continue;
        const el = inputs.get(field.name) || radios.get(field.name)?.[0];
        if (el) {
          el.focus();
          return;
        }
      }
    }
  };
}
