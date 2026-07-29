// Checking that redaction actually happened.
//
// Every other part of this library is best-effort: if an exclusion selector
// misses, you get an extra paragraph on the page. Redaction is not like that. A
// miss puts a name, an account number or a medical detail on paper, and the
// person who asked for it to be hidden has no way to know it did not work.
//
// So the print document is re-read before it goes anywhere, looking for the
// exact strings redaction was told to destroy. Finding one means something in
// the pipeline put the content back: a transform that re-cloned from the live
// page, a hook that undid the change, an attribute nobody thought to scrub. The
// job stops rather than printing.
//
// This is a check on our own work, not a content scanner. It cannot know what
// you meant to hide, only whether what you named is still there.

export type RedactionPolicy = 'strict' | 'warn' | 'off';

export interface RedactionReport {
  /** how many strings were checked */
  checked: number;
  /** the ones still findable in the print document */
  leaked: string[];
  /** where each leak turned up, so the cause is traceable */
  where: Record<string, string[]>;
}

/** Strings too short or too generic to search for without false positives. */
function worthChecking(secret: string): boolean {
  const trimmed = secret.trim();
  if (trimmed.length < 3) return false;
  // a redacted "and" would match half the document and abort every job
  return /[^\s\p{P}]/u.test(trimmed);
}

function attributeHits(doc: Document, secret: string): string[] {
  const hits: string[] = [];
  const all = doc.querySelectorAll('*');

  for (let i = 0; i < all.length && hits.length < 4; i++) {
    const el = all[i]!;
    for (let a = 0; a < el.attributes.length; a++) {
      const attr = el.attributes[a]!;
      if (attr.value.includes(secret)) {
        hits.push(el.tagName.toLowerCase() + '[' + attr.name + ']');
        break;
      }
    }
  }
  return hits;
}

/**
 * Re-reads the assembled document for anything redaction should have destroyed.
 *
 * Text and attributes are checked separately, because they leak differently: a
 * `title` or `alt` carrying the original is invisible on screen and prints
 * nowhere, but travels with the markup to a clipboard, an email or a backend.
 */
export function verifyRedaction(doc: Document, secrets: string[]): RedactionReport {
  const checkable = [...new Set(secrets)].filter(worthChecking);
  const where: Record<string, string[]> = {};
  const leaked: string[] = [];

  const text = doc.body?.textContent || '';

  for (const secret of checkable) {
    const found: string[] = [];
    if (text.includes(secret)) found.push('text');
    found.push(...attributeHits(doc, secret));

    if (found.length) {
      leaked.push(secret);
      where[secret] = found;
    }
  }

  return { checked: checkable.length, leaked, where };
}

/** What a caller sees when the verifier finds something. */
export class RedactionLeakError extends Error {
  readonly code = 'PC_REDACTION_LEAK';
  readonly report: RedactionReport;

  constructor(report: RedactionReport) {
    const list = report.leaked
      .slice(0, 3)
      .map((s) => JSON.stringify(s.length > 40 ? s.slice(0, 40) + '…' : s))
      .join(', ');
    const more = report.leaked.length > 3 ? ' and ' + (report.leaked.length - 3) + ' more' : '';

    super(
      'Printcraft: the job was stopped because redacted content is still in the print ' +
        'document: ' +
        list +
        more +
        '. Something after redaction put it back. Check any transform, hook or ' +
        'custom backend that re-reads the page. Set redactionPolicy: "warn" to print anyway.'
    );
    this.name = 'RedactionLeakError';
    this.report = report;
  }
}
