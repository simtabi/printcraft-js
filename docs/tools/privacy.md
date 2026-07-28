# Privacy

A pattern scanner that blanks PII everywhere in the print copy, for when you do
not know in advance where the sensitive data is.

## Usage

```js
Printcraft.print({ target: '#report', privacy: true });
Printcraft.job('#report').privacy(true).print();
```

`privacy: true` enables all four built-in classes. Or pick:

```js
Printcraft.print({
  target: '#report',
  privacy: {
    emails: true,
    phones: false,
    ssn: true,
    creditCards: true,
    custom: [/PROJ-\d+/g, 'CASE-[A-Z]{2}\\d+']
  }
});
```

## Built-in classes

| Flag          | Matches                                             |
| ------------- | --------------------------------------------------- |
| `emails`      | `name@example.com`                                  |
| `phones`      | International and grouped formats, 9+ digits        |
| `ssn`         | `123-45-6789`                                       |
| `creditCards` | 13–16 digits, optionally space- or hyphen-separated |

## Custom patterns

`custom` accepts `RegExp` objects and strings (compiled with the `g` flag).

A `RegExp` without the global flag is re-created with it. Without that, only the
first match in each text node would be blanked — which reads as "it worked" while
leaking every subsequent occurrence.

## How matches are replaced

Matches are rewritten in the text nodes themselves, not styled — the same
reasoning as [Redaction](redaction.md). Each matched run becomes the redact
character, so the bar keeps the width of what it replaced.

## Counting matches

The number of matches lands on the job record:

```js
const job = await Printcraft.print({ target: '#report', privacy: true });
console.log(job.redactions, 'values blanked');
```

Useful as an assertion: if a report that should contain PII reports zero
redactions, either the scan did not run or the selectors missed.

## Limits

The scanner is a regex pass over text nodes. It will not catch a phone number
split across two elements, a name, an address, or an account number in a format
it does not know. Use it as a safety net over
[selector-based redaction](redaction.md), not as a replacement for it.

---

[← Docs index](../../README.md#documentation)
