# Sharing

Getting the print copy out of the page: as an image, on the clipboard, or in an email.

## Where the content comes from

Everything here starts from the same transformed clone the printer would get, not the live page. `Printcraft.render()` runs the pipeline and stops:

```js
const { element, title, width, redactions } = Printcraft.render({
  target: '#invoice',
  redactSelectorList: ['.account-number']
});
```

Nothing is mounted, nothing prints, and the live page is not touched. That matters more than it might sound: a screenshot taken of what is on screen would put back every value redaction was asked to destroy. A redacted document stays redacted in the png, in the clipboard payload and in the attachment, and the [leak check](redaction.md#verification) runs on this path too.

## Screenshot

```js
const shot = await Printcraft.share.screenshot({ target: '#invoice' });
shot.blob; // a Blob
shot.dataUrl; // the same bytes as a data: url
shot.width; // device pixels
shot.skipped; // assets that could not be inlined
```

| Option             | Default               | What it does                                            |
| ------------------ | --------------------- | ------------------------------------------------------- |
| `type`             | `image/png`           | Also `image/jpeg`, `image/webp`                         |
| `quality`          | —                     | 0 to 1, for jpeg and webp                               |
| `scale`            | `2`                   | Device pixels per css pixel                             |
| `background`       | `#ffffff`             | Jpeg has no alpha, so a transparent one comes out black |
| `width` / `height` | The content's own box | The layout it renders against                           |
| `clip`             | —                     | `{ x, y, width, height }` to keep part of the result    |
| `download`         | —                     | `true` for a name from the title, or a filename         |

```js
await Printcraft.share.screenshot({
  target: '#invoice',
  documentTitle: 'Q3 Production Report',
  download: true // saves q3-production-report.png
});
```

The renderer is the same `<foreignObject>` path the region tool uses, and it has the same limits: cross-origin images without CORS come out blank and are reported in `skipped`, and a few CSS features render differently. Pass `renderer` to swap in something like `modern-screenshot` where fidelity matters more than the dependency.

## Clipboard

```js
await Printcraft.share.copyImage({ target: '#invoice' }); // png
await Printcraft.share.copy({ target: '#invoice' }); // rich html + plain text
await Printcraft.share.copyText({ target: '#invoice' }); // plain text
```

`copy` puts both flavours in one item, so pasting into a document keeps the formatting and pasting into a terminal still gets something readable.

> **Call these from a click handler.** Browsers only allow a clipboard write during a user gesture. Safari additionally stops treating a gesture as live once you await anything, so `copyImage` hands `ClipboardItem` a _promise_ of the blob rather than awaiting the render first. Doing your own `await` before calling it puts that back.

If the async API is missing or refuses, text falls back to `execCommand('copy')` and reports `via: 'execCommand'`. Images have no fallback: `copyImage` throws with a message saying to save the screenshot instead.

## Email

No vendor adapters and no keys. A browser cannot hold an API credential safely, so this composes the message and hands it to a transport you write:

```js
Printcraft.share.email({
  target: '#invoice',
  subject: 'Invoice 4417',
  transport: async (message) => {
    const res = await fetch('/api/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        to: message.to,
        cc: message.cc,
        subject: message.subject,
        body: message.body,
        attachment: message.attachment && {
          filename: message.attachment.filename,
          dataUrl: message.attachment.dataUrl
        }
      })
    });
    if (!res.ok) throw new Error('the mail service refused it: ' + res.status);
    return { status: 'queued', via: 'acme-mail' };
  }
});
```

The compose window opens with the screenshot already attached and named. `attachment: null` skips it.

### Without a transport

`mailto:` opens the user's mail client. It cannot carry an attachment, and the compose window says so next to the file rather than letting anyone believe it went along.

### The allowlist

```js
Printcraft.share.email({
  target: '#invoice',
  allowedRecipients: ['@acme.com', 'billing@partner.example'],
  transport
});
```

Exact addresses or `@domain` suffixes. Anything else is refused before the transport is called, and `cc` is checked as well as `to`.

Nothing sends itself. A message goes when somebody presses Send, never as a side effect of a print.

## Events

```js
Printcraft.on('share:screenshot', ({ width, height, skipped }) => {});
Printcraft.on('share:copy', ({ format, via }) => {});
Printcraft.on('share:email', ({ status, via, to }) => {});
```

## See also

- [Redaction](redaction.md) — what stays out of the image, and how that is checked
- [Clip printing](clip-printing.md) — the rasteriser these share
- [Print backends](../backends.md) — sending the job to a device instead of a person

---

[← Docs index](../../README.md#documentation)
