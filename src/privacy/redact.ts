// redaction, privacy auto-redaction, and clone sanitizing.
//
// redaction is destructive on purpose. a black overlay on live text survives
// copy-paste out of the generated pdf; replacing the text nodes with block
// characters and scrubbing the attributes is the only approach where the print
// artifact itself holds nothing recoverable.

import { toArray } from '../support';
import { fail } from '../support/errors';

export interface PrivacyConfig {
  emails?: boolean;
  phones?: boolean;
  ssn?: boolean;
  creditCards?: boolean;
  custom?: (RegExp | string)[];
}

export const DEFAULT_REDACT_CHAR = '█'; // full block

const PRIVACY_PATTERNS: Record<string, RegExp> = {
  emails: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  phones: /\+?\d[\d\s().-]{7,}\d/g,
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
  creditCards: /\b(?:\d[ -]?){13,16}\b/g
};

/** attributes that can carry the very content being redacted. */
const SCRUB_ATTRS = [
  'title',
  'alt',
  'aria-label',
  'href',
  'src',
  'srcset',
  'value',
  'placeholder',
  'download',
  'poster',
  // ids and names routinely encode the value itself: id="patient-jane-doe"
  'id',
  'name'
];

function eachTextNode(root: Element, fn: (node: Text) => void): void {
  const doc = root.ownerDocument;
  if (!doc) return;
  const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
  const nodes: Text[] = [];
  let n = walker.nextNode();
  while (n) {
    nodes.push(n as Text);
    n = walker.nextNode();
  }
  nodes.forEach(fn);
}

/** covers everything except line breaks, so the bars follow the original layout. */
function blocks(s: string, ch: string): string {
  return s.replace(/[^\n\r]/g, ch);
}

export function scrubAttributes(el: Element): void {
  SCRUB_ATTRS.forEach((a) => el.removeAttribute(a));
  // drop data-* payloads, which may carry the original content
  const toDrop: string[] = [];
  for (let i = 0; i < el.attributes.length; i++) {
    const name = el.attributes[i]!.name;
    if (name.indexOf('data-') === 0) toDrop.push(name);
  }
  toDrop.forEach((a) => el.removeAttribute(a));
}

/**
 * Destructively redacts one element and its whole subtree in the print copy.
 *
 * `sink` collects what was destroyed so the verifier can confirm afterwards that
 * none of it survived into the assembled document.
 */
export function redactElement(el: Element, ch: string, sink?: string[]): void {
  eachTextNode(el, (node) => {
    const original = node.nodeValue || '';
    if (sink && original.trim().length >= 3) sink.push(original.trim());
    node.nodeValue = blocks(original, ch);
  });

  const doc = el.ownerDocument;
  if (doc) {
    const media = el.querySelectorAll('img, picture, video, canvas, svg');
    for (let i = media.length - 1; i >= 0; i--) {
      const node = media[i]!;
      const box = doc.createElement('span');
      box.className = 'pc-redacted-media';
      const w = Number(node.getAttribute('width')) || 80;
      const h = Number(node.getAttribute('height')) || 40;
      box.setAttribute(
        'style',
        'display:inline-block;width:' + w + 'px;height:' + h + 'px;background:#000;'
      );
      if (node.parentNode) node.parentNode.replaceChild(box, node);
    }
  }

  scrubAttributes(el);
  const all = el.querySelectorAll('*');
  for (let i = 0; i < all.length; i++) scrubAttributes(all[i]!);
  el.classList.add('pc-redacted');
}

/**
 * selector-driven and attribute-driven redaction over a detached clone. a bad
 * selector in `redactSelectorList` raises rather than being swallowed: silently
 * skipping it would print the content the caller asked to hide.
 */
export function applyRedaction(
  clone: Element,
  selectors: string[],
  ch: string,
  ns: string,
  sink?: string[]
): void {
  const run = (sel: string, strict: boolean): void => {
    try {
      if (typeof clone.matches === 'function' && clone.matches(sel)) {
        redactElement(clone, ch, sink);
      }
      const found = clone.querySelectorAll(sel);
      for (let i = 0; i < found.length; i++) redactElement(found[i]!, ch, sink);
    } catch {
      if (strict)
        fail(
          'PC_SELECTOR_INVALID',
          "redactSelectorList contains an invalid css selector: '" + sel + "'",
          { selector: sel }
        );
    }
  };
  selectors.forEach((sel) => run(sel, true));
  run('[data-' + ns + '-redact]', false);
}

/**
 * a caller-supplied pattern without the global flag would blank only the first
 * match in each text node, which reads as "it worked" while leaking the rest.
 */
function ensureGlobal(rx: RegExp): RegExp {
  return rx.global ? rx : new RegExp(rx.source, rx.flags + 'g');
}

export function resolvePrivacyPatterns(cfg: PrivacyConfig | true): RegExp[] {
  const c: PrivacyConfig =
    cfg === true ? { emails: true, phones: true, ssn: true, creditCards: true } : cfg;

  const out: RegExp[] = [];
  Object.keys(PRIVACY_PATTERNS).forEach((k) => {
    if ((c as Record<string, unknown>)[k]) out.push(PRIVACY_PATTERNS[k]!);
  });
  toArray(c.custom).forEach((p) => {
    out.push(typeof p === 'string' ? new RegExp(p, 'g') : ensureGlobal(p));
  });
  return out;
}

/** scans every text node and blanks pattern matches in place. returns the hit count. */
export function applyPrivacy(
  clone: Element,
  cfg: PrivacyConfig | true,
  ch: string,
  sink?: string[]
): number {
  const patterns = resolvePrivacyPatterns(cfg);
  let hits = 0;
  eachTextNode(clone, (node) => {
    let value = node.nodeValue || '';
    patterns.forEach((rx) => {
      rx.lastIndex = 0;
      value = value.replace(rx, (m) => {
        hits++;
        if (sink && m.trim().length >= 3) sink.push(m.trim());
        return blocks(m, ch);
      });
    });
    node.nodeValue = value;
  });
  return hits;
}

/** Tags that can execute, navigate or load on their own. */
const KILL =
  'script, noscript, object, embed, iframe, frame, frameset, applet, base, portal, ' +
  // a refresh meta in the print document navigates the frame out from under the
  // job; other metas are harmless but carry nothing worth keeping either
  'meta[http-equiv], link[rel~="import"], template';

/** Attributes that name something to fetch, run, or navigate to. */
const ACTIVE_URL_ATTRS = [
  'href',
  'src',
  'srcdoc',
  'action',
  'formaction',
  'xlink:href',
  'ping',
  'background',
  'data',
  'codebase',
  'longdesc',
  'usemap',
  'profile',
  'manifest',
  'cite'
];

/** Attributes safe to hold a `data:` payload, because they only ever draw. */
const DATA_URI_ALLOWED = new Set(['src', 'srcset', 'poster']);

/**
 * Whether a url is safe in an active position.
 *
 * An allowlist rather than a blocklist. `javascript:` is the obvious one, but
 * `vbscript:`, `data:text/html` and a handful of others all execute too, and a
 * blocklist is a promise to have thought of every scheme anyone will invent.
 */
function safeUrl(value: string, attribute: string): boolean {
  // control characters and html entities are how a blocked scheme gets past a
  // naive check: `java\tscript:` and `java&#x09;script:` both run
  const cleaned = value
    // oxlint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0020\u007f]/g, '')
    .replace(/&#x?[0-9a-f]+;?/gi, '')
    .toLowerCase();

  const scheme = /^([a-z][a-z0-9+.-]*):/.exec(cleaned);
  if (!scheme) return true; // relative, fragment, or query: nothing to execute

  const name = scheme[1]!;
  if (name === 'http' || name === 'https' || name === 'mailto' || name === 'tel') return true;
  if (name === 'blob') return DATA_URI_ALLOWED.has(attribute);
  if (name === 'data') {
    // an image is fine; `data:text/html` is a document that runs
    return DATA_URI_ALLOWED.has(attribute) && cleaned.startsWith('data:image/');
  }
  return false;
}

/**
 * Always-on defence for the print copy.
 *
 * The print document is a fresh same-origin browsing context, so content that
 * was inert on the host page (a script inside a template, an onclick in
 * user-generated markup, a nested iframe) would actually run there. Stripping
 * it costs nothing visually.
 *
 * This is not a general-purpose XSS sanitiser and does not claim to be. It
 * removes what can execute or navigate in a print document, which is a smaller
 * and better-defined problem than sanitising arbitrary untrusted html.
 */
export function sanitizeClone(clone: Element): void {
  const kill = clone.querySelectorAll(KILL);
  for (let i = kill.length - 1; i >= 0; i--) {
    const n = kill[i]!;
    if (n.parentNode) n.parentNode.removeChild(n);
  }

  const everything = [clone].concat(toArray(clone.querySelectorAll('*')));
  everything.forEach((el) => {
    const drop: string[] = [];
    for (let i = 0; i < el.attributes.length; i++) {
      const name = el.attributes[i]!.name.toLowerCase();
      // `on*` is every event handler, and `srcdoc` is a whole document inline
      if (name.indexOf('on') === 0 || name === 'srcdoc') drop.push(el.attributes[i]!.name);
    }
    drop.forEach((a) => el.removeAttribute(a));

    for (const attr of ACTIVE_URL_ATTRS) {
      const value = el.getAttribute(attr);
      if (value && !safeUrl(value, attr)) {
        // `#` rather than removal: a link with no href still reads as a link,
        // and an image with no src leaves a broken-image box on the page
        if (attr === 'href') el.setAttribute(attr, '#');
        else el.removeAttribute(attr);
      }
    }

    // an svg <use> can pull in a whole external document, scripts included
    if (el.tagName.toLowerCase() === 'use') {
      const ref = el.getAttribute('href') || el.getAttribute('xlink:href') || '';
      if (ref && ref[0] !== '#') {
        el.removeAttribute('href');
        el.removeAttribute('xlink:href');
      }
    }
  });
}

export const REDACTION_CSS = [
  '.pc-redacted, .pc-redacted * { background: #000 !important; color: #000 !important;',
  'border-color: #000 !important; text-shadow: none !important; text-decoration: none !important; }',
  '.pc-redacted-media { background: #000 !important; }',
  // a run redacts part of an element, so the element keeps its own styling and
  // only the block characters are painted over
  '.pc-redacted-run { -webkit-print-color-adjust: exact; print-color-adjust: exact; }'
].join(' ');
