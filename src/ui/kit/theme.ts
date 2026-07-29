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

export interface Theme {
  /* neutrals */
  ink: string;
  inkSoft: string;
  inkFaint: string;
  paper: string;
  paperDim: string;
  paperRaised: string;
  rule: string;
  ruleSoft: string;

  /* semantic tones. a bare colour string is enough; see ToneInput. */
  primary: ToneInput;
  danger: ToneInput;
  warn: ToneInput;
  success: ToneInput;
  info: ToneInput;

  /** @deprecated an alias for `primary` */
  accent?: string;
  /** @deprecated an alias for `primary.fg` */
  accentInk?: string;
  /** @deprecated an alias for `danger.fg` */
  dangerInk?: string;

  /* shape */
  radius: string;
  radiusSm: string;
  radiusLg: string;
  /** the step every gap and pad is a multiple of */
  unit: string;

  /* type */
  font: string;
  fontMono: string;

  /* depth */
  shadow: string;
  shadowSm: string;
  /** width of the focus ring, and the gap between it and the element */
  ring: string;
  ringOffset: string;

  /** the base layer everything the kit draws sits on */
  z: number;

  /**
   * Follow the host page into dark mode. `light` and `dark` pin one palette;
   * `auto` follows `prefers-color-scheme`.
   */
  colorScheme?: 'auto' | 'light' | 'dark';
}

export const DEFAULT_THEME: Theme = {
  ink: '#17181b',
  inkSoft: '#55575e',
  inkFaint: '#8a8c93',
  paper: '#ffffff',
  paperDim: '#f5f5f3',
  paperRaised: '#ffffff',
  rule: '#d8d8d3',
  ruleSoft: '#ececea',

  primary: { bg: '#0f766e', fg: '#ffffff', border: '#0f766e', soft: 'rgba(15,118,110,.10)' },
  danger: { bg: '#b91c1c', fg: '#ffffff', border: '#b91c1c', soft: 'rgba(185,28,28,.10)' },
  warn: { bg: '#b45309', fg: '#ffffff', border: '#b45309', soft: 'rgba(180,83,9,.10)' },
  success: { bg: '#15803d', fg: '#ffffff', border: '#15803d', soft: 'rgba(21,128,61,.10)' },
  info: { bg: '#1d4ed8', fg: '#ffffff', border: '#1d4ed8', soft: 'rgba(29,78,216,.10)' },

  radius: '8px',
  radiusSm: '5px',
  radiusLg: '12px',
  unit: '4px',

  font: '13px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  fontMono: '12px/1.45 ui-monospace, Consolas, Menlo, monospace',

  shadow: '0 12px 40px -8px rgba(15, 18, 25, .28), 0 2px 8px -2px rgba(15, 18, 25, .12)',
  shadowSm: '0 4px 14px -4px rgba(15, 18, 25, .20)',
  ring: '2px',
  ringOffset: '2px',

  z: 2147483600,
  colorScheme: 'auto'
};

/** The dark palette. Only the neutrals move; the tones stay recognisable. */
const DARK = {
  ink: '#f2f2f0',
  inkSoft: '#a8aab2',
  inkFaint: '#74767e',
  paper: '#1c1d21',
  paperDim: '#252629',
  paperRaised: '#2a2b30',
  rule: '#3a3b41',
  ruleSoft: '#2e2f34',
  primary: '#2dd4bf',
  primaryFg: '#08322e',
  danger: '#f87171',
  dangerFg: '#3d0a0a',
  warn: '#fbbf24',
  warnFg: '#3a2606',
  success: '#4ade80',
  successFg: '#062b14',
  info: '#93b4fd',
  infoFg: '#0b1f4d'
};

/**
 * One tone, with the deprecated flat keys folded in.
 *
 * `accent` predates the tone objects and still works: a host that set it gets
 * the primary tone it asked for rather than silently losing the setting.
 */
function resolveTone(t: Theme, name: 'primary' | 'danger' | 'warn' | 'success' | 'info'): Tone {
  const base = toTone(DEFAULT_THEME[name], DEFAULT_THEME[name] as Tone);
  let tone = toTone(t[name], base);

  if (name === 'primary' && (t.accent || t.accentInk)) {
    tone = toTone(
      { ...(t.accent ? { bg: t.accent } : {}), ...(t.accentInk ? { fg: t.accentInk } : {}) },
      tone
    );
  }
  if (name === 'danger' && t.dangerInk) tone = { ...tone, fg: t.dangerInk };
  return tone;
}

let current: Theme = { ...DEFAULT_THEME };

const STYLE_ID = 'pc-kit-style';

/**
 * Merges overrides into the live theme and repaints any open surfaces.
 *
 * Setting a tone clears the deprecated flat alias for it. Without that, an
 * `accent` set once could never be undone: the merge would keep it, and it wins
 * over `primary`, so `set(defaults)` would appear to do nothing.
 */
export function setTheme(patch: Partial<Theme>, doc?: Document): Theme {
  const next: Theme = { ...current, ...patch };
  if (patch.primary !== undefined && patch.accent === undefined) {
    delete next.accent;
    delete next.accentInk;
  }
  if (patch.danger !== undefined && patch.dangerInk === undefined) delete next.dangerInk;
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

/** Every tone, resolved and emitted as css custom properties. */
function toneVars(t: Theme): string {
  return (['primary', 'danger', 'warn', 'success', 'info'] as const)
    .map((name) => {
      const tone = resolveTone(t, name);
      return (
        `  --pc-${name}: ${tone.bg};\n` +
        `  --pc-${name}-fg: ${tone.fg};\n` +
        `  --pc-${name}-border: ${tone.border};\n` +
        `  --pc-${name}-soft: ${tone.soft};`
      );
    })
    .join('\n');
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
  style.setAttribute('data-pc-ui', '');
  style.textContent = sheet(t).trim();
  (doc.head || doc.documentElement).appendChild(style);
}

function sheet(t: Theme): string {
  return `
${tokens(t)}
${reset()}
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
.pc-k {
  --pc-ink: ${t.ink};
  --pc-ink-soft: ${t.inkSoft};
  --pc-ink-faint: ${t.inkFaint};
  --pc-paper: ${t.paper};
  --pc-paper-dim: ${t.paperDim};
  --pc-paper-raised: ${t.paperRaised};
  --pc-rule: ${t.rule};
  --pc-rule-soft: ${t.ruleSoft};
${toneVars(t)}
  --pc-radius: ${t.radius};
  --pc-radius-sm: ${t.radiusSm};
  --pc-radius-lg: ${t.radiusLg};
  --pc-unit: ${t.unit};
  --pc-mono: ${t.fontMono};
  --pc-shadow: ${t.shadow};
  --pc-shadow-sm: ${t.shadowSm};
  --pc-ring: ${t.ring};
  --pc-ring-offset: ${t.ringOffset};

  /* the flat names the theme used to expose. resolved rather than aliased with
     var(), so a stylesheet that reads them gets a colour and not an indirection */
  --pc-accent: ${resolveTone(t, 'primary').bg};
  --pc-accent-ink: ${resolveTone(t, 'primary').fg};
  --pc-danger-ink: ${resolveTone(t, 'danger').fg};

  font: ${t.font};
  color: var(--pc-ink);
  box-sizing: border-box;
  color-scheme: ${t.colorScheme === 'dark' ? 'dark' : t.colorScheme === 'light' ? 'light' : 'light dark'};
  -webkit-font-smoothing: antialiased;
}
${dark}`;
}

/** A print tool sitting on a dark app should not be the one white rectangle. */
function darkBlock(t: Theme): string {
  const body = `
  --pc-ink: ${DARK.ink};
  --pc-ink-soft: ${DARK.inkSoft};
  --pc-ink-faint: ${DARK.inkFaint};
  --pc-paper: ${DARK.paper};
  --pc-paper-dim: ${DARK.paperDim};
  --pc-paper-raised: ${DARK.paperRaised};
  --pc-rule: ${DARK.rule};
  --pc-rule-soft: ${DARK.ruleSoft};
  --pc-primary: ${DARK.primary};
  --pc-primary-fg: ${DARK.primaryFg};
  --pc-primary-border: ${DARK.primary};
  --pc-primary-soft: rgba(45,212,191,.14);
  --pc-danger: ${DARK.danger};
  --pc-danger-fg: ${DARK.dangerFg};
  --pc-danger-border: ${DARK.danger};
  --pc-danger-soft: rgba(248,113,113,.14);
  --pc-warn: ${DARK.warn};
  --pc-warn-fg: ${DARK.warnFg};
  --pc-warn-border: ${DARK.warn};
  --pc-warn-soft: rgba(251,191,36,.14);
  --pc-success: ${DARK.success};
  --pc-success-fg: ${DARK.successFg};
  --pc-success-border: ${DARK.success};
  --pc-success-soft: rgba(74,222,128,.14);
  --pc-info: ${DARK.info};
  --pc-info-fg: ${DARK.infoFg};
  --pc-info-border: ${DARK.info};
  --pc-info-soft: rgba(147,180,253,.14);
  --pc-shadow: 0 12px 40px -8px rgba(0,0,0,.6), 0 2px 8px -2px rgba(0,0,0,.4);`;

  if (t.colorScheme === 'dark') return `.pc-k {${body}\n}`;
  return `@media (prefers-color-scheme: dark) {\n  .pc-k {${body}\n  }\n}`;
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
.pc-k *, .pc-k *::before, .pc-k *::after { box-sizing: inherit; }
.pc-k img, .pc-k canvas { max-width: none; max-height: none; }
.pc-k svg { max-width: none; max-height: none; display: inline-block; vertical-align: middle; }
.pc-k button, .pc-k input, .pc-k select, .pc-k textarea {
  font: inherit; color: inherit; letter-spacing: inherit; text-transform: none; margin: 0;
}
.pc-k input[type="checkbox"], .pc-k input[type="radio"] {
  appearance: auto; -webkit-appearance: auto; position: static;
  width: auto; height: auto; opacity: 1; clip: auto;
}
.pc-k p, .pc-k h1, .pc-k h2, .pc-k h3, .pc-k ul, .pc-k ol, .pc-k figure { margin: 0; }
.pc-k ul, .pc-k ol { padding: 0; list-style: none; }

/* anything the kit shows as a picture: fits its box, keeps its aspect.
   two classes deep so it outranks the reset above. */
.pc-k .pc-k-media { display: block; max-width: 100%; height: auto; }

.pc-k-sr {
  position: absolute; width: 1px; height: 1px; overflow: hidden;
  clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap;
}`;
}

function surfaces(t: Theme): string {
  return `
.pc-k-scrim {
  position: fixed; inset: 0; z-index: ${t.z + 40};
  background: rgba(16, 18, 24, .5);
  backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center;
  padding: 5vh 4vw;
}
@media (prefers-reduced-motion: no-preference) {
  .pc-k-scrim { animation: pc-k-fade 140ms ease-out; }
  .pc-k-panel { animation: pc-k-rise 160ms cubic-bezier(.16,1,.3,1); }
  .pc-k-menu, .pc-k-pop { animation: pc-k-pop 110ms cubic-bezier(.16,1,.3,1); }
}
@keyframes pc-k-fade { from { opacity: 0 } }
@keyframes pc-k-rise { from { opacity: 0; transform: translateY(8px) scale(.98) } }
@keyframes pc-k-pop { from { opacity: 0; transform: scale(.97) } }

.pc-k-panel {
  background: var(--pc-paper);
  border: 1px solid var(--pc-rule-soft);
  border-radius: var(--pc-radius-lg);
  box-shadow: var(--pc-shadow);
  max-height: 100%;
  display: flex; flex-direction: column; overflow: hidden;
}
.pc-k-panel[data-size="sm"] { width: 380px }
.pc-k-panel[data-size="md"] { width: 540px }
.pc-k-panel[data-size="lg"] { width: 780px }
.pc-k-panel[data-size="full"] { width: 100%; height: 100% }

.pc-k-head {
  display: flex; align-items: flex-start; gap: 12px;
  padding: 16px 18px 14px;
  border-bottom: 1px solid var(--pc-rule-soft);
}
.pc-k-head-text { flex: 1; min-width: 0 }
.pc-k-title { font-weight: 600; font-size: 15px; margin: 0; letter-spacing: -.01em }
.pc-k-sub { color: var(--pc-ink-soft); font-size: 12.5px; margin: 3px 0 0 }
.pc-k-head-icon {
  flex: none; display: grid; place-items: center;
  width: 32px; height: 32px; border-radius: var(--pc-radius-sm);
  background: var(--pc-primary-soft); color: var(--pc-primary);
}
.pc-k-body { padding: 18px; overflow: auto; flex: 1 }
.pc-k-body > :first-child { margin-top: 0 }
.pc-k-body > :last-child { margin-bottom: 0 }
.pc-k-foot {
  display: flex; gap: 8px; justify-content: flex-end; align-items: center;
  padding: 13px 18px;
  border-top: 1px solid var(--pc-rule-soft);
  background: var(--pc-paper-dim);
}
.pc-k-foot-note { margin-right: auto; color: var(--pc-ink-soft); font-size: 12px }`;
}

function buttons(): string {
  return `
.pc-k-btn {
  font: inherit; font-weight: 500;
  border: 1px solid var(--pc-rule);
  background: var(--pc-paper);
  color: var(--pc-ink);
  border-radius: var(--pc-radius-sm);
  padding: 7px 12px;
  cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  white-space: nowrap;
  transition: background-color .12s, border-color .12s, color .12s;
}
.pc-k-btn:hover:not([disabled]) { background: var(--pc-paper-dim) }
.pc-k-btn:active:not([disabled]) { transform: translateY(.5px) }
.pc-k-btn:focus-visible {
  outline: var(--pc-ring) solid var(--pc-primary);
  outline-offset: var(--pc-ring-offset);
}
.pc-k-btn[disabled] { opacity: .45; cursor: not-allowed }
.pc-k-btn[data-size="sm"] { padding: 4px 9px; font-size: 12px }
.pc-k-btn[data-size="lg"] { padding: 10px 18px; font-size: 14px }

.pc-k-btn[data-tone="primary"],
.pc-k-btn[data-tone="danger"],
.pc-k-btn[data-tone="warn"],
.pc-k-btn[data-tone="success"],
.pc-k-btn[data-tone="info"] { color: var(--pc-t-fg); background: var(--pc-t); border-color: var(--pc-t-border) }
.pc-k-btn[data-tone="primary"] { --pc-t: var(--pc-primary); --pc-t-fg: var(--pc-primary-fg); --pc-t-border: var(--pc-primary-border) }
.pc-k-btn[data-tone="danger"]  { --pc-t: var(--pc-danger);  --pc-t-fg: var(--pc-danger-fg);  --pc-t-border: var(--pc-danger-border) }
.pc-k-btn[data-tone="warn"]    { --pc-t: var(--pc-warn);    --pc-t-fg: var(--pc-warn-fg);    --pc-t-border: var(--pc-warn-border) }
.pc-k-btn[data-tone="success"] { --pc-t: var(--pc-success); --pc-t-fg: var(--pc-success-fg); --pc-t-border: var(--pc-success-border) }
.pc-k-btn[data-tone="info"]    { --pc-t: var(--pc-info);    --pc-t-fg: var(--pc-info-fg);    --pc-t-border: var(--pc-info-border) }
.pc-k-btn[data-tone="primary"]:hover:not([disabled]),
.pc-k-btn[data-tone="danger"]:hover:not([disabled]),
.pc-k-btn[data-tone="warn"]:hover:not([disabled]),
.pc-k-btn[data-tone="success"]:hover:not([disabled]),
.pc-k-btn[data-tone="info"]:hover:not([disabled]) { filter: brightness(1.08) }

.pc-k-btn[data-tone="ghost"] { background: none; border-color: transparent }
.pc-k-btn[data-tone="ghost"]:hover:not([disabled]) { background: var(--pc-paper-dim) }
.pc-k-btn[data-tone="quiet"] { background: none; border-color: var(--pc-rule); color: var(--pc-ink-soft) }
.pc-k-btn[data-tone="quiet"]:hover:not([disabled]) { color: var(--pc-ink); background: var(--pc-paper-dim) }

/* an icon-only button still needs a name, which the tooltip and aria-label give */
.pc-k-btn[data-icon-only] { padding: 7px; width: 32px; height: 32px }
.pc-k-btn[data-icon-only][data-size="sm"] { padding: 4px; width: 26px; height: 26px }`;
}

function menus(t: Theme): string {
  return `
.pc-k-menu {
  position: fixed; z-index: ${t.z + 60};
  min-width: 236px; max-width: 340px; max-height: 80vh; overflow: auto;
  background: var(--pc-paper-raised);
  border: 1px solid var(--pc-rule-soft);
  border-radius: var(--pc-radius);
  box-shadow: var(--pc-shadow);
  padding: 5px;
}
.pc-k-menu-head {
  padding: 9px 10px 8px;
  border-bottom: 1px solid var(--pc-rule-soft);
  margin: -5px -5px 5px;
  background: var(--pc-paper-dim);
  border-radius: var(--pc-radius) var(--pc-radius) 0 0;
}
.pc-k-menu-title { font-weight: 600; font-size: 12.5px; display: flex; align-items: center; gap: 7px }
.pc-k-menu-desc { color: var(--pc-ink-soft); font-size: 11.5px; margin-top: 2px }

.pc-k-item {
  display: flex; align-items: center; gap: 10px;
  width: 100%; text-align: left;
  background: none; border: 0;
  border-radius: var(--pc-radius-sm);
  padding: 7px 9px;
  cursor: pointer; color: inherit; font: inherit;
}
.pc-k-item:hover:not([disabled]), .pc-k-item[data-active="true"] {
  background: var(--pc-paper-dim);
}
.pc-k-item[data-tone="danger"] { color: var(--pc-danger) }
.pc-k-item[data-tone="danger"]:hover:not([disabled]),
.pc-k-item[data-tone="danger"][data-active="true"] { background: var(--pc-danger-soft) }
.pc-k-item[data-tone="danger"] .pc-k-item-icon { color: var(--pc-danger) }
.pc-k-item[data-tone="primary"] .pc-k-item-icon { color: var(--pc-primary) }
.pc-k-item[disabled] { opacity: .4; cursor: default }
.pc-k-item:focus-visible { outline: var(--pc-ring) solid var(--pc-primary); outline-offset: -2px }
.pc-k-item[aria-checked="true"] .pc-k-item-icon { color: var(--pc-primary) }

.pc-k-item-icon { display: inline-flex; color: var(--pc-ink-faint); flex: none }
.pc-k-item-text { flex: 1; min-width: 0 }
.pc-k-item-label { display: block }
.pc-k-item-hint {
  display: block; color: var(--pc-ink-soft); font-size: 11.5px; margin-top: 1px;
  overflow: hidden; text-overflow: ellipsis;
}
.pc-k-item-kbd { display: inline-flex; gap: 3px; flex: none }
.pc-k-kbd {
  font: var(--pc-mono); font-size: 10.5px; line-height: 1;
  color: var(--pc-ink-soft);
  background: var(--pc-paper-dim);
  border: 1px solid var(--pc-rule);
  border-bottom-width: 2px;
  border-radius: 4px;
  padding: 3px 5px;
  min-width: 18px; text-align: center;
}
.pc-k-item-more { color: var(--pc-ink-faint); flex: none }
.pc-k-sep { height: 1px; background: var(--pc-rule-soft); margin: 5px 2px }
.pc-k-group {
  font: var(--pc-mono); font-size: 10.5px;
  text-transform: uppercase; letter-spacing: .08em;
  color: var(--pc-ink-faint);
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
.pc-k-pop {
  position: fixed;
  margin: 0; padding: 0; border: 0;
  background: var(--pc-paper-raised);
  color: var(--pc-ink);
  border: 1px solid var(--pc-rule-soft);
  border-radius: var(--pc-radius);
  box-shadow: var(--pc-shadow);
  max-width: 320px;
  overflow: visible;
}
.pc-k-pop::backdrop { background: transparent }
.pc-k-pop-body { padding: 12px 14px }
.pc-k-pop-title { font-weight: 600; margin-bottom: 4px }
.pc-k-pop-text { color: var(--pc-ink-soft); font-size: 12.5px }
.pc-k-pop-foot {
  display: flex; gap: 6px; justify-content: flex-end;
  padding: 9px 12px; border-top: 1px solid var(--pc-rule-soft);
  background: var(--pc-paper-dim);
  border-radius: 0 0 var(--pc-radius) var(--pc-radius);
}

.pc-k-tip {
  position: fixed;
  margin: 0; padding: 5px 9px; border: 0;
  background: var(--pc-ink);
  color: var(--pc-paper);
  border-radius: var(--pc-radius-sm);
  font-size: 12px; line-height: 1.35;
  max-width: 260px;
  box-shadow: var(--pc-shadow-sm);
  pointer-events: none;
}
.pc-k-tip::backdrop { background: transparent }
.pc-k-tip .pc-k-kbd {
  background: rgba(255,255,255,.14); border-color: rgba(255,255,255,.22);
  color: inherit; margin-left: 5px;
}
@media (prefers-reduced-motion: no-preference) {
  .pc-k-tip { animation: pc-k-pop 90ms ease-out }
}

@supports (anchor-name: --pc) {
  .pc-k-pop[data-anchored], .pc-k-tip[data-anchored] {
    position: absolute;
    position-anchor: var(--pc-anchor);
    position-area: var(--pc-area, block-start);
    margin: 6px;
    position-try-fallbacks: flip-block, flip-inline, flip-block flip-inline;
    position-visibility: anchors-visible;
  }
}`;
}

function forms(): string {
  return `
.pc-k-field { display: block; margin-bottom: 14px }
.pc-k-field:last-child { margin-bottom: 0 }
.pc-k-label { display: flex; align-items: center; gap: 6px; font-weight: 500; margin-bottom: 5px }
.pc-k-req { color: var(--pc-danger); font-size: 11px }
.pc-k-hint { display: block; color: var(--pc-ink-soft); font-size: 12px; margin-top: 5px }
.pc-k-input, .pc-k-select, .pc-k-textarea {
  font: inherit; width: 100%;
  border: 1px solid var(--pc-rule);
  border-radius: var(--pc-radius-sm);
  padding: 7px 10px;
  background: var(--pc-paper);
  color: var(--pc-ink);
  transition: border-color .12s, box-shadow .12s;
}
.pc-k-input::placeholder, .pc-k-textarea::placeholder { color: var(--pc-ink-faint) }
.pc-k-textarea { min-height: 88px; resize: vertical }
.pc-k-input:focus-visible, .pc-k-select:focus-visible, .pc-k-textarea:focus-visible {
  outline: none;
  border-color: var(--pc-primary);
  box-shadow: 0 0 0 var(--pc-ring) var(--pc-primary-soft);
}
.pc-k-input[aria-invalid="true"], .pc-k-textarea[aria-invalid="true"] {
  border-color: var(--pc-danger);
}
.pc-k-input[aria-invalid="true"]:focus-visible { box-shadow: 0 0 0 var(--pc-ring) var(--pc-danger-soft) }
.pc-k-error {
  color: var(--pc-danger); font-size: 12px; margin-top: 5px;
  display: flex; align-items: center; gap: 5px;
}
.pc-k-check { display: flex; align-items: flex-start; gap: 9px; font-weight: 400; cursor: pointer }
.pc-k-check:hover { color: var(--pc-ink) }
.pc-k-check input { margin-top: 2px; accent-color: var(--pc-primary) }
.pc-k-color { padding: 3px; height: 34px; cursor: pointer }
.pc-k-row { display: flex; gap: 10px }
.pc-k-row > * { flex: 1 }`;
}

/** The command palette: a combobox over a grouped listbox, in a dialog. */
function palette(): string {
  return `
.pc-k-palette {
  width: 620px; max-width: 100%;
  align-self: flex-start; margin-top: 8vh;
  background: var(--pc-paper-raised);
  border: 1px solid var(--pc-rule-soft);
  border-radius: var(--pc-radius-lg);
  box-shadow: var(--pc-shadow);
  display: flex; flex-direction: column; overflow: hidden;
  max-height: 68vh;
}
.pc-k-palette-search {
  display: flex; align-items: center; gap: 10px;
  padding: 13px 16px;
  border-bottom: 1px solid var(--pc-rule-soft);
}
.pc-k-palette-search svg { color: var(--pc-ink-faint); flex: none }
.pc-k-palette-input {
  font: inherit; font-size: 15px;
  flex: 1; border: 0; background: none; color: var(--pc-ink); outline: none; padding: 0;
}
.pc-k-palette-input::placeholder { color: var(--pc-ink-faint) }
.pc-k-palette-list { overflow: auto; padding: 6px; flex: 1 }
.pc-k-palette-empty {
  padding: 32px 16px; text-align: center; color: var(--pc-ink-soft);
}
.pc-k-palette-foot {
  display: flex; align-items: center; gap: 14px;
  padding: 9px 14px;
  border-top: 1px solid var(--pc-rule-soft);
  background: var(--pc-paper-dim);
  font-size: 11.5px; color: var(--pc-ink-soft);
}
.pc-k-palette-foot span { display: inline-flex; align-items: center; gap: 5px }
.pc-k-match { color: var(--pc-primary); font-weight: 600 }
.pc-k-palette .pc-k-item { padding: 9px 10px }
.pc-k-palette .pc-k-item[data-active="true"] { background: var(--pc-primary-soft) }
.pc-k-palette .pc-k-item[data-active="true"] .pc-k-item-icon { color: var(--pc-primary) }`;
}

function chrome(t: Theme): string {
  return `
.pc-k-toolbar {
  position: fixed; left: 50%; bottom: 22px; transform: translateX(-50%);
  z-index: ${t.z + 50};
  display: flex; gap: 8px; align-items: center;
  background: var(--pc-ink);
  color: var(--pc-paper);
  padding: 8px 10px;
  border-radius: var(--pc-radius);
  box-shadow: var(--pc-shadow);
  max-width: calc(100vw - 32px);
  flex-wrap: wrap;
}
.pc-k-toolbar .pc-k-btn { background: rgba(255,255,255,.10); border-color: transparent; color: var(--pc-paper) }
.pc-k-toolbar .pc-k-btn:hover:not([disabled]) { background: rgba(255,255,255,.18) }
.pc-k-toolbar .pc-k-btn[data-tone="primary"] { background: var(--pc-primary); color: var(--pc-primary-fg) }
.pc-k-toolbar .pc-k-btn[data-tone="danger"] { background: var(--pc-danger); color: var(--pc-danger-fg) }
.pc-k-toolbar .pc-k-btn[data-tone="ghost"] { background: none; color: var(--pc-paper); opacity: .8 }
.pc-k-toolbar .pc-k-btn[data-tone="ghost"]:hover:not([disabled]) { opacity: 1; background: rgba(255,255,255,.12) }
.pc-k-toolbar-status { font: var(--pc-mono); margin: 0 6px 0 4px; opacity: .9 }

.pc-k-toasts {
  position: fixed; right: 16px; bottom: 16px; z-index: ${t.z + 70};
  display: flex; flex-direction: column; gap: 8px; align-items: flex-end;
  pointer-events: none;
}
.pc-k-toast {
  pointer-events: auto;
  background: var(--pc-ink); color: var(--pc-paper);
  border-radius: var(--pc-radius);
  box-shadow: var(--pc-shadow);
  padding: 10px 13px;
  max-width: 380px;
  display: flex; align-items: flex-start; gap: 10px;
}
.pc-k-toast[data-tone="danger"] { background: var(--pc-danger); color: var(--pc-danger-fg) }
.pc-k-toast[data-tone="success"] { background: var(--pc-success); color: var(--pc-success-fg) }
.pc-k-toast[data-tone="warn"] { background: var(--pc-warn); color: var(--pc-warn-fg) }
.pc-k-toast-close {
  background: none; border: 0; color: inherit; cursor: pointer; font: inherit;
  opacity: .7; padding: 0; flex: none;
}
.pc-k-toast-close:hover { opacity: 1 }

/* the notes panel: every annotation on the page, in one list */
.pc-k-list { display: grid; gap: 6px }
.pc-k-card {
  display: flex; gap: 10px; align-items: flex-start;
  padding: 10px 12px;
  border: 1px solid var(--pc-rule-soft);
  border-radius: var(--pc-radius-sm);
  background: var(--pc-paper-dim);
}
.pc-k-card-text { flex: 1; min-width: 0 }
.pc-k-card-where {
  font: var(--pc-mono); font-size: 11px; color: var(--pc-ink-faint);
  margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.pc-k-card-actions { display: flex; gap: 4px; flex: none }
.pc-k-empty {
  padding: 28px 16px; text-align: center; color: var(--pc-ink-soft);
  border: 1px dashed var(--pc-rule); border-radius: var(--pc-radius-sm);
}
.pc-k-badge {
  display: inline-flex; align-items: center; gap: 4px;
  font: var(--pc-mono); font-size: 10.5px;
  padding: 2px 6px; border-radius: 999px;
  background: var(--pc-primary-soft); color: var(--pc-primary);
}
.pc-k-badge[data-tone="danger"] { background: var(--pc-danger-soft); color: var(--pc-danger) }
.pc-k-badge[data-tone="warn"] { background: var(--pc-warn-soft); color: var(--pc-warn) }`;
}

/** the marker every kit node carries, so clip jobs can strip the interface out */
export const UI_ATTR = 'data-pc-ui';
export const KIT_CLASS = 'pc-k';
export const KIT_NS = NS;
