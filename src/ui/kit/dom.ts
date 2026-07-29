// Node building for the kit.
//
// Caller-supplied strings only ever reach `textContent`. `innerHTML` is used in
// exactly one place, for the icon set, which is our own markup and never comes
// from outside.

import { icon } from '../icons';
import { ensureStyles, KIT_CLASS, UI_ATTR } from './theme';

export interface NodeSpec {
  class?: string;
  text?: string;
  attrs?: Record<string, string | number | boolean | null | undefined>;
  style?: string;
  children?: (Node | null | undefined)[];
}

/** Creates an element, marked as kit UI so clip jobs strip it out. */
export function h<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  spec: NodeSpec = {}
): HTMLElementTagNameMap[K] {
  const el = doc.createElement(tag);
  el.setAttribute(UI_ATTR, '');
  if (spec.class) el.className = spec.class;
  if (spec.style) el.setAttribute('style', spec.style);
  if (spec.text != null) el.textContent = spec.text;

  for (const [name, value] of Object.entries(spec.attrs || {})) {
    if (value == null || value === false) continue;
    el.setAttribute(name, value === true ? '' : String(value));
  }
  for (const child of spec.children || []) {
    if (child) el.appendChild(child);
  }
  return el;
}

/** The kit's root element: carries the class the stylesheet hangs off. */
export function root<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  spec: NodeSpec = {}
): HTMLElementTagNameMap[K] {
  ensureStyles(doc);
  const el = h(doc, tag, spec);
  el.classList.add(KIT_CLASS);
  return el;
}

/** An inline icon. The only `innerHTML` in the kit, and only over our own svg. */
export function iconNode(doc: Document, name: string, className = 'pc-k-item-icon'): HTMLElement {
  const span = h(doc, 'span', { class: className, attrs: { 'aria-hidden': 'true' } });
  span.innerHTML = icon(name);
  return span;
}

export interface ButtonSpec {
  label: string;
  tone?: 'default' | 'primary' | 'danger' | 'ghost';
  icon?: string;
  disabled?: boolean;
  onClick?: (ev: MouseEvent) => void;
  attrs?: NodeSpec['attrs'];
}

export function button(doc: Document, spec: ButtonSpec): HTMLButtonElement {
  const el = h(doc, 'button', {
    class: 'pc-k-btn',
    attrs: {
      type: 'button',
      'data-tone': spec.tone || 'default',
      disabled: spec.disabled,
      ...spec.attrs
    }
  });
  if (spec.icon) el.appendChild(iconNode(doc, spec.icon, 'pc-k-item-icon'));
  el.appendChild(doc.createTextNode(spec.label));
  if (spec.onClick) el.addEventListener('click', spec.onClick);
  return el;
}

/** Text for screen readers only, used to announce state changes. */
export function srOnly(doc: Document, text: string): HTMLElement {
  return h(doc, 'span', { class: 'pc-k-sr', text, attrs: { 'aria-live': 'polite' } });
}

/** Everything inside `el` that can take focus, in tab order. */
export function focusable(el: Element): HTMLElement[] {
  const selector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  return [...el.querySelectorAll<HTMLElement>(selector)].filter(isVisible);
}

/**
 * Visible enough to receive focus.
 *
 * Deliberately not layout-based. `offsetParent` is null for anything
 * `position: fixed`, which every surface here is, and both it and
 * `getClientRects` report nothing under jsdom, so a layout test would quietly
 * decide that a modal has no focusable controls at all.
 */
function isVisible(node: HTMLElement): boolean {
  if (node.hidden || node.hasAttribute('inert')) return false;
  if (node.closest('[hidden]')) return false;

  const view = node.ownerDocument?.defaultView;
  if (view?.getComputedStyle) {
    const style = view.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
  }
  return true;
}
