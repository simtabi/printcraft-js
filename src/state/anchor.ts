// Finding the same element again after a reload.
//
// A mark is stored against an element, but an element is not a thing that
// survives a page load. What survives is a description good enough to find it
// again, and honest enough to admit when it cannot.
//
// That second half matters more than the first. A redaction that silently
// reattaches to the wrong paragraph prints somebody's address; one that says it
// could not find its element prints nothing and tells you. So every anchor
// carries a fingerprint of the content it was made against, and a candidate that
// does not match it is refused.

/** How an element is described so it can be found again. */
export interface Anchor {
  /** the primary route back: an id, or a path of nth-of-type steps */
  selector: string;
  /** the first 64 characters of its text, normalised */
  text: string;
  /** its tag, as a cheap first filter */
  tag: string;
  /** where it was among its siblings, used only to break a tie */
  index: number;
}

/** Text as we compare it: collapsed, trimmed and cut to a comparable length. */
function fingerprint(el: Element): string {
  return (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 64);
}

/** A css-safe version of an id or class, so `#2fa` and `#a b` do not break the selector. */
function escapeIdent(value: string, doc: Document): string {
  const css = (doc.defaultView as unknown as { CSS?: { escape(v: string): string } })?.CSS;
  if (css?.escape) return css.escape(value);
  return value.replace(/([^\w-])/g, '\\$1');
}

/**
 * Describes an element well enough to find it again.
 *
 * An id wins outright when there is one, because it is the only part of a page
 * an author has promised is stable. Otherwise the path is built from
 * `nth-of-type` steps, which survive a class name changing and a sibling being
 * restyled, though not a sibling being inserted — which is what the fingerprint
 * is there to catch.
 */
export function describe(el: Element): Anchor {
  const doc = el.ownerDocument;
  const base: Omit<Anchor, 'selector'> = {
    text: fingerprint(el),
    tag: el.tagName.toLowerCase(),
    index: 0
  };

  if (el.id) return { ...base, selector: '#' + escapeIdent(el.id, doc) };

  const steps: string[] = [];
  let node: Element | null = el;

  while (node && node.nodeType === 1 && node !== doc.documentElement) {
    const tag = node.tagName.toLowerCase();
    const parent: Element | null = node.parentElement;

    if (!parent) {
      steps.unshift(tag);
      break;
    }
    if (node.id) {
      steps.unshift('#' + escapeIdent(node.id, doc));
      break;
    }

    const sameTag = [...parent.children].filter((c) => c.tagName === node!.tagName);
    const at = sameTag.indexOf(node);
    steps.unshift(sameTag.length > 1 ? `${tag}:nth-of-type(${at + 1})` : tag);
    if (node === el) base.index = at;
    node = parent;
  }

  return { ...base, selector: steps.join(' > ') || base.tag };
}

/** How sure we are that a candidate is the element an anchor was made from. */
export type Confidence = 'exact' | 'likely' | 'lost';

export interface Resolution {
  element: Element | null;
  confidence: Confidence;
  /** why, when it is not exact */
  reason?: string;
}

/**
 * Finds the element an anchor describes, or says it could not.
 *
 * Three outcomes, and the middle one is the point. `exact` means the selector
 * matched and the text is unchanged. `likely` means the text matched but the
 * selector did not, which is what a re-rendered list looks like. `lost` means
 * neither, and nothing is applied.
 */
export function resolve(anchor: Anchor, doc: Document): Resolution {
  let bySelector: Element | null = null;
  try {
    bySelector = doc.querySelector(anchor.selector);
  } catch {
    // a selector we wrote should always parse, but a stored one may predate a
    // fix, and an exception here would take the whole restore down with it
    bySelector = null;
  }

  if (bySelector) {
    if (fingerprint(bySelector) === anchor.text) {
      return { element: bySelector, confidence: 'exact' };
    }
    // otherwise the element is there and holds different words. that is a
    // different element as far as a redaction is concerned, and an anchor made
    // on an empty element is no exception: it now holds words it did not have.
  }

  // the selector moved but the words did not: find them somewhere else
  if (anchor.text) {
    const sameTag = [...doc.getElementsByTagName(anchor.tag)];
    const matches = sameTag.filter((el) => fingerprint(el) === anchor.text);

    if (matches.length === 1) {
      return {
        element: matches[0]!,
        confidence: 'likely',
        reason: 'the page moved it, but the text is unchanged'
      };
    }
    if (matches.length > 1) {
      return {
        element: null,
        confidence: 'lost',
        reason: matches.length + ' elements now hold that text, so none of them is certain'
      };
    }
  }

  return {
    element: null,
    confidence: 'lost',
    reason: bySelector
      ? 'the element is still there but its content changed'
      : 'nothing on the page matches ' + anchor.selector
  };
}
