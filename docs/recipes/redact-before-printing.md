# Redact before printing

Black out known-sensitive sections, and sweep the rest for PII you did not know
was there.

```js
await Printcraft.print({
  target: '#case-file',
  redactSelectorList: ['.informant', '.address'],
  privacy: true,
  headerText: 'RELEASED UNDER FOIA — REDACTED'
});
```

Two mechanisms, deliberately layered:

- **`redactSelectorList`** blacks out sections you can name. Text becomes block
  characters, media becomes black boxes, and identifying attributes, including
  `id` and `name`, are scrubbed.
- **`privacy: true`** scans every remaining text node for emails, phone numbers,
  SSNs and card numbers.

Both are destructive: the print copy never contains the original value, so it
cannot be recovered from the PDF.

Confirm the sweep found something:

```js
const job = await Printcraft.print({ target: '#case-file', privacy: true });
if (job.redactions === 0) console.warn('the privacy scan matched nothing');
```

Add a custom pattern for anything domain-specific:

```js
privacy: { emails: true, ssn: true, custom: [/CASE-\d{4}-[A-Z]{2}/g] }
```

Mark content in the markup itself, and every later job honours it:

```html
<p data-printcraft-redact>Informant identity …</p>
```

> Redact by class, not by id. Redaction strips `id` precisely because ids tend to
> encode the value being hidden.

Reference: [Redaction](../tools/redaction.md) · [Privacy](../tools/privacy.md)

---

[← Docs index](../../README.md#documentation)
