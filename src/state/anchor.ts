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
  /**
   * For an element with no words: what it is made of. Its tag, the attributes
   * that name its content (an image's file, an input's name), and the tags it
   * holds. Absent on text-bearing elements and on anchors from older builds.
   */
  shape?: string;
  /** For an element with no words: the text either side of it, `before|after`. */
  context?: string;
}

/** Text as we compare it: collapsed, trimmed and cut to a comparable length. */
function fingerprint(el: Element): string {
  return (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 64);
}

/**
 * Attributes that say what an empty element *is*, rather than how it looks or
 * what state it is in. Classes restyle and values get typed into, so neither is
 * here. Read in this order so the fingerprint is stable.
 */
const NAMING = [
  'src',
  'srcset',
  'href',
  'alt',
  'name',
  'type',
  'role',
  'aria-label',
  'title',
  'for'
];

/** `/media/chart.png?v=7` is `chart.png`: a cache-busting query is the same file. */
const basename = (url: string): string =>
  url.trim().split(/\s/)[0]!.split(/[?#]/)[0]!.split('/').pop() || '';

/**
 * A `data-` attribute that looks authored rather than generated.
 *
 * `data-v-3f2a1c` (scoped css), `data-reactid` and anything holding a long
 * number or hex run is a build or runtime artefact, and changes when nothing
 * about the content did. Ours are marks, not identity.
 */
function stableData(name: string, value: string): boolean {
  return (
    !/^data-(printcraft|prjs|v-|react)/.test(name) &&
    !/[0-9a-f]{6,}|\d{4,}/i.test(name + value) &&
    value.length <= 40
  );
}

/**
 * The structural fingerprint of an element with no words.
 *
 * This is the role a quote plays for text, borrowed from how annotation tools
 * re-anchor: a locator (here the selector) proposes a candidate and a content
 * check confirms it. With no text to quote, what an element is made of is the
 * content: an image's file, an input's name, a container's children.
 */
export function shapeOf(el: Element): string {
  const parts = [el.tagName.toLowerCase()];
  for (const name of NAMING) {
    const value = el.getAttribute(name);
    if (value == null || value === '') continue;
    parts.push(
      name +
        '=' +
        (name === 'src' || name === 'srcset' || name === 'href' ? basename(value) : value)
    );
  }
  for (const attr of el.attributes) {
    if (attr.name.startsWith('data-') && stableData(attr.name, attr.value)) {
      parts.push(attr.name + '=' + attr.value);
    }
  }
  // the declared size, as a ratio: survives a responsive resize, and is known
  // before the image has loaded, which a natural size is not
  const w = parseFloat(el.getAttribute('width') || '');
  const h = parseFloat(el.getAttribute('height') || '');
  if (w > 0 && h > 0) parts.push('ratio=' + Math.round((w / h) * 100) / 100);
  // our own overlay (a drawing's svg) is not part of what the page put there
  const kids = [...el.children]
    .filter((c) => !c.hasAttribute('data-prjs-ui'))
    .slice(0, 8)
    .map((c) => c.tagName.toLowerCase());
  if (kids.length) parts.push('>' + kids.join(','));
  return parts.join('|');
}

/**
 * The words either side of an element, `before|after`, 32 characters each.
 *
 * Read from the nearest ancestor that has any, so it is about the element's
 * neighbourhood rather than the whole page: an insertion three sections away
 * does not change it.
 */
export function contextOf(el: Element): string {
  const doc = el.ownerDocument;
  // stops below <html>, whose text includes the <title>
  for (let at = el.parentElement; at && at !== doc.documentElement; at = at.parentElement) {
    if (!fingerprint(at)) continue;
    const range = doc.createRange();
    range.setStart(at, 0);
    range.setEndBefore(el);
    const before = range.toString().replace(/\s+/g, ' ').trim().slice(-32);
    range.setStartAfter(el);
    range.setEnd(at, at.childNodes.length);
    const after = range.toString().replace(/\s+/g, ' ').trim().slice(0, 32);
    return before + '|' + after;
  }
  return '|';
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
  // no words to recognise it by, so record what it is made of and what is
  // around it instead
  if (!base.text) {
    base.shape = shapeOf(el);
    base.context = contextOf(el);
  }

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

  // an element with no words, described by what it is made of
  if (!anchor.text && anchor.shape !== undefined) return resolveShape(anchor, bySelector, doc);

  if (bySelector && fingerprint(bySelector) === anchor.text) {
    return { element: bySelector, confidence: 'exact' };
  }
  // otherwise the element is there and holds different words. that is a
  // different element as far as a redaction is concerned, and an anchor made
  // on an empty element is no exception: it now holds words it did not have.

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

/**
 * The same three outcomes, for an element with no words.
 *
 * `exact` needs the selector, the shape and the surrounding words to agree.
 * `likely` is the one element on the page with that shape and those words,
 * which is what an unrelated sibling inserted before it looks like. Anything
 * else is `lost` — including an element so plain (no naming attributes, no
 * children, no words around it) that two of them cannot be told apart, which is
 * trusted only through an id, the one thing an author promised is stable.
 */
function resolveShape(anchor: Anchor, bySelector: Element | null, doc: Document): Resolution {
  const same = (el: Element): boolean =>
    el.tagName.toLowerCase() === anchor.tag &&
    !fingerprint(el) &&
    shapeOf(el) === anchor.shape &&
    (anchor.context === undefined || contextOf(el) === anchor.context);

  const byId = /^#[^\s>+~]+$/.test(anchor.selector);
  const plain = anchor.shape === anchor.tag && (anchor.context || '|') === '|';
  if (plain && !byId) {
    return {
      element: null,
      confidence: 'lost',
      reason: 'nothing tells this element apart from another like it'
    };
  }

  if (bySelector && same(bySelector)) return { element: bySelector, confidence: 'exact' };

  const matches = [...doc.getElementsByTagName(anchor.tag)].filter(same);
  if (matches.length === 1) {
    return {
      element: matches[0]!,
      confidence: 'likely',
      reason: 'the page moved it, but what it is and what surrounds it are unchanged'
    };
  }
  return {
    element: null,
    confidence: 'lost',
    reason: matches.length
      ? matches.length + ' elements now look the same, so none of them is certain'
      : bySelector
        ? 'the element is still there but it is no longer the same thing'
        : 'nothing on the page matches ' + anchor.selector
  };
}
