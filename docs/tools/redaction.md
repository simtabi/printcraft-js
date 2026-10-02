# Redaction

Destructive, declassified-file bars: the print copy holds nothing recoverable.

## Why destructive

A black overlay drawn over live text survives copy-paste out of a generated PDF:
the characters are still there, just painted over. Printcraft instead replaces the
text nodes with block characters and scrubs the attributes, so the print artifact
itself never contains the value.

This is irreversible by design, and it only ever touches the detached clone. The
live page is untouched.

## What redaction does

For every matched element and its whole subtree:

- Text nodes become the redact character, preserving line breaks so the bars
  follow the original layout
- `img`, `picture`, `video`, `canvas` and `svg` become black boxes sized from
  their declared dimensions
- These attributes are removed: `title`, `alt`, `aria-label`, `href`, `src`,
  `srcset`, `value`, `placeholder`, `download`, `poster`, **`id`**, **`name`**,
  and every `data-*` attribute
- The element gains a `prjs-redacted` class, and the generated stylesheet paints it
  and everything inside it solid black

`id` and `name` are scrubbed because they routinely encode the very value being
hidden: `id="patient-jane-doe"`, `name="ssn-123-45-6789"`. `class` survives,
because the redaction CSS depends on it.

## Usage

```js
Printcraft.print({ target: '#dossier', redactSelectorList: ['.codename', '.ssn'] });
Printcraft.job('#dossier').redact('.codename', '.ssn').print();
```

In markup, on the trigger or on the content itself:

```html
<button data-printcraft="#dossier" data-printcraft-redact-selector-list=".codename">Print</button>

<p data-printcraft-redact>This paragraph is blacked out on paper.</p>
```

The `data-printcraft-redact` attribute is honoured by every job from every
surface, which is what makes the UI layer's redact mode work: it writes
that attribute onto the live element. See [Interaction UI](interaction-ui.md).

## The redact character

```js
Printcraft.print({ target: '#d', redactSelectorList: ['.x'], redactChar: '*' });
```

Defaults to `█` (U+2588 FULL BLOCK).

## Invalid selectors raise

A typo in `redactSelectorList` throws rather than being skipped. Silently ignoring
a bad selector would print the content the caller asked to hide, which is the
worst possible failure mode for this feature.

```js
Printcraft.print({ target: '#d', redactSelectorList: ['::: oops'] });
// Error: Printcraft: redactSelectorList contains an invalid css selector: '::: oops'
```

## Form fields

Redacting an input removes its `value` attribute, so a typed value never reaches
paper even with `preserveFormState` on.

## Redacting by dragging

Selectors need the markup. Someone reading a document on screen has a phrase, so
`redactArea` lets them drag a box over it:

```js
await Printcraft.ui.redactArea({ target: '#dossier' });
```

A rectangle resolves to the characters it actually covers, using `Range` and
`getClientRects`. Half a paragraph redacts as half a paragraph rather than the
whole element, which is what marking the nearest ancestor would give you.

Before anything is destroyed, a review step lists every mark and the exact text it
removes. `review: false` skips it. `scope` bounds where boxes can find text; it
defaults to the whole page.

Marks resolve to `redactRuns`, which you can also build yourself:

```js
Printcraft.print({
  target: '#dossier',
  redactRuns: [{ path: [0, 1, 0], start: 9, end: 23, text: 'Jane Marie Doe' }]
});
```

A run is a path of child indices from the target down to a text node, plus the
character offsets. Nothing is written to the live page at any point.

## Verification

Everything else here is best-effort: a missed exclusion prints an extra
paragraph and somebody notices. A missed redaction prints a name, and the person
who asked for it hidden has no way to find out.

So the assembled document is re-read for every string redaction destroyed, and by
default a leak stops the job:

```js
Printcraft.print({ target: '#d', redactSelectorList: ['.ssn'] });
// RedactionLeakError: PC_REDACTION_LEAK
// the job was stopped because redacted content is still in the print document…
```

| `redactionPolicy` | Behaviour                                                       |
| ----------------- | --------------------------------------------------------------- |
| `strict`          | Default. A leak throws `RedactionLeakError` and nothing prints. |
| `warn`            | Logs the leak and prints anyway.                                |
| `off`             | Skips the check.                                                |

The check costs nothing on a job with no redaction, because there is nothing to
look for. Both text and attributes are searched: a `title` or `alt` carrying the
original is invisible on screen and prints nowhere, but travels with the markup
to a clipboard, an email or a backend.

```js
Printcraft.on('redact:verify', ({ checked, leaked }) => console.log(checked, leaked));
Printcraft.on('redact:leak', ({ where }) => report(where));
```

### What it does not claim

The verifier checks our own work, not yours. Two boundaries worth knowing:

- **It searches for the strings that were destroyed, whole.** Redacting
  `<p>Officer: Jane Marie Doe</p>` records that line. If something later
  reintroduces only `Jane Marie Doe`, that fragment is not one of the strings
  being searched for.
- **Redaction is scoped to what you name.** The same value sitting in a different
  element's `title` was never asked for and is not touched. [Privacy](privacy.md)
  patterns are the tool for finding a value wherever it appears.

## See also

- [Privacy](privacy.md) — pattern-based redaction, when you do not know where the
  sensitive data is
- [Interaction UI](interaction-ui.md) — marking elements for redaction by hand
- [Print backends](../backends.md) — what a backend receives, and why it is the
  redacted copy

---

[← Docs index](../../README.md#documentation)
