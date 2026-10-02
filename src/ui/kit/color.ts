// The colour control.
//
// `<input type="color">` cannot do alpha anywhere it matters yet — the `alpha`
// attribute landed in Safari 18.4 and recent Chromium and is still not baseline
// — and a print annotation needs it: a highlighter at full opacity is a marker
// pen, and the difference is whether you can read what is underneath.
//
// So Coloris does the picking. It is 5.4 kB, has no dependencies of its own, and
// attaches to an ordinary text input, which is what lets it sit inside the form
// system and inherit the label, hint, validation and error handling rather than
// being a widget bolted beside one.
//
// It is loaded on demand. Most jobs never open a colour control, and a modal
// asking for a page margin should not carry a colour picker.

import { COLORIS_CSS } from './coloris-css';
import { h } from './dom';

/** What a colour field can be told. */
export interface ColorSpec {
  value?: string;
  /** offer an opacity channel. on by default; a page border does not want one. */
  alpha?: boolean;
  /** the row of one-click colours under the field */
  swatches?: string[];
  /** what the field is called, for the error message */
  label?: string;
}

/** Sensible defaults: legible on white paper, and separable in greyscale. */
export const DEFAULT_SWATCHES = [
  '#dc2626',
  '#d97706',
  '#15803d',
  '#1d4ed8',
  '#7c3aed',
  '#111827',
  '#ffffff'
];

/** What a screen reader says for a swatch, instead of six hex digits. */
const NAMES: Record<string, string> = {
  '#dc2626': 'Red',
  '#d97706': 'Amber',
  '#15803d': 'Green',
  '#1d4ed8': 'Blue',
  '#7c3aed': 'Violet',
  '#111827': 'Black',
  '#ffffff': 'White'
};

let loading: Promise<unknown> | null = null;

/**
 * Loads Coloris once per page and points it at our fields.
 *
 * The `el` selector is ours alone, so it never adopts an input belonging to the
 * host page. Its stylesheet is bundled rather than fetched, which is what keeps
 * the standalone `file://` demo working with no network.
 */
function ensureColorisCss(doc: Document): void {
  const id = 'prjs-coloris-style';
  if (doc.getElementById(id)) return;

  const style = doc.createElement('style');
  style.id = id;
  // ours, so `keepSourceCSS` skips it and a clip job strips it out of its own
  // screenshot along with everything else the interface drew
  style.setAttribute('data-prjs-ui', '');
  style.textContent = COLORIS_CSS;
  (doc.head || doc.documentElement).appendChild(style);
}

async function ensureColoris(doc: Document): Promise<void> {
  ensureColorisCss(doc);
  if (!loading) {
    loading = import('@melloware/coloris').then((mod) => {
      const coloris = (mod as { default?: unknown }).default ?? mod;
      const api = coloris as {
        init(): void;
        coloris(o: Record<string, unknown>): void;
      };
      api.init();
      return api;
    });
    // a failure is not remembered: the next field tries again rather than the
    // page going without a picker until it reloads
    loading.catch(() => {
      loading = null;
    });
  }

  const api = (await loading) as {
    coloris(o: Record<string, unknown>): void;
    setInstance?(selector: string, o: Record<string, unknown>): void;
  };
  api.coloris({
    el: '.prjs-color-input',
    parent: (doc.body || doc.documentElement) as unknown as string,
    themeMode: 'auto',
    alpha: true,
    format: 'rgb',
    formatToggle: true,
    clearButton: false,
    swatchesOnly: false,
    focusInput: false,
    selectInput: false
  });
  // per field: one that asked for no opacity channel gets none
  api.setInstance?.('.prjs-color-input[data-alpha="false"]', { alpha: false });
}

/**
 * The field's markup: a text input Coloris takes over, plus swatches.
 *
 * The swatches are ours rather than Coloris's own. Its `swatches` option puts
 * them inside the popup, which means two clicks to reach a colour somebody uses
 * every time; on the field they are one.
 */
export function buildColorField(
  doc: Document,
  id: string,
  spec: ColorSpec
): { element: HTMLElement; input: HTMLInputElement } {
  const wrap = h(doc, 'div', { class: 'prjs-color-field' });

  const row = h(doc, 'div', { class: 'prjs-color-row' });
  const input = h(doc, 'input', {
    class: 'prjs-input prjs-color-input',
    attrs: {
      id,
      type: 'text',
      spellcheck: 'false',
      autocomplete: 'off',
      'data-prjs-color': '',
      ...(spec.alpha === false ? { 'data-alpha': 'false' } : {})
    }
  }) as HTMLInputElement;
  input.value = spec.value || DEFAULT_SWATCHES[0]!;
  row.appendChild(input);
  wrap.appendChild(row);

  const swatches = spec.swatches ?? DEFAULT_SWATCHES;
  if (swatches.length) {
    const strip = h(doc, 'div', {
      class: 'prjs-swatches',
      attrs: { role: 'group', 'aria-label': (spec.label || 'Colour') + ' swatches' }
    });
    for (const colour of swatches) {
      const dot = h(doc, 'button', {
        class: 'prjs-swatch',
        attrs: {
          type: 'button',
          'aria-label': NAMES[colour.toLowerCase()] || 'Colour ' + colour,
          'data-prjs-swatch': colour,
          style: '--prjs-swatch: ' + colour
        }
      });
      dot.addEventListener('click', () => {
        input.value = colour;
        input.dispatchEvent(
          new (doc.defaultView as Window & typeof globalThis).Event('input', { bubbles: true })
        );
        input.dispatchEvent(
          new (doc.defaultView as Window & typeof globalThis).Event('change', { bubbles: true })
        );
      });
      strip.appendChild(dot);
    }
    wrap.appendChild(strip);
  }

  // the picker is attached after the field is in the document; Coloris binds by
  // selector and needs the node to exist
  queueMicrotask(() => {
    void ensureColoris(doc).catch(() => {
      // no picker is survivable — the field is a text input and a typed
      // `rgba(…)` is still a colour. losing the swatches would not be.
      input.setAttribute('data-prjs-color-fallback', '');
    });
  });

  return { element: wrap, input };
}

/* parsing ----------------------------------------------------------------- */

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNCTIONAL = /^(?:rgba?|hsla?|color)\(/i;

type CssHost = { CSS?: { supports?(property: string, value: string): boolean } };

/**
 * Whether a string is a colour we can hand to SVG. Named colours included.
 *
 * The browser's own parser decides, because only it knows: a shape test passed
 * `rgb(nope)` for starting with `rgb(` and `notacolor` for being one word, and
 * an svg handed either draws no ink at all. The shapes are the fallback for a
 * host with no `CSS` object to ask.
 */
export function isColor(value: string, win?: CssHost | null): boolean {
  const v = value.trim();
  if (!v) return false;
  const css = (win || (globalThis as CssHost)).CSS;
  if (typeof css?.supports === 'function') return css.supports('color', v);
  return HEX.test(v) || FUNCTIONAL.test(v) || /^[a-z]+$/i.test(v);
}

/** The field's validator, so a typed value is checked like any other. */
export function validateColor(
  value: unknown,
  label = 'That',
  /** the window whose css parser to ask; the global one otherwise */
  win?: CssHost | null
): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  return isColor(value, win) ? null : label + ' is not a colour Printcraft understands';
}

/** The same colour at full opacity, for a swatch that should show its hue. */
export function opaque(value: string): string {
  const rgba = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(value.trim());
  if (rgba) return 'rgb(' + rgba[1] + ',' + rgba[2] + ',' + rgba[3] + ')';
  const hex = /^#([0-9a-f]{6})[0-9a-f]{2}$/i.exec(value.trim());
  if (hex) return '#' + hex[1];
  return value;
}
