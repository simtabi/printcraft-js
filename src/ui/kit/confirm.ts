import type { ToneName } from './dom';
// Yes or no, with the stakes spelled out.
//
// Every destructive step in this library goes through here: printing a drawn
// region, committing redactions, sending a document by email. A confirm that
// only says "Are you sure?" is worse than none, so the spec has room for the
// detail that makes the answer obvious.

import { modal } from './modal';
import type { Env } from '../../types';

export interface ConfirmSpec {
  title: string;
  /** the question, in one line */
  message: string;
  /** what will actually happen. worth filling in for anything irreversible. */
  detail?: string | string[];
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ToneName;
  /** extra nodes between the message and the buttons, such as a preview */
  body?: Node;
}

export async function confirm(spec: ConfirmSpec, env?: Env): Promise<boolean> {
  const doc = (env || { document }).document;
  const lines = spec.detail ? (Array.isArray(spec.detail) ? spec.detail : [spec.detail]) : [];

  let body: Node | undefined;
  if (spec.body || lines.length) {
    const wrap = doc.createElement('div');
    wrap.setAttribute('data-pc-ui', '');
    for (const line of lines) {
      const p = doc.createElement('p');
      p.textContent = line;
      wrap.appendChild(p);
    }
    if (spec.body) wrap.appendChild(spec.body);
    body = wrap;
  }

  const result = await modal(
    {
      title: spec.title,
      description: spec.message,
      size: 'sm',
      body,
      actions: [
        { id: 'no', label: spec.cancelLabel || 'Cancel', tone: 'ghost' },
        { id: 'yes', label: spec.confirmLabel || 'Confirm', tone: spec.tone || 'primary' }
      ]
    },
    env
  );

  return result.action === 'yes';
}

/** Says something and waits for acknowledgement. What `window.alert` was for. */
export async function notify(
  spec: { title: string; message: string; tone?: ToneName; okLabel?: string },
  env?: Env
): Promise<void> {
  await modal(
    {
      title: spec.title,
      description: spec.message,
      size: 'sm',
      actions: [{ id: 'ok', label: spec.okLabel || 'OK', tone: spec.tone || 'primary' }]
    },
    env
  );
}
