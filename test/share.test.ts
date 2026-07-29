// Getting the print copy out of the page.
//
// One rule holds the whole folder together: everything starts from the
// transformed clone, never the live page. A screenshot of what is on screen
// would put back every value redaction was asked to destroy, so a redacted
// document has to stay redacted in the png, in the clipboard payload and in the
// attachment. These check that, and the awkward parts of each API.

import { test, expect, vi } from 'vitest';
import { Printcraft, dom, env, BLOCK, I } from './harness';

const { parseAddresses, invalidAddresses, mailtoUrl, sendEmail } = Printcraft.share;

const SECRET = 'Jane Marie Doe';
const HTML = `<div id="doc"><h1>Report</h1><p class="who">Officer: ${SECRET}</p><p>Public line.</p></div>`;

/* render ------------------------------------------------------------------ */

test('render returns the transformed copy without mounting anything', () => {
  const d = dom(HTML);
  const { element, title } = Printcraft.render({ target: '#doc', documentTitle: 'Q3' }, env(d));

  expect(element.textContent).toContain('Report');
  expect(title).toBe('Q3');
  expect(d.window.document.querySelector('iframe[data-pc-frame]'), 'nothing mounted').toBe(null);
});

test('render applies redaction, so anything built on it is redacted too', () => {
  const d = dom(HTML);
  const { element, redactions } = Printcraft.render(
    { target: '#doc', redactSelectorList: ['.who'], privacy: true },
    env(d)
  );

  expect(element.textContent).not.toContain(SECRET);
  expect(element.textContent).toContain(BLOCK);
  expect(element.textContent, 'the rest survives').toContain('Public line.');
  expect(typeof redactions).toBe('number');

  // and the live page is untouched, as everywhere else
  expect(d.window.document.querySelector('.who')!.textContent).toContain(SECRET);
});

test('a leak stops the share path too, not only the print path', () => {
  const d = dom(HTML);

  expect(() =>
    Printcraft.render(
      {
        target: '#doc',
        redactSelectorList: ['.who'],
        transforms: [
          {
            selector: 'h1',
            fn: (el: Element) => {
              el.textContent = 'Officer: ' + SECRET;
              return el;
            }
          }
        ]
      },
      env(d)
    )
  ).toThrow(/PC_REDACTION_LEAK|still in the print document/);
});

/* clipboard --------------------------------------------------------------- */

function withClipboard(d: ReturnType<typeof dom>, impl: Record<string, unknown>): void {
  Object.defineProperty(d.window.navigator, 'clipboard', { value: impl, configurable: true });
}

test('copying text uses the async api when it is there', async () => {
  const d = dom(HTML);
  const writeText = vi.fn().mockResolvedValue(undefined);
  withClipboard(d, { writeText });

  const result = await Printcraft.share.copyText({ target: '#doc' }, env(d));

  expect(result.via).toBe('clipboard-api');
  expect(writeText).toHaveBeenCalledOnce();
  expect(writeText.mock.calls[0][0]).toContain('Report');
});

test('a refused write falls back rather than failing', async () => {
  const d = dom(HTML);
  withClipboard(d, { writeText: vi.fn().mockRejectedValue(new Error('NotAllowedError')) });
  d.window.document.execCommand = vi.fn().mockReturnValue(true);

  const result = await Printcraft.share.copyText({ target: '#doc' }, env(d));

  expect(result.via).toBe('execCommand');
  expect(d.window.document.querySelectorAll('textarea[data-pc-ui]'), 'cleaned up').toHaveLength(0);
});

test('when nothing works at all, it says what to do', async () => {
  const d = dom(HTML);
  withClipboard(d, { writeText: vi.fn().mockRejectedValue(new Error('nope')) });
  d.window.document.execCommand = vi.fn().mockReturnValue(false);

  await expect(Printcraft.share.copyText({ target: '#doc' }, env(d))).rejects.toThrow(
    /user gesture/
  );
});

test('copying markup sends html and plain text in one item', async () => {
  const d = dom(HTML);
  const write = vi.fn().mockResolvedValue(undefined);
  withClipboard(d, { write });
  (d.window as unknown as { ClipboardItem: unknown }).ClipboardItem = class {
    constructor(public readonly items: Record<string, Blob>) {}
  };

  const result = await Printcraft.share.copy({ target: '#doc' }, env(d));

  expect(result.format).toBe('html');
  const item = write.mock.calls[0][0][0] as { items: Record<string, Blob> };
  // oxlint-disable-next-line no-array-sort
  expect(Object.keys(item.items).sort()).toEqual(['text/html', 'text/plain']);
});

test('a copy carries the redacted markup, not the original', async () => {
  const d = dom(HTML);
  const write = vi.fn().mockResolvedValue(undefined);
  withClipboard(d, { write });
  (d.window as unknown as { ClipboardItem: unknown }).ClipboardItem = class {
    constructor(public readonly items: Record<string, Blob>) {}
  };

  await Printcraft.share.copy({ target: '#doc', redactSelectorList: ['.who'] }, env(d));

  const item = write.mock.calls[0][0][0] as { items: Record<string, Blob> };
  const html = await item.items['text/html'].text();
  expect(html).not.toContain(SECRET);
  expect(html).toContain(BLOCK);
});

test('an image copy is refused clearly where ClipboardItem is missing', async () => {
  const d = dom(HTML);
  withClipboard(d, {});
  await expect(Printcraft.share.copyImage({ target: '#doc' }, env(d))).rejects.toThrow(
    /cannot put an image on the clipboard/
  );
});

/* email ------------------------------------------------------------------- */

test('addresses are split on commas and semicolons', () => {
  expect(parseAddresses('a@b.com, c@d.com ; e@f.com')).toEqual(['a@b.com', 'c@d.com', 'e@f.com']);
  expect(parseAddresses('')).toEqual([]);
  expect(invalidAddresses(['a@b.com', 'not-an-address', 'x@y'])).toEqual(['not-an-address', 'x@y']);
});

test('a mailto url escapes everything that would truncate it', () => {
  const url = mailtoUrl({
    to: ['a@b.com', 'c@d.com'],
    cc: ['e@f.com'],
    subject: 'Q3 & Q4 report',
    body: 'line one\nline two'
  });

  expect(url).toContain('mailto:a%40b.com%2Cc%40d.com');
  expect(url, 'an unescaped ampersand would drop the body').toContain('Q3%20%26%20Q4');
  expect(url).toContain('line%20one%0Aline%20two');
});

test('a transport receives the message and its result is returned', async () => {
  const transport = vi.fn().mockResolvedValue({ status: 'queued', via: 'acme', detail: { id: 7 } });

  const result = await sendEmail(
    { to: ['a@b.com'], subject: 'hello', body: 'text' },
    { transport }
  );

  expect(result).toMatchObject({ status: 'queued', via: 'acme' });
  expect(transport.mock.calls[0][0]).toMatchObject({ to: ['a@b.com'], subject: 'hello' });
});

test('a transport that returns nothing still counts as sent', async () => {
  const result = await sendEmail(
    { to: ['a@b.com'], subject: '', body: '' },
    { transport: async () => undefined }
  );
  expect(result).toEqual({ status: 'sent', via: 'transport' });
});

test('bad addresses are refused before the transport is called', async () => {
  const transport = vi.fn();
  await expect(sendEmail({ to: ['nope'], subject: '', body: '' }, { transport })).rejects.toThrow(
    /do not look like email addresses/
  );
  await expect(sendEmail({ to: [], subject: '', body: '' }, { transport })).rejects.toThrow(
    /at least one recipient/
  );
  expect(transport).not.toHaveBeenCalled();
});

test('the allowlist takes exact addresses and domain suffixes', async () => {
  const transport = vi.fn().mockResolvedValue({ status: 'sent', via: 't' });
  const allowedRecipients = ['@acme.com', 'boss@other.org'];

  await expect(
    sendEmail({ to: ['a@acme.com'], subject: '', body: '' }, { transport, allowedRecipients })
  ).resolves.toBeTruthy();
  await expect(
    sendEmail({ to: ['boss@other.org'], subject: '', body: '' }, { transport, allowedRecipients })
  ).resolves.toBeTruthy();

  await expect(
    sendEmail(
      { to: ['stranger@elsewhere.net'], subject: '', body: '' },
      { transport, allowedRecipients }
    )
  ).rejects.toThrow(/not on the allowlist/);
  // cc is checked too, or the allowlist would be trivially bypassed
  await expect(
    sendEmail(
      { to: ['a@acme.com'], cc: ['stranger@elsewhere.net'], subject: '', body: '' },
      { transport, allowedRecipients }
    )
  ).rejects.toThrow(/not on the allowlist/);

  expect(transport).toHaveBeenCalledTimes(2);
});

test('nothing sends itself: sendEmail is the only thing that sends', () => {
  // a guard against a future refactor wiring a send into a print. printing must
  // never put content on the network as a side effect.
  const source = String(I.assemblePrintDocument) + String(Printcraft.print);
  expect(source).not.toContain('sendEmail');
  expect(source).not.toContain('mailto:');
});
