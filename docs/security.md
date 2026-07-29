# Security

What is defended, what redaction guarantees, and what is out of scope.

## The threat model

Printcraft takes content from a page and builds a second document from it. Three things follow from that, and they are the whole model:

1. **The print document is a real browsing context.** It is a same-origin iframe or window, so content that was inert where it came from (a script inside a `<template>`, an `onclick` in user-generated markup, a nested iframe) would actually execute there. The sanitiser exists for this.
2. **The print copy outlives the page.** It becomes a PDF, a file, a clipboard payload, an email attachment. Anything left in it travels, and cannot be recalled. Redaction exists for this.
3. **The library never sends anything anywhere.** No telemetry, no analytics, no network request the caller did not configure. A print job touches the network only to load the assets the content already references.

## The sanitiser

Runs on every job unless `sanitize: false`. It operates on the detached clone, so the live page is never modified.

**Removed outright:** `script`, `noscript`, `object`, `embed`, `iframe`, `frame`, `frameset`, `applet`, `base`, `portal`, `template`, `meta[http-equiv]`, `link[rel~=import]`.

`base` is worth naming: the print document sets its own, pointing at the host page, so that relative urls resolve. A second `<base>` from the content would silently repoint every image and stylesheet in the document.

**Attributes removed:** every `on*` handler, whatever its casing, and `srcdoc`.

**URLs checked** in `href`, `src`, `action`, `formaction`, `xlink:href`, `ping`, `background`, `data`, `codebase`, `longdesc`, `usemap`, `profile`, `manifest` and `cite`.

The check is an allowlist. `http`, `https`, `mailto` and `tel` pass; `data:image/*` passes in `src`, `srcset` and `poster`, because those only ever draw. Everything else is refused. A blocklist would be a promise to have thought of every scheme anyone will invent, and `javascript:` was never the only one: `vbscript:` and `data:text/html` execute too.

Control characters and html entities are stripped before the scheme is read, because `java&#x09;script:` and `java\tscript:` both run in browsers that accept them.

An `href` that fails becomes `#` rather than disappearing, so a link still reads as a link. Other attributes are removed, because an image with no `src` leaves a broken-image box on the page.

**SVG `<use>`** may reference the same document only. An external reference can pull in a whole document, scripts included.

### What it is not

Not a general-purpose XSS sanitiser, and it does not claim to be. It removes what can execute or navigate **in a print document**, which is a smaller and better-defined problem than sanitising arbitrary untrusted html for display.

If you are rendering content from strangers, sanitise it on the way in with something built for that, such as DOMPurify. This is a second line, not the first.

## Redaction

[The full page](tools/redaction.md) covers the mechanics. What matters here is what it guarantees.

**It guarantees** that for every element you name, in the print copy: the text nodes are replaced with block characters, `img`/`picture`/`video`/`canvas`/`svg` become black boxes, and these attributes are removed: `title`, `alt`, `aria-label`, `href`, `src`, `srcset`, `value`, `placeholder`, `download`, `poster`, `id`, `name`, and every `data-*`.

`id` and `name` go because they routinely encode the value being hidden: `id="patient-jane-doe"`, `name="ssn-123-45-6789"`.

**It is destructive on purpose.** A black overlay drawn over live text survives copy-paste out of a generated PDF, because the characters are still there under the paint. Replacing them is the only approach where the artifact itself holds nothing recoverable.

**It is verified.** The assembled document is re-read for every string redaction destroyed, after pagination and every other stage that could have put content back. A hit throws `PC_REDACTION_LEAK` and the job does not print. See [redaction](tools/redaction.md#verification) for the policy settings.

**It does not guarantee** anything about content you did not name. Redaction is scoped to your selectors and rectangles; the same value sitting in an element nobody mentioned is untouched. [Privacy patterns](tools/privacy.md) are the tool for finding a value wherever it appears.

**The verifier checks whole strings.** Redacting `<p>Officer: Jane Doe</p>` records that line. If something later reintroduces only `Jane Doe`, that fragment is not one of the strings being searched for.

## Where content can go

Every route out of the browser starts from the transformed clone rather than the live page. That is deliberate, and it is what makes a redacted document stay redacted in a png, a clipboard payload and an attachment.

| Route                      | What travels                                  | Who decides                          |
| -------------------------- | --------------------------------------------- | ------------------------------------ |
| The printer                | The assembled document                        | The user, in the browser's dialog    |
| `share.screenshot`         | Pixels of the transformed clone               | Your call site                       |
| `share.copy` / `copyImage` | The transformed markup or its pixels          | A user gesture; browsers require one |
| `share.email`              | The message and its attachment                | The user, in the compose window      |
| A `PrintBackend`           | `RenderedJob.html` — the transformed document | You, by installing one               |

Nothing sends itself. A message goes when somebody presses Send, never as a side effect of a print, and there is a test that fails if that ever changes.

### Email

No vendor adapters and no keys. A browser cannot hold an API credential safely, because anything shipped to the page is readable by anyone who opens devtools. The library composes a message and hands it to a `transport` you write, which talks to your own server.

`allowedRecipients` restricts where a message may go, as exact addresses or `@domain` suffixes, checked on `cc` as well as `to`, before the transport is called.

Without a transport, `mailto:` opens the user's mail client. It cannot carry the attachment, and the compose window says so next to the file rather than letting anyone assume it went.

### Backends

A backend receives `RenderedJob`, the finished, transformed, redacted document, and never a selector or the live page. A backend that could resolve content itself would be able to ship the original past redaction.

If you install one that sends over the network, the content leaves the browser. Satisfy yourself that the redaction it carries is the redaction you intended. [docs/backends.md](backends.md) has the rules a localhost companion has to follow: loopback only, an origin allowlist, per-origin consent in its own interface, and signed requests where it runs unattended.

## Selector injection

Selectors are interpolated into a generated stylesheet, so a `}` or a comment opener would close the rule and let arbitrary css through. `pageBreakBeforeSelectors`, `pageBreakAfterSelectors` and `avoidBreakSelectors` reject `{`, `}`, `<` and `/*` with `PC_SELECTOR_UNSAFE`. A valid css selector never contains them, so the restriction costs nothing.

An invalid selector in `redactSelectorList` throws rather than being skipped. Silently ignoring it would print the content the caller asked to hide, which is the worst failure this library has.

## Reporting

Send anything you find to **opensource@simtabi.com** rather than opening an issue. See [SECURITY.md](../SECURITY.md) for the disclosure process.

Useful in a report: the markup that carries it, which route it reaches (print, screenshot, clipboard, email, backend), and what an attacker gets. A page that can print its own content in a surprising way is a bug; a page that can read another origin's is a serious one.

## See also

- [Redaction](tools/redaction.md) — the mechanics and the verifier
- [Privacy](tools/privacy.md) — pattern-based scanning
- [Print backends](backends.md) — the rules for a companion service
- [Architecture](architecture.md) — why the pipeline works on a clone

---

[← Docs index](../README.md#documentation)
