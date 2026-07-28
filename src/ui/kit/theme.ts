// Design tokens for everything the UI layer draws.
//
// One stylesheet per document, built from custom properties, so a host can
// restyle the kit by setting a handful of variables instead of fighting inline
// styles with !important.

import { NS } from '../../support';

export interface Theme {
  /** text and surfaces */
  ink: string;
  inkSoft: string;
  paper: string;
  paperDim: string;
  rule: string;
  /** the accent used for focus rings, selection and primary actions */
  accent: string;
  accentInk: string;
  /** destructive actions */
  danger: string;
  dangerInk: string;
  /** shape and type */
  radius: string;
  font: string;
  fontMono: string;
  shadow: string;
  /** the base layer everything the kit draws sits on */
  z: number;
}

export const DEFAULT_THEME: Theme = {
  ink: '#17181b',
  inkSoft: '#55575e',
  paper: '#ffffff',
  paperDim: '#f2f2ef',
  rule: '#d8d8d3',
  accent: '#0f766e',
  accentInk: '#ffffff',
  danger: '#b91c1c',
  dangerInk: '#ffffff',
  radius: '6px',
  font: '13px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  fontMono: '12px/1.45 ui-monospace, Consolas, Menlo, monospace',
  shadow: '0 10px 34px rgba(0, 0, 0, 0.22)',
  z: 2147483600
};

let current: Theme = { ...DEFAULT_THEME };

const STYLE_ID = 'pc-kit-style';

/** Merges overrides into the live theme and repaints any open surfaces. */
export function setTheme(patch: Partial<Theme>, doc?: Document): Theme {
  current = { ...current, ...patch };
  const target = doc || (typeof document === 'undefined' ? null : document);
  if (target) {
    const existing = target.getElementById(STYLE_ID);
    if (existing) existing.remove();
    ensureStyles(target);
  }
  return current;
}

export function getTheme(): Theme {
  return current;
}

/**
 * Injects the kit stylesheet once per document. Everything the kit renders is
 * class-based from here on, which is what makes `setTheme` and host overrides
 * work at all.
 */
export function ensureStyles(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return;

  const t = current;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.setAttribute('data-pc-ui', '');
  style.textContent = `
.pc-k {
  --pc-ink: ${t.ink};
  --pc-ink-soft: ${t.inkSoft};
  --pc-paper: ${t.paper};
  --pc-paper-dim: ${t.paperDim};
  --pc-rule: ${t.rule};
  --pc-accent: ${t.accent};
  --pc-accent-ink: ${t.accentInk};
  --pc-danger: ${t.danger};
  --pc-danger-ink: ${t.dangerInk};
  --pc-radius: ${t.radius};
  --pc-shadow: ${t.shadow};
  font: ${t.font};
  color: var(--pc-ink);
  box-sizing: border-box;
}
.pc-k *, .pc-k *::before, .pc-k *::after { box-sizing: inherit; }

.pc-k-scrim {
  position: fixed;
  inset: 0;
  z-index: ${t.z + 40};
  background: rgba(20, 20, 24, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 5vh 4vw;
}
@media (prefers-reduced-motion: no-preference) {
  .pc-k-scrim { animation: pc-k-fade 120ms ease-out; }
  .pc-k-panel { animation: pc-k-rise 140ms ease-out; }
}
@keyframes pc-k-fade { from { opacity: 0 } }
@keyframes pc-k-rise { from { opacity: 0; transform: translateY(6px) } }

.pc-k-panel {
  background: var(--pc-paper);
  border-radius: var(--pc-radius);
  box-shadow: var(--pc-shadow);
  max-height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.pc-k-panel[data-size="sm"] { width: 360px }
.pc-k-panel[data-size="md"] { width: 520px }
.pc-k-panel[data-size="lg"] { width: 760px }
.pc-k-panel[data-size="full"] { width: 100%; height: 100% }

.pc-k-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--pc-rule);
}
.pc-k-title { font-weight: 600; font-size: 14px; margin: 0; flex: 1 }
.pc-k-sub { color: var(--pc-ink-soft); font-size: 12px; margin: 2px 0 0 }
.pc-k-body { padding: 16px; overflow: auto; flex: 1 }
.pc-k-body > :first-child { margin-top: 0 }
.pc-k-body > :last-child { margin-bottom: 0 }
.pc-k-foot {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding: 12px 16px;
  border-top: 1px solid var(--pc-rule);
  background: var(--pc-paper-dim);
}

.pc-k-btn {
  font: inherit;
  font-weight: 500;
  border: 1px solid var(--pc-rule);
  background: var(--pc-paper);
  color: var(--pc-ink);
  border-radius: calc(var(--pc-radius) - 2px);
  padding: 7px 13px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 7px;
}
.pc-k-btn:hover { background: var(--pc-paper-dim) }
.pc-k-btn:focus-visible { outline: 2px solid var(--pc-accent); outline-offset: 2px }
.pc-k-btn[disabled] { opacity: .5; cursor: not-allowed }
.pc-k-btn[data-tone="primary"] {
  background: var(--pc-accent); border-color: var(--pc-accent); color: var(--pc-accent-ink);
}
.pc-k-btn[data-tone="danger"] {
  background: var(--pc-danger); border-color: var(--pc-danger); color: var(--pc-danger-ink);
}
.pc-k-btn[data-tone="ghost"] { background: none; border-color: transparent }

.pc-k-menu {
  position: fixed;
  z-index: ${t.z + 60};
  min-width: 214px;
  max-height: 80vh;
  overflow: auto;
  background: var(--pc-paper);
  border: 1px solid var(--pc-rule);
  border-radius: var(--pc-radius);
  box-shadow: var(--pc-shadow);
  padding: 4px;
}
.pc-k-item {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  text-align: left;
  background: none;
  border: 0;
  border-radius: calc(var(--pc-radius) - 3px);
  padding: 7px 9px;
  cursor: pointer;
  color: inherit;
  font: inherit;
}
.pc-k-item:hover:not([disabled]), .pc-k-item[data-active="true"] { background: var(--pc-paper-dim) }
.pc-k-item[disabled] { opacity: .45; cursor: default }
.pc-k-item:focus-visible { outline: 2px solid var(--pc-accent); outline-offset: -2px }
.pc-k-item-icon { display: inline-flex; color: var(--pc-ink-soft); flex: none }
.pc-k-item-label { flex: 1 }
.pc-k-item-kbd {
  font: ${t.fontMono};
  color: var(--pc-ink-soft);
  border: 1px solid var(--pc-rule);
  border-radius: 3px;
  padding: 1px 5px;
}
.pc-k-item-more { color: var(--pc-ink-soft) }
.pc-k-sep { height: 1px; background: var(--pc-rule); margin: 4px 2px }
.pc-k-group {
  font: ${t.fontMono};
  text-transform: uppercase;
  letter-spacing: .09em;
  color: var(--pc-ink-soft);
  padding: 8px 9px 4px;
}

.pc-k-field { display: block; margin-bottom: 13px }
.pc-k-field:last-child { margin-bottom: 0 }
.pc-k-label { display: block; font-weight: 500; margin-bottom: 5px }
.pc-k-hint { display: block; color: var(--pc-ink-soft); font-size: 12px; margin-top: 5px }
.pc-k-input, .pc-k-select, .pc-k-textarea {
  font: inherit;
  width: 100%;
  border: 1px solid var(--pc-rule);
  border-radius: calc(var(--pc-radius) - 2px);
  padding: 7px 9px;
  background: var(--pc-paper);
  color: var(--pc-ink);
}
.pc-k-textarea { min-height: 88px; resize: vertical }
.pc-k-input:focus-visible, .pc-k-select:focus-visible, .pc-k-textarea:focus-visible {
  outline: 2px solid var(--pc-accent); outline-offset: 1px; border-color: var(--pc-accent);
}
.pc-k-input[aria-invalid="true"] { border-color: var(--pc-danger) }
.pc-k-error { color: var(--pc-danger); font-size: 12px; margin-top: 5px; display: block }
.pc-k-check { display: flex; align-items: flex-start; gap: 8px; font-weight: 400 }
.pc-k-check input { margin-top: 2px }
.pc-k-color { padding: 3px; height: 34px }

.pc-k-toolbar {
  position: fixed;
  left: 50%;
  bottom: 20px;
  transform: translateX(-50%);
  z-index: ${t.z + 50};
  display: flex;
  gap: 8px;
  align-items: center;
  background: var(--pc-ink);
  color: var(--pc-paper);
  padding: 9px 12px;
  border-radius: var(--pc-radius);
  box-shadow: var(--pc-shadow);
  max-width: calc(100vw - 32px);
  flex-wrap: wrap;
}
.pc-k-toolbar .pc-k-btn { background: var(--pc-paper); border-color: transparent }
.pc-k-toolbar .pc-k-btn[data-tone="ghost"] { background: none; color: var(--pc-paper) }
.pc-k-toolbar-status { font: ${t.fontMono}; margin-right: 4px }

.pc-k-toasts {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: ${t.z + 70};
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-end;
  pointer-events: none;
}
.pc-k-toast {
  pointer-events: auto;
  background: var(--pc-ink);
  color: var(--pc-paper);
  border-radius: var(--pc-radius);
  box-shadow: var(--pc-shadow);
  padding: 10px 13px;
  max-width: 380px;
  display: flex;
  align-items: flex-start;
  gap: 9px;
}
.pc-k-toast[data-tone="danger"] { background: var(--pc-danger) }
.pc-k-toast[data-tone="success"] { background: var(--pc-accent) }
.pc-k-toast-close {
  background: none; border: 0; color: inherit; cursor: pointer; font: inherit; opacity: .7; padding: 0;
}
.pc-k-toast-close:hover { opacity: 1 }

.pc-k-sr {
  position: absolute; width: 1px; height: 1px; overflow: hidden;
  clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap;
}
`.trim();

  (doc.head || doc.documentElement).appendChild(style);
}

/** the marker every kit node carries, so clip jobs can strip the interface out */
export const UI_ATTR = 'data-pc-ui';
export const KIT_CLASS = 'pc-k';
export const KIT_NS = NS;
