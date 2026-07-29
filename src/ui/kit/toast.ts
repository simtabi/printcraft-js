// Small, transient feedback: copied, saved, sent, failed.
//
// One stack per document, bottom right, polite to screen readers. Anything that
// needs an answer is a modal instead; a toast is for things that already worked.

import { button, h, root, type ToneName } from './dom';
import { ensureStyles } from './theme';
import type { Env } from '../../types';

export interface ToastSpec {
  message: string;
  tone?: ToneName;
  /** milliseconds on screen; 0 keeps it until dismissed */
  duration?: number;
  action?: { label: string; onSelect: () => void };
}

export interface ToastHandle {
  dismiss(): void;
}

const STACK_ATTR = 'data-pc-toasts';

function stackFor(doc: Document): HTMLElement {
  ensureStyles(doc);
  const existing = doc.querySelector<HTMLElement>('[' + STACK_ATTR + ']');
  if (existing) return existing;

  const stack = root(doc, 'div', {
    class: 'pc-k-toasts',
    attrs: { [STACK_ATTR]: '', role: 'status', 'aria-live': 'polite' }
  });
  (doc.body || doc.documentElement).appendChild(stack);
  return stack;
}

export function toast(spec: ToastSpec, env?: Env): ToastHandle {
  const doc = (env || { document }).document;
  const stack = stackFor(doc);

  const node = h(doc, 'div', {
    class: 'pc-k-toast',
    attrs: { 'data-tone': spec.tone || 'default', 'data-pc-toast': '' }
  });
  node.appendChild(h(doc, 'span', { text: spec.message, style: 'flex:1' }));

  let timer: ReturnType<typeof setTimeout> | undefined;
  const dismiss = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    node.remove();
    if (!stack.childElementCount) stack.remove();
  };

  if (spec.action) {
    node.appendChild(
      button(doc, {
        label: spec.action.label,
        tone: 'ghost',
        onClick: () => {
          spec.action?.onSelect();
          dismiss();
        }
      })
    );
  }

  node.appendChild(
    h(doc, 'button', {
      class: 'pc-k-toast-close',
      text: '×',
      attrs: { type: 'button', 'aria-label': 'Dismiss' }
    })
  );
  node.querySelector('.pc-k-toast-close')?.addEventListener('click', dismiss);

  stack.appendChild(node);

  const duration = spec.duration ?? 4000;
  if (duration > 0) timer = setTimeout(dismiss, duration);

  return { dismiss };
}
