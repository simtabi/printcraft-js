// Sending the result somewhere.
//
// No vendor adapters and no keys. A browser cannot hold an API credential
// safely — anything shipped to the page is readable by anyone who opens
// devtools — so this composes the message and hands it to a `transport` you
// write, which talks to your own server.
//
// Without a transport there is still `mailto:`, which opens the user's mail
// client. It cannot carry an attachment, so the modal says so rather than
// letting someone believe the PDF went with it.

import { raise } from '../support';
import type { Env } from '../types';

export interface EmailAttachment {
  filename: string;
  type: string;
  blob: Blob;
  /** the same bytes as a data url, for transports that want a string */
  dataUrl?: string;
}

export interface EmailMessage {
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  attachment?: EmailAttachment;
}

export interface EmailResult {
  status: 'sent' | 'queued' | 'handed-off' | 'cancelled';
  /** which route took it */
  via: string;
  /** whatever the transport returned */
  detail?: unknown;
}

/**
 * Where a composed message goes.
 *
 * Yours to write. It receives the message and returns when it has been dealt
 * with; throwing surfaces the failure to the caller rather than losing it.
 */
export type EmailTransport = (message: EmailMessage) => Promise<EmailResult | void>;

const ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Splits and validates a comma- or semicolon-separated address list. */
export function parseAddresses(input: string): string[] {
  return String(input || '')
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function invalidAddresses(list: string[]): string[] {
  return list.filter((a) => !ADDRESS.test(a));
}

/**
 * The fallback: hand the message to the user's mail client.
 *
 * Everything is percent-encoded, because an unescaped newline or ampersand in a
 * subject truncates the URL and quietly drops the rest of the message.
 */
export function mailtoUrl(message: EmailMessage): string {
  const params: string[] = [];
  if (message.cc?.length) params.push('cc=' + encodeURIComponent(message.cc.join(',')));
  if (message.subject) params.push('subject=' + encodeURIComponent(message.subject));
  if (message.body) params.push('body=' + encodeURIComponent(message.body));

  return (
    'mailto:' +
    encodeURIComponent(message.to.join(',')) +
    (params.length ? '?' + params.join('&') : '')
  );
}

export interface SendOptions {
  transport?: EmailTransport | null;
  /**
   * Addresses allowed as recipients, as exact addresses or `@domain.com`
   * suffixes. Anything else is refused before the transport is called.
   */
  allowedRecipients?: string[] | null;
}

function allowed(address: string, allowlist: string[]): boolean {
  const lower = address.toLowerCase();
  return allowlist.some((rule) => {
    const r = rule.toLowerCase();
    return r.startsWith('@') ? lower.endsWith(r) : lower === r;
  });
}

/**
 * Sends a composed message.
 *
 * Never called on its own by anything in this library: a message goes when
 * somebody presses send, and never as a side effect of a print.
 */
export async function sendEmail(
  message: EmailMessage,
  options: SendOptions = {},
  env?: Env
): Promise<EmailResult> {
  if (!message.to.length) raise('an email needs at least one recipient');
  const bad = invalidAddresses(message.to.concat(message.cc || []));
  if (bad.length) raise('these do not look like email addresses: ' + bad.join(', '));

  if (options.allowedRecipients?.length) {
    const refused = message.to
      .concat(message.cc || [])
      .filter((a) => !allowed(a, options.allowedRecipients!));
    if (refused.length) {
      raise(
        'these recipients are not on the allowlist: ' +
          refused.join(', ') +
          '. Add them to allowedRecipients, or leave it unset to allow any address.'
      );
    }
  }

  if (options.transport) {
    const result = await options.transport(message);
    return result || { status: 'sent', via: 'transport' };
  }

  // No transport, so the mail client takes it. The attachment cannot go, and the
  // composer has already said as much. The window is only reached for here,
  // which is why a transport-based send needs no dom at all.
  const scope = env || { document, window };
  scope.window.location.href = mailtoUrl(message);
  return { status: 'handed-off', via: 'mailto' };
}
