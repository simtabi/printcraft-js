// Design tokens for everything the UI layer draws.
//
// One stylesheet per document, built from custom properties, so a host can
// restyle the kit by setting a handful of variables instead of fighting inline
// styles with `!important`.
//
// The tokens follow the shape the current generation of component libraries
// settled on — a neutral ramp, semantic tones that each carry a background, a
// foreground and a border, a focus ring drawn as a ring rather than an outline,
// and one spacing step everything is a multiple of. That is not fashion: a
// button, a menu item and a toast that share a tone stay visually related when a
// host changes one variable, which is the whole reason to have tokens at all.
//
// It is our own css, not utility classes. Printcraft has to work on a page that
// has never heard of a build step, and a library that only looks right inside
// somebody else's framework is not a library.

import { DAISYUI_CSS } from './daisyui-css';
import { NS } from '../../support';

/** A semantic tone: what it sits on, what it draws in, and what it is edged with. */
export interface Tone {
  bg: string;
  fg: string;
  border: string;
  /** the same tone at low opacity, for a hover or a selected row */
  soft: string;
}

/**
 * A tone, or just its colour.
 *
 * `primary: '#7c3aed'` is the common case and should not require knowing that a
 * tone has four parts. The border follows the background and the soft variant is
 * derived from it; pass the object when you want to say otherwise.
 */
export type ToneInput = string | Partial<Tone>;

/** Fills in the parts of a tone that were not given. */
function toTone(input: ToneInput | undefined, fallback: Tone): Tone {
  if (!input) return fallback;
  if (typeof input === 'string') {
    return { bg: input, fg: fallback.fg, border: input, soft: fade(input) };
  }
  const bg = input.bg ?? fallback.bg;
  return {
    bg,
    fg: input.fg ?? fallback.fg,
    border: input.border ?? bg,
    soft: input.soft ?? (input.bg ? fade(bg) : fallback.soft)
  };
}

/** The same colour at one-tenth strength, for a hover or a selected row. */
function fade(color: string): string {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!hex) return 'color-mix(in srgb, ' + color + ' 10%, transparent)';
  let body = hex[1]!;
  if (body.length === 3) body = body[0]! + body[0]! + body[1]! + body[1]! + body[2]! + body[2]!;
  const n = parseInt(body, 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',.10)';
}

/** The eight semantic colours, in daisyUI's order. */
export const TONES = [
  'primary',
  'secondary',
  'accent',
  'neutral',
  'info',
  'success',
  'warning',
  'error'
] as const;

export type ToneKey = (typeof TONES)[number];

/** What the old two-tone names mean now. */
const TONE_ALIASES = { danger: 'error', warn: 'warning' } as const;

export interface Theme {
  /* the base ramp. daisyUI's names: 100 is the page, 200 and 300 step away from
     it, and `baseContent` is what you write on all three. */
  base100: string;
  base200: string;
  base300: string;
  baseContent: string;

  /* two steps of quieter text, and a rule lighter than base300. daisyUI derives
     these with color-mix; we name them, because a menu hint and a separator are
     used often enough to be worth a token each. */
  inkSoft: string;
  inkFaint: string;
  ruleSoft: string;

  /* the eight semantic tones. a bare colour string is enough; see ToneInput. */
  primary: ToneInput;
  secondary: ToneInput;
  accent: ToneInput;
  neutral: ToneInput;
  info: ToneInput;
  success: ToneInput;
  warning: ToneInput;
  error: ToneInput;

  /** an alias for `error`, which is what this was called before */
  danger?: ToneInput;
  /** an alias for `warning` */
  warn?: ToneInput;

  /* shape. daisyUI's three radii: selectors are badges, checkboxes and chips;
     fields are buttons and inputs; boxes are cards, modals and menus. */
  radiusSelector: string;
  radiusField: string;
  radiusBox: string;
  /** the step every gap and pad is a multiple of. daisyUI's `--size-field`. */
  sizeField: string;
  /** the same step for badges, checkboxes and chips. daisyUI's `--size-selector`. */
  sizeSelector: string;
  /** border width, so a flat theme can set it to 0 */
  borderWidth: string;
  /** 1 gives buttons and inputs a raised edge, 0 keeps them flat */
  depth: 0 | 1;
  /** 1 lays a faint grain over solid surfaces, 0 leaves them plain */
  noise: 0 | 1;

  /* type */
  font: string;
  fontMono: string;

  /* depth */
  shadow: string;
  shadowSm: string;
  /** width of the focus ring, and the gap between it and the element */
  ring: string;
  ringOffset: string;

  /**
   * The base layer everything the kit draws sits on.
   *
   * Offsets go up to +70, and `z-index` is a 32-bit signed integer: anything
   * over 2147483647 is clamped to it. The default used to be 2147483600, which
   * left 47 of headroom — so the toolbar, the modal scrim, the menu and the
   * toasts all clamped to the same number and their order quietly became the
   * order they happened to be appended in. Leave room for the whole stack.
   */
  z: number;

  /**
   * Follow the host page into dark mode. `light` and `dark` pin one palette;
   * `auto` follows `prefers-color-scheme`.
   */
  colorScheme?: 'auto' | 'light' | 'dark';
}

/** A solid tone: white text on the colour, and the colour at a tenth for hovers. */
function solid(bg: string, fg = '#ffffff'): Tone {
  return { bg, fg, border: bg, soft: fade(bg) };
}

export const DEFAULT_THEME: Theme = {
  base100: '#ffffff',
  base200: '#f5f5f3',
  base300: '#d8d8d3',
  baseContent: '#17181b',

  inkSoft: '#55575e',
  inkFaint: '#8a8c93',
  ruleSoft: '#ececea',

  primary: solid('#0f766e'),
  secondary: solid('#4338ca'),
  accent: solid('#a21caf'),
  neutral: solid('#2a2e37'),
  info: solid('#1d4ed8'),
  success: solid('#15803d'),
  warning: solid('#b45309'),
  error: solid('#b91c1c'),

  radiusSelector: '5px',
  radiusField: '8px',
  radiusBox: '12px',
  sizeField: '4px',
  sizeSelector: '4px',
  borderWidth: '1px',
  depth: 0,
  noise: 0,

  font: '13px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  fontMono: '12px/1.45 ui-monospace, Consolas, Menlo, monospace',

  shadow: '0 12px 40px -8px rgba(15, 18, 25, .28), 0 2px 8px -2px rgba(15, 18, 25, .12)',
  shadowSm: '0 4px 14px -4px rgba(15, 18, 25, .20)',
  ring: '2px',
  ringOffset: '2px',

  z: 2147483000,
  colorScheme: 'auto'
};

/**
 * The dark palette.
 *
 * Only the base ramp and the tone lightness move. A tone stays the same hue, so
 * a danger button is recognisably the same button in either scheme.
 */
const DARK: { base: Record<string, string>; tones: Record<ToneKey, [string, string]> } = {
  base: {
    base100: '#1c1d21',
    base200: '#252629',
    base300: '#3a3b41',
    baseContent: '#f2f2f0',
    inkSoft: '#a8aab2',
    inkFaint: '#74767e',
    ruleSoft: '#2e2f34'
  },
  tones: {
    primary: ['#2dd4bf', '#08322e'],
    secondary: ['#a5b4fc', '#1e1b4b'],
    accent: ['#f0abfc', '#4a044e'],
    neutral: ['#9ca3af', '#111318'],
    info: ['#93b4fd', '#0b1f4d'],
    success: ['#4ade80', '#062b14'],
    warning: ['#fbbf24', '#3a2606'],
    error: ['#f87171', '#3d0a0a']
  }
};

/**
 * One tone, resolved.
 *
 * `danger` and `warn` are what `error` and `warning` used to be called, so a
 * host that set either still gets the colour it asked for.
 */
function resolveTone(t: Theme, name: ToneKey): Tone {
  const base = toTone(DEFAULT_THEME[name], DEFAULT_THEME[name] as Tone);
  let tone = toTone(t[name], base);

  for (const [alias, target] of Object.entries(TONE_ALIASES)) {
    if (target === name && t[alias as 'danger' | 'warn']) {
      tone = toTone(t[alias as 'danger' | 'warn'], tone);
    }
  }
  return tone;
}

let current: Theme = { ...DEFAULT_THEME };

const STYLE_ID = 'prjs-kit-style';

/**
 * Merges overrides into the live theme and repaints any open surfaces.
 *
 * Setting a tone clears the older alias for it. Without that, a `danger` set
 * once could never be undone: the merge would keep it, and it wins over `error`,
 * so `set(defaults)` would appear to do nothing.
 */
export function setTheme(patch: Partial<Theme>, doc?: Document): Theme {
  const next: Theme = { ...current, ...patch };
  for (const [alias, target] of Object.entries(TONE_ALIASES)) {
    const key = alias as 'danger' | 'warn';
    if (patch[target] !== undefined && patch[key] === undefined) delete next[key];
  }
  current = next;

  const target = doc || (typeof document === 'undefined' ? null : document);
  if (target) {
    target.getElementById(STYLE_ID)?.remove();
    ensureStyles(target);
  }
  return current;
}

/** Back to the shipped tokens, deprecated aliases and all. */
export function resetTheme(doc?: Document): Theme {
  current = { ...DEFAULT_THEME };
  const target = doc || (typeof document === 'undefined' ? null : document);
  if (target) {
    target.getElementById(STYLE_ID)?.remove();
    ensureStyles(target);
  }
  return current;
}

export function getTheme(): Theme {
  return current;
}

/** The same eight tones under daisyUI's own variable names, for its css. */
function daisyToneVars(): string {
  return TONES.map(
    (name) =>
      '  --color-' +
      name +
      ': var(--prjs-color-' +
      name +
      ');\n  --color-' +
      name +
      '-content: var(--prjs-color-' +
      name +
      '-content);'
  ).join('\n');
}

/**
 * Every tone, emitted twice.
 *
 * `--prjs-color-primary` and `--prjs-color-primary-content` are daisyUI's names
 * and are the ones to set. The four short names beside them are what this
 * stylesheet actually reads, and they point at the daisyUI pair, so setting the
 * daisyUI variable alone moves everything drawn in that tone.
 */
function toneVars(t: Theme): string {
  const lines: string[] = [];

  for (const name of TONES) {
    const tone = resolveTone(t, name);
    lines.push(
      `  --prjs-color-${name}: ${tone.bg};`,
      `  --prjs-color-${name}-content: ${tone.fg};`,
      `  --prjs-${name}: var(--prjs-color-${name});`,
      `  --prjs-${name}-fg: var(--prjs-color-${name}-content);`,
      `  --prjs-${name}-border: ${tone.border};`,
      `  --prjs-${name}-soft: ${tone.soft};`
    );
  }

  // the names these two carried before daisyUI's took over
  for (const [alias, target] of Object.entries(TONE_ALIASES)) {
    for (const part of ['', '-fg', '-border', '-soft']) {
      lines.push(`  --prjs-${alias}${part}: var(--prjs-${target}${part});`);
    }
  }
  return lines.join('\n');
}

/**
 * Injects the kit stylesheet once per document.
 *
 * Everything the kit renders is class-based from here on, which is what makes
 * `setTheme` and host overrides work at all.
 */
export function ensureStyles(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return;

  const t = current;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.setAttribute('data-prjs-ui', '');
  style.textContent = sheet(t, doc).trim();
  (doc.head || doc.documentElement).appendChild(style);
}

/**
 * Whether this document's css engine can take the vendored stylesheet.
 *
 * jsdom cannot. daisyUI's select positions its chevron with
 * `background-position: calc(100% - 20px) calc(1px + 50%)`, and jsdom throws
 * resolving a calc that mixes a percentage with a length — not when the rule is
 * inserted, but later, inside the first `getComputedStyle` call that touches it,
 * which makes it look like a failure in whatever happened to ask.
 *
 * The declaration is correct css and browsers handle it, so the sheet is not
 * changed to suit an incomplete engine. It is simply not given to one. Anything
 * asserting on how these components *look* belongs in the browser suite, where
 * they are; what runs under jsdom is structure, and structure needs no
 * stylesheet.
 */
const vendorOk = new WeakMap<Document, boolean>();

function canParseVendorCss(doc: Document): boolean {
  const cached = vendorOk.get(doc);
  if (cached !== undefined) return cached;

  // the declaration has to be reached through a *rule*, not an inline style:
  // jsdom accepts it inline and only throws when resolving it for a rule, which
  // is why a cheaper probe passed and the sheet still brought the tests down
  let ok = false;
  const win = doc.defaultView;
  const style = doc.createElement('style');
  const probe = doc.createElement('div');

  try {
    if (win?.getComputedStyle) {
      style.textContent =
        '.prjs-vendor-probe{background-position:calc(100% - 20px) calc(1px + 50%)}';
      (doc.head || doc.documentElement).appendChild(style);
      probe.className = 'prjs-vendor-probe';
      (doc.body || doc.documentElement).appendChild(probe);
      // the throw happens in here
      ok = typeof win.getComputedStyle(probe).backgroundPosition === 'string';
    }
  } catch {
    ok = false;
  } finally {
    style.remove();
    probe.remove();
  }

  vendorOk.set(doc, ok);
  return ok;
}

/**
 * The whole stylesheet, in the order it cascades.
 *
 * Tokens first, then the reset, then **daisyUI's own component css** — every
 * class renamed to carry our prefix by `tools/vendor-daisyui.mjs` — and then our
 * own rules on top. That order is the point: daisyUI draws the buttons, inputs,
 * selects, ranges, checkboxes, modals, cards, badges, menus, alerts, tooltips
 * and toasts, and what follows is only the handful of things it has no component
 * for. A `.prjs-btn` is a daisyUI button now, not an imitation of one.
 */
function sheet(t: Theme, doc?: Document): string {
  return `
${tokens(t)}
${reset()}
${doc && !canParseVendorCss(doc) ? '' : DAISYUI_CSS}
${surfaces(t)}
${buttons()}
${menus(t)}
${floating()}
${forms()}
${palette()}
${chrome(t)}
`;
}

/* the layers ------------------------------------------------------------- */

function tokens(t: Theme): string {
  const dark = t.colorScheme === 'light' ? '' : darkBlock(t);
  return `
.prjs {
  /* the base ramp, under daisyUI's names */
  --prjs-color-base-100: ${t.base100};
  --prjs-color-base-200: ${t.base200};
  --prjs-color-base-300: ${t.base300};
  --prjs-color-base-content: ${t.baseContent};

  /* what this stylesheet reads. all of it points at the ramp above, so a host
     that sets only the daisyUI variables moves every surface we draw. */
  --prjs-paper: var(--prjs-color-base-100);
  --prjs-paper-raised: var(--prjs-color-base-100);
  --prjs-paper-dim: var(--prjs-color-base-200);
  --prjs-rule: var(--prjs-color-base-300);
  --prjs-ink: var(--prjs-color-base-content);
  --prjs-ink-soft: ${t.inkSoft};
  --prjs-ink-faint: ${t.inkFaint};
  --prjs-rule-soft: ${t.ruleSoft};
${toneVars(t)}

  /* daisyUI's three radii: selectors are badges and checkboxes, fields are
     buttons and inputs, boxes are cards, modals and menus */
  --prjs-radius-selector: ${t.radiusSelector};
  --prjs-radius-field: ${t.radiusField};
  --prjs-radius-box: ${t.radiusBox};
  --prjs-size-field: ${t.sizeField};
  --prjs-size-selector: ${t.sizeSelector};
  --prjs-border: ${t.borderWidth};
  --prjs-depth: ${t.depth};
  --prjs-noise: ${t.noise};

  --prjs-radius-sm: var(--prjs-radius-selector);
  --prjs-radius: var(--prjs-radius-field);
  --prjs-radius-lg: var(--prjs-radius-box);
  --prjs-unit: var(--prjs-size-field);

  /* daisyUI's component css reads these names. Declared here rather than on
     :root so they reach every rule inside our surfaces and nothing outside
     them — custom properties inherit downward only, so a host page's own
     --color-primary is neither read nor overwritten. */
  --color-base-100: var(--prjs-color-base-100);
  --color-base-200: var(--prjs-color-base-200);
  --color-base-300: var(--prjs-color-base-300);
  --color-base-content: var(--prjs-color-base-content);
${daisyToneVars()}
  --radius-selector: var(--prjs-radius-selector);
  --radius-field: var(--prjs-radius-field);
  --radius-box: var(--prjs-radius-box);
  --size-selector: var(--prjs-size-selector);
  --size-field: var(--prjs-size-field);
  --border: var(--prjs-border);
  --depth: var(--prjs-depth);
  --noise: var(--prjs-noise);
  --fx-noise: none;

  --prjs-mono: ${t.fontMono};
  --prjs-shadow: ${t.shadow};
  --prjs-shadow-sm: ${t.shadowSm};
  --prjs-ring: ${t.ring};
  --prjs-ring-offset: ${t.ringOffset};

  font: ${t.font};
  color: var(--prjs-ink);
  box-sizing: border-box;
  color-scheme: ${t.colorScheme === 'dark' ? 'dark' : t.colorScheme === 'light' ? 'light' : 'light dark'};
  -webkit-font-smoothing: antialiased;
}
${dark}`;
}

/**
 * A print tool sitting on a dark app should not be the one white rectangle.
 *
 * Only the daisyUI variables are restated. Everything else in the sheet reads
 * through them, so the whole kit follows from these lines alone.
 */
function darkBlock(t: Theme): string {
  const lines = [
    `  --prjs-color-base-100: ${DARK.base['base100']};`,
    `  --prjs-color-base-200: ${DARK.base['base200']};`,
    `  --prjs-color-base-300: ${DARK.base['base300']};`,
    `  --prjs-color-base-content: ${DARK.base['baseContent']};`,
    `  --prjs-ink-soft: ${DARK.base['inkSoft']};`,
    `  --prjs-ink-faint: ${DARK.base['inkFaint']};`,
    `  --prjs-rule-soft: ${DARK.base['ruleSoft']};`
  ];

  for (const name of TONES) {
    const [bg, fg] = DARK.tones[name];
    lines.push(
      `  --prjs-color-${name}: ${bg};`,
      `  --prjs-color-${name}-content: ${fg};`,
      `  --prjs-${name}-border: ${bg};`,
      `  --prjs-${name}-soft: ${fade(bg).replace('.10)', '.14)')};`
    );
  }
  lines.push('  --prjs-shadow: 0 12px 40px -8px rgba(0,0,0,.6), 0 2px 8px -2px rgba(0,0,0,.4);');

  const body = '\n' + lines.join('\n');
  if (t.colorScheme === 'dark') return `.prjs {${body}\n}`;
  return `@media (prefers-color-scheme: dark) {\n  .prjs {${body}\n  }\n}`;
}

/**
 * The kit renders into the host document, so the host's stylesheet reaches it.
 *
 * Framework resets are the problem: Tailwind's preflight sets
 * `img { max-width: 100% }`, which shrank the region preview to its container
 * and then the offset maths put what was left outside the visible box. Bootstrap
 * and normalize rewrite the form controls the same way. Re-state what the kit
 * assumes for the elements it builds, so a surface looks the same on any page.
 */
function reset(): string {
  return `
.prjs *, .prjs *::before, .prjs *::after { box-sizing: inherit; }
.prjs img, .prjs canvas { max-width: none; max-height: none; }
.prjs svg { max-width: none; max-height: none; display: inline-block; vertical-align: middle; }
.prjs button, .prjs input, .prjs select, .prjs textarea {
  font: inherit; color: inherit; letter-spacing: inherit; text-transform: none; margin: 0;
}
/* Tailwind preflight and Bootstrap both hide the native box and draw their own,
   which leaves ours invisible on their pages. This puts it back — but only for a
   control daisyUI is not already drawing, since its checkbox and radio need
   appearance:none and this rule outranks them on specificity. */
.prjs input[type="checkbox"]:not(.prjs-checkbox),
.prjs input[type="radio"]:not(.prjs-radio) {
  appearance: auto; -webkit-appearance: auto; position: static;
  width: auto; height: auto; opacity: 1; clip: auto;
}
.prjs input.prjs-checkbox, .prjs input.prjs-radio {
  position: static; opacity: 1; clip: auto;
}
.prjs p, .prjs h1, .prjs h2, .prjs h3, .prjs ul, .prjs ol, .prjs figure { margin: 0; }
.prjs ul, .prjs ol { padding: 0; list-style: none; }

/* anything the kit shows as a picture: fits its box, keeps its aspect.
   two classes deep so it outranks the reset above. */
.prjs .prjs-media { display: block; max-width: 100%; height: auto; }

.prjs-sr {
  position: absolute; width: 1px; height: 1px; overflow: hidden;
  clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap;
}`;
}

function surfaces(t: Theme): string {
  return `
.prjs-scrim {
  position: fixed; inset: 0; z-index: ${t.z + 55};
  background: rgba(16, 18, 24, .5);
  backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center;
  padding: 5vh 4vw;
}
@media (prefers-reduced-motion: no-preference) {
  .prjs-scrim { animation: prjs-fade 140ms ease-out; }
  .prjs-modal-box { animation: prjs-rise 160ms cubic-bezier(.16,1,.3,1); }
  .prjs-menu, .prjs-pop { animation: prjs-pop 110ms cubic-bezier(.16,1,.3,1); }
}
@keyframes prjs-fade { from { opacity: 0 } }
@keyframes prjs-rise { from { opacity: 0; transform: translateY(8px) scale(.98) } }
@keyframes prjs-pop { from { opacity: 0; transform: scale(.97) } }

.prjs-modal-box {
  background: var(--prjs-paper);
  border: 1px solid var(--prjs-rule-soft);
  border-radius: var(--prjs-radius-lg);
  box-shadow: var(--prjs-shadow);
  max-height: 100%;
  display: flex; flex-direction: column; overflow: hidden;
}
.prjs-modal-box[data-size="sm"] { width: 380px }
.prjs-modal-box[data-size="md"] { width: 540px }
.prjs-modal-box[data-size="lg"] { width: 780px }
.prjs-modal-box[data-size="full"] { width: 100%; height: 100% }

.prjs-modal-head {
  display: flex; align-items: flex-start; gap: 12px;
  padding: 16px 18px 14px;
  border-bottom: 1px solid var(--prjs-rule-soft);
}
.prjs-modal-head-text { flex: 1; min-width: 0 }
.prjs-title { font-weight: 600; font-size: 15px; margin: 0; letter-spacing: -.01em }
.prjs-sub { color: var(--prjs-ink-soft); font-size: 12.5px; margin: 3px 0 0 }
.prjs-modal-head-icon {
  flex: none; display: grid; place-items: center;
  width: 32px; height: 32px; border-radius: var(--prjs-radius-sm);
  background: var(--prjs-primary-soft); color: var(--prjs-primary);
}
/* the corner dismiss: a circle, so it never reads as one of the footer buttons */
.prjs-btn[data-prjs-modal-close] {
  flex: none; border-radius: 999px; margin: -2px -4px 0 0;
  border-color: transparent; background: transparent;
}
.prjs-btn[data-prjs-modal-close]:hover { background: var(--prjs-paper-dim); border-color: var(--prjs-rule-soft) }
.prjs-modal-body { padding: 18px; overflow: auto; flex: 1 }
.prjs-modal-body > :first-child { margin-top: 0 }
.prjs-modal-body > :last-child { margin-bottom: 0 }
.prjs-modal-action {
  display: flex; gap: 8px; justify-content: flex-end; align-items: center;
  padding: 13px 18px;
  border-top: 1px solid var(--prjs-rule-soft);
  background: var(--prjs-paper-dim);
}
.prjs-modal-action-note { margin-right: auto; color: var(--prjs-ink-soft); font-size: 12px }`;
}

/**
 * What is left of the button rules.
 *
 * daisyUI's button component draws the rest — every size, every tone, the
 * outline and ghost variants, the disabled state, the focus ring. This is only
 * the two things it has no opinion about: an icon-only button, which needs to be
 * square, and the `data-tone` attribute the kit's specs use instead of a class.
 *
 * The tone mapping is what makes `{ tone: 'primary' }` reach `.btn-primary`'s
 * rules without every caller writing class names.
 */
function buttons(): string {
  const tones = [...TONES, ...Object.keys(TONE_ALIASES)]
    .map(
      (name) =>
        `.prjs-btn[data-tone="${name}"] { --btn-color: var(--prjs-${name}); color: var(--prjs-${name}-fg) }`
    )
    .join('\n');

  return `
${tones}
.prjs-btn[data-tone="ghost"] { --btn-bg: transparent; --btn-border: transparent; --btn-shadow: none }
.prjs-btn[data-tone="ghost"]:hover:not([disabled]) { --btn-bg: var(--prjs-paper-dim) }
.prjs-btn[data-tone="quiet"] { --btn-bg: transparent; color: var(--prjs-ink-soft) }
.prjs-btn[data-tone="quiet"]:hover:not([disabled]) { color: var(--prjs-ink); --btn-bg: var(--prjs-paper-dim) }

.prjs-btn[data-size="sm"] { --size: calc(var(--size-field, .25rem) * 8); font-size: .8125rem }
.prjs-btn[data-size="lg"] { --size: calc(var(--size-field, .25rem) * 12); font-size: 1.0625rem }

/* daisyUI has no icon-only variant that keeps the label for a screen reader */
.prjs-btn[data-icon-only] { padding-inline: 0; width: var(--size); aspect-ratio: 1 }
`;
}

function menus(t: Theme): string {
  return `
.prjs-menu {
  position: fixed; z-index: ${t.z + 60};
  min-width: 236px; max-width: 340px; max-height: 80vh; overflow: auto;
  background: var(--prjs-paper-raised);
  border: 1px solid var(--prjs-rule-soft);
  border-radius: var(--prjs-radius);
  box-shadow: var(--prjs-shadow);
  padding: 5px;
}
.prjs-menu-head {
  padding: 9px 10px 8px;
  border-bottom: 1px solid var(--prjs-rule-soft);
  margin: -5px -5px 5px;
  background: var(--prjs-paper-dim);
  border-radius: var(--prjs-radius) var(--prjs-radius) 0 0;
}
.prjs-menu-title { font-weight: 600; font-size: 12.5px; display: flex; align-items: center; gap: 7px }
.prjs-menu-desc { color: var(--prjs-ink-soft); font-size: 11.5px; margin-top: 2px }

.prjs-item {
  display: flex; align-items: center; gap: 10px;
  width: 100%; text-align: left;
  background: none; border: 0;
  border-radius: var(--prjs-radius-sm);
  padding: 7px 9px;
  cursor: pointer; color: inherit; font: inherit;
}
.prjs-item:hover:not([disabled]), .prjs-item[data-active="true"] {
  background: var(--prjs-paper-dim);
}
.prjs-item[data-tone="danger"] { color: var(--prjs-danger) }
.prjs-item[data-tone="danger"]:hover:not([disabled]),
.prjs-item[data-tone="danger"][data-active="true"] { background: var(--prjs-danger-soft) }
.prjs-item[data-tone="danger"] .prjs-item-icon { color: var(--prjs-danger) }
.prjs-item[data-tone="primary"] .prjs-item-icon { color: var(--prjs-primary) }
.prjs-item[disabled] { opacity: .4; cursor: default }
.prjs-item:focus-visible { outline: var(--prjs-ring) solid var(--prjs-primary); outline-offset: -2px }
.prjs-item[aria-checked="true"] .prjs-item-icon { color: var(--prjs-primary) }

.prjs-item-icon { display: inline-flex; color: var(--prjs-ink-faint); flex: none }
.prjs-item-text { flex: 1; min-width: 0 }
.prjs-item-label { display: block }
.prjs-item-hint {
  display: block; color: var(--prjs-ink-soft); font-size: 11.5px; margin-top: 1px;
  overflow: hidden; text-overflow: ellipsis;
}
.prjs-item-kbd { display: inline-flex; gap: 3px; flex: none }
.prjs-kbd {
  font: var(--prjs-mono); font-size: 10.5px; line-height: 1;
  color: var(--prjs-ink-soft);
  background: var(--prjs-paper-dim);
  border: 1px solid var(--prjs-rule);
  border-bottom-width: 2px;
  border-radius: 4px;
  padding: 3px 5px;
  min-width: 18px; text-align: center;
}
.prjs-item-more { color: var(--prjs-ink-faint); flex: none }
.prjs-sep { height: 1px; background: var(--prjs-rule-soft); margin: 5px 2px }
.prjs-group {
  font: var(--prjs-mono); font-size: 10.5px;
  text-transform: uppercase; letter-spacing: .08em;
  color: var(--prjs-ink-faint);
  padding: 9px 9px 4px;
}`;
}

/**
 * Popovers and tooltips.
 *
 * Both use the native popover attribute where it exists, which puts them in the
 * top layer — no z-index arithmetic, Escape and light-dismiss for free — and CSS
 * anchor positioning to place them, with `@position-try` handling the flip when
 * one would run off the viewport. That is now baseline: Chrome 125, Firefox 132,
 * Safari 18.2.
 *
 * Where it is missing, `position.ts` places them the old way. The `@supports`
 * block is what keeps the two from fighting.
 */
function floating(): string {
  return `
.prjs-pop {
  position: fixed;
  margin: 0; padding: 0; border: 0;
  background: var(--prjs-paper-raised);
  color: var(--prjs-ink);
  border: 1px solid var(--prjs-rule-soft);
  border-radius: var(--prjs-radius);
  box-shadow: var(--prjs-shadow);
  max-width: 320px;
  overflow: visible;
}
.prjs-pop::backdrop { background: transparent }
.prjs-pop-body { padding: 12px 14px }
.prjs-pop-title { font-weight: 600; margin-bottom: 4px }
.prjs-pop-text { color: var(--prjs-ink-soft); font-size: 12.5px }
.prjs-pop-foot {
  display: flex; gap: 6px; justify-content: flex-end;
  padding: 9px 12px; border-top: 1px solid var(--prjs-rule-soft);
  background: var(--prjs-paper-dim);
  border-radius: 0 0 var(--prjs-radius) var(--prjs-radius);
}

.prjs-tip {
  position: fixed;
  margin: 0; padding: 5px 9px; border: 0;
  background: var(--prjs-ink);
  color: var(--prjs-paper);
  border-radius: var(--prjs-radius-sm);
  font-size: 12px; line-height: 1.35;
  max-width: 260px;
  box-shadow: var(--prjs-shadow-sm);
  pointer-events: none;
}
.prjs-tip::backdrop { background: transparent }
.prjs-tip .prjs-kbd {
  background: rgba(255,255,255,.14); border-color: rgba(255,255,255,.22);
  color: inherit; margin-left: 5px;
}
@media (prefers-reduced-motion: no-preference) {
  .prjs-tip { animation: prjs-pop 90ms ease-out }
}

@supports (anchor-name: --pc) {
  .prjs-pop[data-anchored], .prjs-tip[data-anchored] {
    position: absolute;
    position-anchor: var(--prjs-anchor);
    position-area: var(--prjs-area, block-start);
    margin: 6px;
    position-try-fallbacks: flip-block, flip-inline, flip-block flip-inline;
    position-visibility: anchors-visible;
  }
}

/* the caret -------------------------------------------------------------
   a square turned 45°, showing the two edges that meet at the pointing corner.
   \`background: inherit\` takes the surface's own colour, so one rule serves the
   dark tooltip and the light popover without either naming the other. */
.prjs-caret {
  position: absolute;
  width: 9px; height: 9px;
  background: inherit;
  border: 0 solid var(--prjs-rule-soft);
  transform: rotate(45deg);
  pointer-events: none;
}
/* until the geometry has been read back, there is no side to point at */
.prjs-pop:not([data-side]) > .prjs-caret,
.prjs-tip:not([data-side]) > .prjs-caret { display: none }

[data-side="top"] > .prjs-caret {
  bottom: -5px; left: var(--prjs-caret-at, 50%); margin-left: -4.5px;
  border-right-width: 1px; border-bottom-width: 1px;
}
[data-side="bottom"] > .prjs-caret {
  top: -5px; left: var(--prjs-caret-at, 50%); margin-left: -4.5px;
  border-top-width: 1px; border-left-width: 1px;
}
[data-side="left"] > .prjs-caret {
  right: -5px; top: var(--prjs-caret-at, 50%); margin-top: -4.5px;
  border-top-width: 1px; border-right-width: 1px;
}
[data-side="right"] > .prjs-caret {
  left: -5px; top: var(--prjs-caret-at, 50%); margin-top: -4.5px;
  border-bottom-width: 1px; border-left-width: 1px;
}
/* a shadow under the caret would draw a line across the surface it points from */
.prjs-tip .prjs-caret { box-shadow: none }`;
}

/**
 * What daisyUI's form components do not cover.
 *
 * `input`, `select`, `textarea`, `range`, `checkbox`, `radio`, `fieldset` and
 * `label` are all daisyUI's now, so the controls themselves are gone from here.
 * What is left is the layout between them — the vertical rhythm a field sits in,
 * the hint under it, the error slot — and the colour control, which daisyUI has
 * no component for.
 */
function forms(): string {
  return `
/* one vertical rhythm for every field, rather than each control choosing its own
   margins: label 6px control 6px hint, 18px between fields. */
.prjs-field { display: block; margin-bottom: 18px }
.prjs-field:last-child { margin-bottom: 0 }
.prjs-field > .prjs-label { display: flex; align-items: center; gap: 6px; margin-bottom: 6px }
.prjs-req { color: var(--prjs-error); font-size: 11px }
.prjs-hint { display: block; color: var(--prjs-ink-soft); font-size: 12px; margin-top: 6px; line-height: 1.4 }
.prjs-error { display: block; color: var(--prjs-error); font-size: 12px; margin-top: 6px }
.prjs-error[hidden] { display: none }

/* a checkbox or radio and its words on one line */
.prjs-check {
  display: flex; align-items: center; gap: 9px;
  font-weight: 400; cursor: pointer; margin-bottom: 8px;
}
.prjs-check:last-child { margin-bottom: 0 }

/* daisyUI's fieldset is a box; this is the grid inside it */
.prjs-fieldset { margin: 0 0 18px }
.prjs-fieldset:last-child { margin-bottom: 0 }
.prjs-fieldset-body { display: grid; gap: 14px }
.prjs-fieldset-body .prjs-field { margin-bottom: 0 }
@media (min-width: 520px) {
  .prjs-fieldset-body[data-columns="2"] { grid-template-columns: 1fr 1fr }
}

/* colour — daisyUI has no component for one ---------------------------------- */
.prjs-color-field { display: block }
.prjs-color-row { display: flex; gap: 8px; align-items: center }
.prjs-color-input { font: var(--prjs-mono); letter-spacing: .01em }
.prjs-swatches { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap }
.prjs-swatch {
  width: 26px; height: 26px; flex: none; cursor: pointer; padding: 0;
  border: 1px solid var(--prjs-rule); border-radius: var(--prjs-radius-selector);
  /* a chequerboard behind it, so a translucent swatch reads as translucent */
  background-image:
    linear-gradient(var(--prjs-swatch), var(--prjs-swatch)),
    conic-gradient(#d4d4d4 0 25%, #fff 0 50%, #d4d4d4 0 75%, #fff 0);
  background-size: 100% 100%, 10px 10px;
}
.prjs-swatch:hover { transform: scale(1.08) }
.prjs-swatch:focus-visible { outline: var(--prjs-ring) solid var(--prjs-primary); outline-offset: 2px }

.prjs-range-row { display: flex; gap: 12px; align-items: center }
.prjs-range { flex: 1; min-width: 0 }
.prjs-range-value {
  font: var(--prjs-mono); min-width: 4.5em; text-align: right;
  color: var(--prjs-ink-soft); flex: none;
}
`;
}

function palette(): string {
  return `
.prjs-palette {
  width: 620px; max-width: 100%;
  align-self: flex-start; margin-top: 8vh;
  background: var(--prjs-paper-raised);
  border: 1px solid var(--prjs-rule-soft);
  border-radius: var(--prjs-radius-lg);
  box-shadow: var(--prjs-shadow);
  display: flex; flex-direction: column; overflow: hidden;
  max-height: 68vh;
}
.prjs-palette-search {
  display: flex; align-items: center; gap: 10px;
  padding: 13px 16px;
  border-bottom: 1px solid var(--prjs-rule-soft);
}
.prjs-palette-search svg { color: var(--prjs-ink-faint); flex: none }
.prjs-palette-input {
  font: inherit; font-size: 15px;
  flex: 1; border: 0; background: none; color: var(--prjs-ink); outline: none; padding: 0;
}
.prjs-palette-input::placeholder { color: var(--prjs-ink-faint) }
.prjs-palette-list { overflow: auto; padding: 6px; flex: 1 }
.prjs-palette-empty {
  padding: 32px 16px; text-align: center; color: var(--prjs-ink-soft);
}
.prjs-palette-foot {
  display: flex; align-items: center; gap: 14px;
  padding: 9px 14px;
  border-top: 1px solid var(--prjs-rule-soft);
  background: var(--prjs-paper-dim);
  font-size: 11.5px; color: var(--prjs-ink-soft);
}
.prjs-palette-foot span { display: inline-flex; align-items: center; gap: 5px }
.prjs-match { color: var(--prjs-primary); font-weight: 600 }
.prjs-palette .prjs-item { padding: 9px 10px }
.prjs-palette .prjs-item[data-active="true"] { background: var(--prjs-primary-soft) }
.prjs-palette .prjs-item[data-active="true"] .prjs-item-icon { color: var(--prjs-primary) }`;
}

function chrome(t: Theme): string {
  return `
/* the proof sheet --------------------------------------------------------- */
/* The order these stack in is the order they open in.
 *
 *   proof    30   a full-screen panel other surfaces open over
 *   toolbar  50   the annotation tools, over the proof
 *   modal    55   over both — the proof's own settings dialog is one
 *   menu     60   over a modal
 *   toast    70   over everything
 *
 * The proof shipped at 60, above the modal scrim, so its Settings button opened
 * a dialog behind the panel that opened it: visible, and impossible to click.
 */
.prjs-proof {
  position: fixed; inset: 0; z-index: ${t.z + 30};
  display: grid; grid-template-rows: auto 1fr auto;
  background: var(--prjs-paper);
  color: var(--prjs-ink);
}
.prjs-proof-bar {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 16px; border-bottom: 1px solid var(--prjs-rule-soft);
  background: var(--prjs-paper);
}
.prjs-proof-icon {
  flex: none; display: grid; place-items: center; width: 34px; height: 34px;
  border-radius: var(--prjs-radius-field);
  background: var(--prjs-primary-soft); color: var(--prjs-primary);
}
.prjs-proof-titles { flex: 1; min-width: 0 }
.prjs-proof-title { margin: 0; font-size: 15px; font-weight: 600; letter-spacing: -.01em }
.prjs-proof-meta { margin: 2px 0 0; font-size: 12px; color: var(--prjs-ink-soft) }
.prjs-proof-zoom { display: flex; align-items: center; gap: 2px }
.prjs-proof-zoom-value {
  font: var(--prjs-mono); min-width: 3.6em; text-align: center; color: var(--prjs-ink-soft);
}

.prjs-proof-body { display: flex; min-height: 0; background: var(--prjs-paper-dim) }

.prjs-proof-rail {
  flex: none; width: 62px; overflow: auto;
  display: flex; flex-direction: column; gap: 6px; align-items: center;
  padding: 14px 0; border-right: 1px solid var(--prjs-rule-soft);
  background: var(--prjs-paper);
}
.prjs-proof-rail[hidden] { display: none }
.prjs-proof-page {
  font: var(--prjs-mono); cursor: pointer; flex: none;
  width: 36px; height: 46px;
  border: 1px solid var(--prjs-rule); border-radius: var(--prjs-radius-selector);
  background: var(--prjs-paper); color: var(--prjs-ink-soft);
}
.prjs-proof-page:hover { border-color: var(--prjs-primary); color: var(--prjs-ink) }
.prjs-proof-page[data-active="true"] {
  border-color: var(--prjs-primary); color: var(--prjs-primary-fg);
  background: var(--prjs-primary);
}

.prjs-proof-stage {
  flex: 1; min-width: 0; overflow: auto;
  display: flex; justify-content: center; align-items: flex-start;
  padding: 28px;
}
/* the sheet reads as paper, not as a panel that happens to contain html */
.prjs-proof-paper {
  flex: none; transform-origin: top center;
  background: #fff; box-shadow: 0 8px 34px rgba(0,0,0,.22);
}
.prjs-proof-frame { width: 100%; height: 100%; border: 0; display: block; background: #fff }

.prjs-proof-foot {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 16px; border-top: 1px solid var(--prjs-rule-soft);
  background: var(--prjs-paper);
}
.prjs-proof-foot-left { display: flex; gap: 8px; flex: 1 }
.prjs-proof-foot-right { display: flex; gap: 8px }

/* one lane per edge. bars are children, so two open at once sit above one
   another instead of on top of one another. */
.prjs-toolbar-stack {
  position: fixed; left: 50%; transform: translateX(-50%);
  z-index: ${t.z + 50};
  display: flex; flex-direction: column-reverse; gap: 10px;
  align-items: center;
  max-width: calc(100vw - 32px);
  pointer-events: none;
  transition: bottom .18s ease, top .18s ease;
}
.prjs-toolbar-stack > * { pointer-events: auto }
.prjs-toolbar-stack[data-dock="bottom"] { bottom: 22px }
.prjs-toolbar-stack[data-dock="top"] { top: 22px; flex-direction: column }
/* the lane got in the way of what its bars are about, so it moved */
.prjs-toolbar-stack[data-dock="bottom"][data-shifted="true"] { bottom: auto; top: 22px; flex-direction: column }
.prjs-toolbar-stack:empty { display: none }
@media (prefers-reduced-motion: reduce) {
  .prjs-toolbar-stack { transition: none }
}

.prjs-toolbar {
  display: flex; gap: 8px; align-items: center;
  background: var(--prjs-ink);
  color: var(--prjs-paper);
  padding: 8px 10px;
  border-radius: var(--prjs-radius);
  box-shadow: var(--prjs-shadow);
  max-width: calc(100vw - 32px);
  flex-wrap: wrap;
}
.prjs-toolbar .prjs-btn { background: rgba(255,255,255,.10); border-color: transparent; color: var(--prjs-paper) }
.prjs-toolbar .prjs-btn:hover:not([disabled]) { background: rgba(255,255,255,.18) }
.prjs-toolbar .prjs-btn[data-active="true"] { background: rgba(255,255,255,.24); box-shadow: inset 0 0 0 1px rgba(255,255,255,.4) }
.prjs-toolbar .prjs-btn[data-tone="primary"] { background: var(--prjs-primary); color: var(--prjs-primary-fg) }
.prjs-toolbar .prjs-btn[data-tone="danger"] { background: var(--prjs-danger); color: var(--prjs-danger-fg) }
.prjs-toolbar .prjs-btn[data-tone="ghost"] { background: none; color: var(--prjs-paper); opacity: .8 }
.prjs-toolbar .prjs-btn[data-tone="ghost"]:hover:not([disabled]) { opacity: 1; background: rgba(255,255,255,.12) }

.prjs-toolbar-status { display: flex; gap: 6px; align-items: center; font: var(--prjs-mono); margin: 0 4px; opacity: .9 }
/* several short chips read faster than one run-on string */
.prjs-toolbar-chip {
  display: inline-flex; align-items: center; gap: 5px;
  background: rgba(255,255,255,.12); border-radius: var(--prjs-radius-selector);
  padding: 3px 8px; white-space: nowrap;
}
.prjs-toolbar-chip[data-tone="primary"] { background: var(--prjs-primary); color: var(--prjs-primary-fg) }
.prjs-toolbar-swatch {
  width: 11px; height: 11px; flex: none; border-radius: 3px;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.45);
}

.prjs-toasts {
  position: fixed; right: 16px; bottom: 16px; z-index: ${t.z + 70};
  display: flex; flex-direction: column; gap: 8px; align-items: flex-end;
  pointer-events: none;
}
.prjs-toast {
  pointer-events: auto;
  background: var(--prjs-ink); color: var(--prjs-paper);
  border-radius: var(--prjs-radius);
  box-shadow: var(--prjs-shadow);
  padding: 10px 13px;
  max-width: 380px;
  display: flex; align-items: flex-start; gap: 10px;
}
.prjs-toast[data-tone="danger"] { background: var(--prjs-danger); color: var(--prjs-danger-fg) }
.prjs-toast[data-tone="success"] { background: var(--prjs-success); color: var(--prjs-success-fg) }
.prjs-toast[data-tone="warn"] { background: var(--prjs-warn); color: var(--prjs-warn-fg) }
.prjs-toast-close {
  background: none; border: 0; color: inherit; cursor: pointer; font: inherit;
  opacity: .7; padding: 0; flex: none;
}
.prjs-toast-close:hover { opacity: 1 }

/* the notes panel: every annotation on the page, in one list */
.prjs-list { display: grid; gap: 6px }
.prjs-card {
  display: flex; gap: 10px; align-items: flex-start;
  padding: 10px 12px;
  border: 1px solid var(--prjs-rule-soft);
  border-radius: var(--prjs-radius-sm);
  background: var(--prjs-paper-dim);
}
.prjs-card-text { flex: 1; min-width: 0 }
.prjs-card-where {
  font: var(--prjs-mono); font-size: 11px; color: var(--prjs-ink-faint);
  margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.prjs-card-actions { display: flex; gap: 4px; flex: none }
.prjs-empty {
  padding: 28px 16px; text-align: center; color: var(--prjs-ink-soft);
  border: 1px dashed var(--prjs-rule); border-radius: var(--prjs-radius-sm);
}
.prjs-badge {
  display: inline-flex; align-items: center; gap: 4px;
  font: var(--prjs-mono); font-size: 10.5px;
  padding: 2px 6px; border-radius: 999px;
  background: var(--prjs-primary-soft); color: var(--prjs-primary);
}
.prjs-badge[data-tone="danger"] { background: var(--prjs-danger-soft); color: var(--prjs-danger) }
.prjs-badge[data-tone="warn"] { background: var(--prjs-warn-soft); color: var(--prjs-warn) }`;
}

/** the marker every kit node carries, so clip jobs can strip the interface out */
export const UI_ATTR = 'data-prjs-ui';
export const KIT_CLASS = 'prjs';
export const KIT_NS = NS;
