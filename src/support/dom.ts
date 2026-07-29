// dom helpers used by every stage of the pipeline.

/** normalizes a value, array, or array-like (NodeList/HTMLCollection) into an array. */
export function toArray<T>(x: T | T[] | ArrayLike<T> | null | undefined): T[] {
  if (x == null) return [];
  if (Array.isArray(x)) return x.slice();
  const maybe = x as { length?: unknown; item?: unknown };
  if (
    typeof x !== 'string' &&
    typeof x !== 'function' &&
    typeof maybe.length === 'number' &&
    typeof maybe.item === 'function'
  ) {
    const out: T[] = [];
    const list = x as ArrayLike<T>;
    for (let i = 0; i < list.length; i++) out.push(list[i] as T);
    return out;
  }
  return [x as T];
}

export function isElement(x: unknown): x is Element {
  return !!x && typeof x === 'object' && (x as Node).nodeType === 1;
}

export function escapeHtml(s: unknown): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** runs `fn` over every descendant matching `selector`, and over `rootEl` itself. */
export function eachInclusive(rootEl: Element, selector: string, fn: (el: Element) => void): void {
  if (typeof rootEl.matches === 'function' && rootEl.matches(selector)) fn(rootEl);
  toArray(rootEl.querySelectorAll(selector)).forEach(fn);
}

/** the element itself (when it matches) followed by every matching descendant. */
export function selfAndMatches(root: Element, selector: string): Element[] {
  const out: Element[] = [];
  if (typeof root.matches === 'function' && root.matches(selector)) out.push(root);
  return out.concat(toArray(root.querySelectorAll(selector)));
}

/**
 * swaps `el` for `next` in the tree. returns false when `el` is detached, i.e.
 * it is a clone root, in which case the caller owns the reference and must adopt
 * `next` itself. a detached node has no parent to be replaced in, and morphing it
 * in place cannot change its tag name.
 */
export function replaceNode(el: Element, next: Element): boolean {
  const parent = el.parentNode;
  if (!parent) return false;
  parent.replaceChild(next, el);
  return true;
}

export function removeNode(el: Element): void {
  if (el.parentNode) el.parentNode.removeChild(el);
}
