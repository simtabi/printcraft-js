# Redaction

Destructive, declassified-file bars: the print copy holds nothing recoverable.

## Why destructive

A black overlay drawn over live text survives copy-paste out of a generated PDF —
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
- The element gains a `pc-redacted` class, and the generated stylesheet paints it
  and everything inside it solid black

`id` and `name` are scrubbed because they routinely encode the very value being
hidden — `id="patient-jane-doe"`, `name="ssn-123-45-6789"`. `class` survives,
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
surface, which is what makes the UI layer's redact mode work — it simply writes
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

## See also

- [Privacy](privacy.md) — pattern-based redaction, when you do not know where the
  sensitive data is
- [Interaction UI](interaction-ui.md) — marking elements for redaction by hand

---

[← Docs index](../../README.md#documentation)
