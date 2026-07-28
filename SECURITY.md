# Security policy

## Reporting a vulnerability

Email **opensource@simtabi.com** with the details. Please do not open a public
issue for a security problem.

Include what you have: the affected version, a description of the issue, and a
reproduction if one is available. You will get an acknowledgement within three
working days and an assessment within ten. If the report is confirmed, we will
agree a disclosure timeline with you before publishing anything.

## Supported versions

| Version | Supported |
| ------- | --------- |
| 1.2.x   | Yes       |
| < 1.2   | No        |

## Scope

Printcraft runs entirely in the browser with no server component and no runtime
dependencies, so its security surface is the print copy it builds. Reports in
these areas are in scope:

- **Sanitizer bypass.** The print document is a fresh same-origin browsing
  context. Content that was inert on the host page executes there, so scripts,
  `object`/`embed`/`iframe` elements, inline `on*` handlers, and `javascript:`
  URLs are stripped from every clone. A way to get executable content past that
  is a vulnerability.
- **Redaction recovery.** Redaction is destructive by design: text nodes become
  block characters, media becomes black boxes, and identifying attributes —
  including `id` and `name` — are scrubbed. If any redacted value is recoverable
  from the assembled print document or the resulting PDF, that is a vulnerability.
- **Privacy scan leakage.** A pattern that should match a supported PII class
  (emails, phone numbers, SSNs, card numbers) but leaves it readable.
- **CSS or markup injection** through option values that reach the generated
  stylesheet or the print document.

Out of scope: the browser's own print dialog and PDF writer, content the host
page chooses not to exclude or redact, and popup-blocker behaviour.

## Hardening notes

- The sanitizer runs on every job by default. `sanitize: false` disables it, and
  is only appropriate for content you fully control.
- Redaction removes the underlying data. An overlay would survive copy-paste out
  of a generated PDF; this does not, which is the point.
- Passwords and file inputs are never serialized into the print copy, even with
  `preserveFormState` on.
