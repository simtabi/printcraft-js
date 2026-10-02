// reading the live tree. detached clones have no layout and no canvas pixels, so
// anything measurable is captured here first, keyed by a temporary data-prjs-id,
// and applied to the clone later.

import { DATA_ID, FORBIDDEN_TAGS, isElement, selfAndMatches, toArray } from '../support';
import { resolveSheet } from '../production/sheets';
import type {
  ClipRect,
  ElementMeta,
  Measurement,
  MetaMap,
  PrintTarget,
  ResolvedOptions
} from '../types';
import { fail } from '../support/errors';

const FORM_FIELDS = 'input, textarea, select';

/**
 * resolves selectors, elements, and arrays of either into a deduped element list.
 * the same element reached through two selectors is one target, not two.
 */
export function resolveTargets(target: PrintTarget, doc: Document): Element[] {
  const found: Element[] = [];
  const seen = new Set<Element>();

  toArray(target as string | Element | Array<string | Element>).forEach((t) => {
    if (isElement(t)) {
      if (!seen.has(t)) {
        seen.add(t);
        found.push(t);
      }
      return;
    }
    if (typeof t !== 'string')
      fail('PC_TARGET_INVALID', 'target must be a css selector or an element', { target: t });
    const matches = doc.querySelectorAll(t);
    if (!matches.length)
      fail('PC_TARGET_NOT_FOUND', "no elements match target '" + t + "'", { target: t });
    for (let i = 0; i < matches.length; i++) {
      const el = matches[i]!;
      if (!seen.has(el)) {
        seen.add(el);
        found.push(el);
      }
    }
  });

  found.forEach((el) => {
    if (FORBIDDEN_TAGS.indexOf(el.tagName) !== -1) {
      fail(
        'PC_TARGET_UNPRINTABLE',
        'tag <' + el.tagName.toLowerCase() + '> cannot be a print target',
        { tag: el.tagName.toLowerCase() }
      );
    }
  });
  return found;
}

/**
 * One owner per measurement, so two jobs on one page never hand out the same id.
 *
 * A bare counter starting at 1 for every job meant two open proofs tagged
 * different elements `1`, `2`, `3`…, and a mark made on either was carried to
 * whichever element `querySelector` found first. The owner prefix is what lets a
 * proof release its own links and nobody else's.
 */
let measureSeq = 0;

/**
 * Owners whose links a proof is holding open, with how many proofs hold each.
 *
 * Two proofs over the same subtree share the id the first one wrote, so an
 * owner's links come down only when the last proof using them closes, and a
 * print job's sweep leaves them alone.
 */
const heldLinks = new Map<string, number>();

function ownerOf(id: string): string {
  const at = id.indexOf('-');
  return at === -1 ? '' : id.slice(0, at);
}

/** removes every link under the roots that no open proof is holding */
function sweep(roots: Element[]): void {
  roots.forEach((rootEl) => {
    selfAndMatches(rootEl, '[' + DATA_ID + ']').forEach((el) => {
      if (!heldLinks.has(ownerOf(el.getAttribute(DATA_ID) || ''))) el.removeAttribute(DATA_ID);
    });
  });
}

/** releases what a holding measurement took, and strips an owner nobody holds */
function releaseOwners(owners: Set<string>, doc: Document | null): number {
  let removed = 0;
  for (const owner of owners) {
    const left = (heldLinks.get(owner) || 1) - 1;
    if (left > 0) {
      heldLinks.set(owner, left);
      continue;
    }
    heldLinks.delete(owner);
    if (!doc) continue;
    for (const el of doc.querySelectorAll('[' + DATA_ID + '^="' + owner + '-"]')) {
      el.removeAttribute(DATA_ID);
      removed++;
    }
  }
  owners.clear();
  return removed;
}

/**
 * captures what only the live tree knows (canvas pixels, laid-out image sizes,
 * the resolved `currentSrc`, hidden elements, scrollable regions), tagging each
 * measured element so the matching clone node can be found again.
 */
export function measureLiveTree(
  targets: Element[],
  options: ResolvedOptions,
  win: Window,
  /** tag every element, not only the ones being measured. see below. */
  tagAll = false
): Measurement {
  const meta: MetaMap = {};
  const owner = 'j' + ++measureSeq;
  /** the owners this measurement holds open, its own and any it reused */
  const holds = new Set<string>();
  let counter = 0;

  function tag(el: Element): ElementMeta {
    let id = el.getAttribute(DATA_ID);
    // a proof reuses a link another open proof holds, and replaces a stale one:
    // nothing would keep a leftover on the page for as long as this proof needs it
    const from = id ? ownerOf(id) : '';
    if (!id || (tagAll && from !== owner && !heldLinks.has(from))) {
      id = owner + '-' + ++counter;
      el.setAttribute(DATA_ID, id);
    }
    if (tagAll) {
      const held = ownerOf(id);
      if (!holds.has(held)) {
        holds.add(held);
        heldLinks.set(held, (heldLinks.get(held) || 0) + 1);
      }
    }
    return (meta[id] ||= {});
  }

  targets.forEach((rootEl) => {
    const all = [rootEl].concat(toArray(rootEl.querySelectorAll('*')));
    all.forEach((el) => {
      const tn = el.tagName;

      // The proof sheet needs every element identifiable, not only the ones with
      // something to measure.
      //
      // A mark made on the proof is written back to the page element behind it,
      // and `data-prjs-id` is the only thing the two documents share. Tagging
      // the whole subtree is a few thousand setAttribute calls on a large page,
      // which is why it happens for the one mode that needs it rather than for
      // every job.
      if (tagAll) tag(el);

      if (tn === 'CANVAS' && options.printCanvas) {
        const canvas = el as HTMLCanvasElement;
        const m = tag(el);
        try {
          m.canvasData = canvas.toDataURL('image/png');
          m.canvasW = canvas.width;
          m.canvasH = canvas.height;
        } catch {
          /* tainted canvas: leave the element as-is */
        }
      }

      if (tn === 'IMG' && (options.removeImages || options.forceLazyImages)) {
        const img = el as HTMLImageElement;
        const mi = tag(el);
        const rect = img.getBoundingClientRect();
        mi.imgW = Math.round(rect.width) || img.width || 0;
        mi.imgH = Math.round(rect.height) || img.height || 0;
        mi.currentSrc = img.currentSrc || img.src || '';
      }

      if (options.revealHiddenElements) {
        const cs = win.getComputedStyle(el);
        if (cs && cs.display === 'none') tag(el).wasHidden = true;
      }

      if (options.extendScrollableAreas) {
        const st = win.getComputedStyle(el);
        const scrollable =
          !!st &&
          (st.overflowY === 'auto' ||
            st.overflowY === 'scroll' ||
            st.overflow === 'auto' ||
            st.overflow === 'scroll') &&
          el.scrollHeight > el.clientHeight + 1;
        if (scrollable) {
          const isTableish =
            options.extendScrollableAreas !== 'table' ||
            el.querySelector('table') !== null ||
            el.tagName === 'TABLE';
          if (isTableish) tag(el).scrollable = true;
        }
      }
    });
  });

  return {
    meta,
    /**
     * sweeps the whole target subtree rather than only the ids this pass wrote,
     * so a tag left behind by an earlier job that threw mid-measure is cleaned up
     * too instead of polluting the live dom forever. links an open proof is
     * holding are the one exception: they are in use, not left behind.
     */
    cleanup() {
      sweep(targets);
    },
    release() {
      return releaseOwners(holds, targets[0]?.ownerDocument || null);
    }
  };
}

/**
 * copies live field state into clone markup. `cloneNode` carries attributes, not
 * the value/checked/selected *properties*, so a printed form would otherwise come
 * out blank. passwords and file inputs are deliberately never serialized.
 */
export function snapshotFormState(liveRoot: Element, cloneRoot: Element): void {
  const liveFields = selfAndMatches(liveRoot, FORM_FIELDS);
  const cloneFields = selfAndMatches(cloneRoot, FORM_FIELDS);

  for (let i = 0; i < liveFields.length && i < cloneFields.length; i++) {
    const live = liveFields[i] as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    const copy = cloneFields[i]!;
    const tn = live.tagName;

    if (tn === 'TEXTAREA') {
      copy.textContent = (live as HTMLTextAreaElement).value;
    } else if (tn === 'SELECT') {
      const lo = (live as HTMLSelectElement).options;
      const co = (copy as HTMLSelectElement).options;
      for (let j = 0; j < lo.length && j < co.length; j++) {
        if (lo[j]!.selected) co[j]!.setAttribute('selected', 'selected');
        else co[j]!.removeAttribute('selected');
      }
    } else {
      const input = live as HTMLInputElement;
      if (input.type === 'checkbox' || input.type === 'radio') {
        if (input.checked) copy.setAttribute('checked', 'checked');
        else copy.removeAttribute('checked');
      } else if (input.type !== 'password' && input.type !== 'file') {
        copy.setAttribute('value', input.value);
      }
    }
  }
}

export function cloneTargets(targets: Element[], options: ResolvedOptions): Element[] {
  return targets.map((el) => {
    const clone = el.cloneNode(true) as Element;
    if (options.preserveFormState) snapshotFormState(el, clone);
    return clone;
  });
}

/** copies each element's open shadow root content into the matching clone node. */
export function applyShadowFlatten(liveTargets: Element[], clones: Element[]): void {
  for (let t = 0; t < liveTargets.length; t++) {
    const live = liveTargets[t];
    const clone = clones[t];
    if (!live || !clone) continue;
    const liveAll = [live].concat(toArray(live.querySelectorAll('*')));
    const cloneAll = [clone].concat(toArray(clone.querySelectorAll('*')));
    for (let i = 0; i < liveAll.length && i < cloneAll.length; i++) {
      const sr = liveAll[i]!.shadowRoot;
      if (sr) cloneAll[i]!.innerHTML = sr.innerHTML;
    }
  }
}

/**
 * clones the whole body and clips it to a page-coordinate rectangle: a fixed-size
 * overflow-hidden viewport whose inner layer is offset by the rectangle's origin.
 * printcraft's own ui and any scripts are stripped before anything else.
 */
export function buildClipClone(
  srcDoc: Document,
  rect: ClipRect,
  options: ResolvedOptions
): Element {
  const body = srcDoc.body;
  const bodyClone = body.cloneNode(true) as Element;
  if (options.preserveFormState) snapshotFormState(body, bodyClone);

  ['script', 'noscript', '[data-prjs-frame]', '[data-prjs-inspector]', '[data-prjs-ui]'].forEach(
    (sel) => {
      const list = bodyClone.querySelectorAll(sel);
      for (let i = list.length - 1; i >= 0; i--) {
        const n = list[i]!;
        if (n.parentNode) n.parentNode.removeChild(n);
      }
    }
  );

  // The rectangle was drawn against the page as it looked on screen. Reproduce
  // that layout rather than the paper's: relaying out at the sheet width moves
  // everything, and the region then frames whatever happens to land there.
  const sourceWidth = clipSourceWidth(srcDoc, rect);

  // Fit the region to the sheet, never enlarging it: a 1200px-wide selection has
  // to come down to 794px of A4, and a 300px one is already fine.
  //
  // Capture mode skips this. The raster is fitted to the sheet when it is placed
  // on the page, and scaling here as well would shrink the content inside a
  // full-size frame. the four process inks ended up filling the left 62% of the
  // image with white beside them.
  const sheet = resolveSheet(options.setPrintSize);
  const scale = options.clipMode === 'capture' ? 1 : Math.min(1, sheet.width / rect.width);

  const viewport = srcDoc.createElement('div');
  viewport.className = 'prjs-clip-viewport';
  viewport.setAttribute(
    'style',
    'position:relative;overflow:hidden;' +
      'width:' +
      round(rect.width * scale) +
      'px;' +
      'height:' +
      round(rect.height * scale) +
      'px;'
  );

  // the stage carries the scale so the viewport keeps a truthful printed size
  const stage = srcDoc.createElement('div');
  stage.className = 'prjs-clip-stage';
  stage.setAttribute(
    'style',
    'position:absolute;left:0;top:0;transform-origin:top left;' +
      'width:' +
      rect.width +
      'px;height:' +
      rect.height +
      'px;' +
      (scale === 1 ? '' : 'transform:scale(' + round(scale, 4) + ');')
  );

  const inner = srcDoc.createElement('div');
  inner.className = 'prjs-clip-inner';
  inner.setAttribute(
    'style',
    'position:absolute;left:' +
      -rect.x +
      'px;top:' +
      -rect.y +
      'px;width:' +
      sourceWidth +
      'px;' +
      inheritedText(srcDoc)
  );

  while (bodyClone.firstChild) inner.appendChild(bodyClone.firstChild);
  stage.appendChild(inner);
  viewport.appendChild(stage);
  return viewport;
}

/**
 * The text properties `<body>` hands down, as an inline declaration.
 *
 * The clip moves the body's children into a plain div, and a capture then
 * renders that div inside an svg foreignObject, where no `html`, `body` or
 * `:root` rule and no class on `<body>` can reach it. Everything that inherited
 * its font from the body fell back to the user agent's serif, every line wrapped
 * differently, and on a long page the content drifted hundreds of pixels: the
 * region framed whatever slid into the rectangle rather than what was selected,
 * so a redacted block could be pushed out of its own capture entirely.
 * Measured on the demo: the memo sits at 3789px live and the capture showed the
 * sections below it.
 */
const INHERITED_TEXT = [
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'font-stretch',
  'font-variant',
  'font-feature-settings',
  'font-variation-settings',
  'font-kerning',
  'line-height',
  'letter-spacing',
  'word-spacing',
  'text-transform',
  'text-rendering',
  'text-align',
  'white-space',
  'direction',
  'writing-mode',
  'tab-size',
  'color'
];

function inheritedText(srcDoc: Document): string {
  const body = srcDoc.body;
  const view = srcDoc.defaultView;
  if (!body || !view || typeof view.getComputedStyle !== 'function') return '';
  const cs = view.getComputedStyle(body);
  let out = '';
  for (const prop of INHERITED_TEXT) {
    const value =
      prop === 'line-height' ? inheritedLineHeight(body, cs) : cs.getPropertyValue(prop);
    // a value carrying a quote or semicolon is written as-is by the engine, so
    // it is safe inside an attribute; an empty one is left to the cascade
    if (value && value.indexOf(';') === -1) out += prop + ':' + value + ';';
  }
  return out;
}

/**
 * `line-height` is the one inherited property whose computed value lies.
 *
 * A unitless `1.5` inherits as a ratio, so a 36px heading gets 54px lines; the
 * computed value on the body reads `24px`, and copying that gives the heading
 * 24px lines instead. So ask a probe: a child at a different font size shows
 * whether the body passes down a ratio or a length.
 */
function inheritedLineHeight(body: Element, cs: CSSStyleDeclaration): string {
  const value = cs.getPropertyValue('line-height');
  const own = parseFloat(value);
  const size = parseFloat(cs.getPropertyValue('font-size'));
  if (!value.endsWith('px') || !own || !size) return value;

  const doc = body.ownerDocument;
  const view = doc.defaultView;
  if (!view) return value;
  const probe = doc.createElement('span');
  probe.setAttribute('style', 'position:absolute;visibility:hidden;font-size:' + size * 2 + 'px;');
  body.appendChild(probe);
  const child = parseFloat(view.getComputedStyle(probe).getPropertyValue('line-height'));
  probe.remove();

  // the child doubled with its font: a ratio. unchanged: a length, copied as-is
  if (child && Math.abs(child - own * 2) < 0.5) return String(Math.round((own / size) * 1e4) / 1e4);
  return value;
}

/** the layout width the rectangle's coordinates were measured against */
export function clipSourceWidth(srcDoc: Document, rect?: ClipRect): number {
  const view = srcDoc.defaultView;
  const width =
    view?.innerWidth ||
    srcDoc.documentElement?.clientWidth ||
    srcDoc.documentElement?.scrollWidth ||
    0;
  if (width > 0) return width;
  return rect ? rect.x + rect.width : 0;
}

function round(n: number, places = 0): number {
  const f = Math.pow(10, places);
  return Math.round(n * f) / f;
}
