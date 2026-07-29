// The share surfaces: a compose window for email, and the feedback for copies.
//
// Built from the kit like everything else, so a host restyles it with the same
// tokens and nothing here reaches for a native dialog.

import { h as node, modal, notify, toast, type FieldValue } from './kit';
import { defaultEnv, type UiDeps } from './shared';
import {
  invalidAddresses,
  parseAddresses,
  sendEmail,
  type EmailAttachment,
  type EmailMessage,
  type EmailResult,
  type SendOptions
} from '../share/email';
import type { Env } from '../types';

export interface ComposeOptions extends SendOptions {
  to?: string;
  cc?: string;
  subject?: string;
  body?: string;
  attachment?: EmailAttachment | null;
  /** shown under the title */
  summary?: string;
}

/**
 * Opens the compose window and sends what comes back.
 *
 * Resolves with `{ status: 'cancelled' }` if the window is dismissed, so a
 * caller can tell "they changed their mind" from "it failed".
 */
export async function composeEmail(
  deps: UiDeps,
  options: ComposeOptions = {},
  env?: Env
): Promise<EmailResult> {
  const scope = env || defaultEnv();
  const hasTransport = !!options.transport;
  const attachment = options.attachment || null;

  const kb = attachment ? Math.max(1, Math.round(attachment.blob.size / 1024)) : 0;

  const result = await modal(
    {
      title: 'Send this',
      description:
        options.summary ||
        (hasTransport
          ? 'Goes through the transport this page is configured with.'
          : 'Opens your mail app, because no transport is configured.'),
      size: 'md',
      body: attachment
        ? node(scope.document, 'div', {
            style:
              'display:flex;gap:8px;align-items:baseline;padding:8px 10px;border:1px solid #d8d8d3;' +
              'border-radius:4px;background:#faf9f6;font:12px ui-monospace,monospace;',
            children: [
              node(scope.document, 'span', { text: attachment.filename }),
              node(scope.document, 'span', {
                style: 'color:#55575e;',
                text:
                  kb +
                  ' kB' +
                  // saying this up front beats someone discovering it in their sent folder
                  (hasTransport ? '' : ' · cannot be attached to a mailto: message')
              })
            ]
          })
        : undefined,
      fields: [
        {
          type: 'text',
          name: 'to',
          label: 'To',
          value: options.to || '',
          placeholder: 'someone@example.com',
          required: true,
          hint: 'Separate several with commas',
          validate: (value: FieldValue) => {
            const list = parseAddresses(String(value || ''));
            if (!list.length) return 'Who is this going to?';
            const bad = invalidAddresses(list);
            return bad.length ? 'Not an email address: ' + bad.join(', ') : null;
          }
        },
        {
          type: 'text',
          name: 'cc',
          label: 'Cc',
          value: options.cc || '',
          placeholder: 'Optional',
          validate: (value: FieldValue) => {
            const bad = invalidAddresses(parseAddresses(String(value || '')));
            return bad.length ? 'Not an email address: ' + bad.join(', ') : null;
          }
        },
        {
          type: 'text',
          name: 'subject',
          label: 'Subject',
          value: options.subject || ''
        },
        {
          type: 'textarea',
          name: 'body',
          label: 'Message',
          value: options.body || '',
          rows: 4
        }
      ],
      actions: [
        { id: 'cancel', label: 'Cancel', tone: 'ghost' },
        { id: 'send', label: 'Send', tone: 'primary', icon: 'mail', validates: true }
      ]
    },
    scope
  );

  if (result.action !== 'send') return { status: 'cancelled', via: 'compose' };

  const message: EmailMessage = {
    to: parseAddresses(String(result.values['to'] || '')),
    cc: parseAddresses(String(result.values['cc'] || '')),
    subject: String(result.values['subject'] || ''),
    body: String(result.values['body'] || ''),
    ...(attachment ? { attachment } : {})
  };

  try {
    const sent = await sendEmail(message, options, scope);
    deps.emit('share:email', { status: sent.status, via: sent.via, to: message.to.length });
    toast(
      {
        message:
          sent.via === 'mailto' ? 'Handed to your mail app' : 'Sent to ' + message.to.join(', '),
        tone: 'success'
      },
      scope
    );
    return sent;
  } catch (e) {
    await notify(
      {
        title: 'It did not send',
        message: e instanceof Error ? e.message : String(e),
        tone: 'danger'
      },
      scope
    );
    throw e;
  }
}
