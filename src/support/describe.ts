// Saying where an element is, in words.
//
// Used by the notes panel on screen and by the notes page on paper, which is why
// it lives down here rather than in either. Core cannot import the ui layer, and
// a second copy of this would drift the moment one of them was improved.

/**
 * A readable pointer at an element, for a list a person has to scan.
 *
 * Tag, id and the first couple of classes, then enough of the text to recognise
 * it by. The text is what actually identifies it — `p.row` describes forty
 * elements, and `p.row · Total due 1,240.00` describes one.
 *
 * **`quote: false` for anything that prints.** The text this quotes is the
 * element's own content, which for a redacted element is exactly the content
 * being destroyed. Describing a redaction with its text and then printing that
 * description puts the secret back on the paper — the notes page did this once,
 * and the leak verifier stopped the job rather than let it out.
 */
export function describeElement(el: Element, options: { quote?: boolean } = {}): string {
  const tag = el.tagName.toLowerCase();
  const id = el.id ? '#' + el.id : '';
  const cls = el.classList.length ? '.' + [...el.classList].slice(0, 2).join('.') : '';
  if (options.quote === false) return tag + id + cls;

  const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  return tag + id + cls + (text ? ' · ' + text + (text.length >= 40 ? '…' : '') : '');
}
