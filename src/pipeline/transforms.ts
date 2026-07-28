// the clone transforms. every one runs on a detached copy, never on the live
// page. the ones that can swap the clone root return the (possibly new) root so
// the pipeline can adopt it — `Printcraft.print(someCanvas)` replaces that canvas
// with an <img>, and a detached node has no parent to be replaced in.

import {
  DATA_ID,
  eachInclusive,
  isElement,
  NS,
  removeNode,
  replaceNode,
  toArray
} from '../support';
import type { Annotation, MetaMap, ResolvedOptions, Transform } from '../types';

export function applyExclusions(clone: Element, options: ResolvedOptions): void {
  const selectors = options.excludeSelectorList.concat(['[data-' + NS + '-exclude]']);
  selectors.forEach((sel) => {
    eachInclusive(clone, sel, removeNode);
  });
}

export function applyReveal(clone: Element, meta: MetaMap): void {
  eachInclusive(clone, '[' + DATA_ID + ']', (el) => {
    const id = el.getAttribute(DATA_ID);
    const m = id ? meta[id] : undefined;
    if (m?.wasHidden) {
      (el as HTMLElement).style.setProperty('display', 'revert', 'important');
      el.classList.add('pc-revealed');
    }
  });
}

export function applyLinkExposure(clone: Element, options: ResolvedOptions, loc: Location): void {
  const mode = options.exposeLinkUrls;
  if (!mode) return;
  const tpl = options.linkTextTemplate || '{title} [{url}]';

  eachInclusive(clone, 'a[href]', (a) => {
    const href = a.getAttribute('href') || '';
    if (!href || href.charAt(0) === '#' || /^(javascript|mailto|tel):/i.test(href)) return;
    let abs: URL;
    try {
      abs = new URL(href, loc.href);
    } catch {
      return;
    }
    if (mode === 'external' && abs.host === loc.host) return;
    const title = (a.textContent || '').trim() || abs.href;
    a.textContent = tpl.split('{title}').join(title).split('{url}').join(abs.href);
  });
}

/** swaps every measured canvas for a png snapshot of its pixels. */
export function applyCanvasCapture(clone: Element, meta: MetaMap, doc: Document): Element {
  let root = clone;
  eachInclusive(clone, 'canvas[' + DATA_ID + ']', (cv) => {
    const id = cv.getAttribute(DATA_ID);
    const m = id ? meta[id] : undefined;
    if (!m?.canvasData) return;

    const img = doc.createElement('img');
    img.src = m.canvasData;
    if (m.canvasW) img.width = m.canvasW;
    if (m.canvasH) img.height = m.canvasH;
    img.className = cv.className;
    const style = cv.getAttribute('style');
    if (style) img.setAttribute('style', style);

    if (!replaceNode(cv, img) && cv === root) root = img;
  });
  return root;
}

export function applyImageHandling(
  clone: Element,
  options: ResolvedOptions,
  meta: MetaMap,
  doc: Document
): Element {
  let root = clone;
  eachInclusive(clone, 'img', (el) => {
    const img = el as HTMLImageElement;
    const id = img.getAttribute(DATA_ID);
    const m = id ? meta[id] : undefined;

    if (options.removeImages) {
      const box = doc.createElement('div');
      box.className = 'pc-img-placeholder';
      const w = m?.imgW || 80;
      const h = m?.imgH || 60;
      box.setAttribute(
        'style',
        'width:' +
          w +
          'px;height:' +
          h +
          'px;border:1px solid #000;display:inline-block;box-sizing:border-box;'
      );
      if (img.alt) box.setAttribute('title', img.alt);
      if (!replaceNode(img, box) && img === root) root = box;
      return;
    }

    if (options.forceLazyImages) {
      img.removeAttribute('loading');
      img.setAttribute('loading', 'eager');
      if (m?.currentSrc) {
        // pin the already-resolved source so srcset does not re-negotiate in the frame
        img.removeAttribute('srcset');
        img.removeAttribute('sizes');
        img.src = m.currentSrc;
      }
    }
  });
  return root;
}

export function applyScrollableExpansion(
  clone: Element,
  options: ResolvedOptions,
  meta: MetaMap
): void {
  eachInclusive(clone, '[' + DATA_ID + ']', (el) => {
    const id = el.getAttribute(DATA_ID);
    const m = id ? meta[id] : undefined;
    if (!m?.scrollable) return;

    let css = 'overflow:visible !important;overflow-y:visible !important;height:auto !important;';
    if (options.scrollableAreasMaxHeight) {
      css =
        'overflow:auto !important;max-height:' +
        Number(options.scrollableAreasMaxHeight) +
        'px !important;height:auto !important;';
    } else {
      css += 'max-height:none !important;';
    }
    el.setAttribute('style', (el.getAttribute('style') || '') + ';' + css);
  });
}

export function applyInlineStyleStrip(clone: Element): void {
  eachInclusive(clone, '[style]', (el) => el.removeAttribute('style'));
}

/** renders note chips beside their elements, from options and `data-printcraft-note`. */
export function applyAnnotations(clone: Element, options: ResolvedOptions, doc: Document): void {
  function noteAfter(el: Element, text: string): void {
    const chip = doc.createElement('span');
    chip.className = 'pc-note';
    chip.textContent = text;
    if (el.parentNode) el.parentNode.insertBefore(chip, el.nextSibling);
  }

  (options.annotations || []).forEach((a: Annotation) => {
    if (!a || !a.selector || !a.text) return;
    eachInclusive(clone, a.selector, (el) => noteAfter(el, a.text));
  });
  eachInclusive(clone, '[data-' + NS + '-note]', (el) => {
    const text = el.getAttribute('data-' + NS + '-note');
    if (text) noteAfter(el, text);
  });
}

/** runs `transforms` then the legacy tag-keyed `customMethodMap` chain. */
export function applyCustomTransforms(clone: Element, options: ResolvedOptions): Element {
  let root = clone;

  options.transforms.forEach((t: Transform) => {
    if (!t || typeof t.fn !== 'function') return;
    eachInclusive(root, t.selector || '*', (el) => {
      const out = t.fn(el, options);
      if (out === null) {
        if (!replaceNodeOrRemove(el)) root = emptyPlaceholder(root, el);
        return;
      }
      if (isElement(out) && out !== el) {
        if (!replaceNode(el, out) && el === root) root = out;
      }
    });
  });

  const map = options.customMethodMap;
  if (map && typeof map === 'object') {
    Object.keys(map).forEach((tag) => {
      const fns = toArray(map[tag]).filter(
        (f): f is (el: Element, o: ResolvedOptions) => Element | null | void =>
          typeof f === 'function'
      );
      if (!fns.length) return;
      eachInclusive(root, tag, (el) => {
        let cur: Element = el;
        for (const fn of fns) {
          const res = fn.call(options, cur, options);
          if (res === null) {
            if (!replaceNodeOrRemove(cur) && cur === root) root = emptyPlaceholder(root, cur);
            return;
          }
          if (isElement(res)) {
            if (res !== cur) {
              if (!replaceNode(cur, res) && cur === root) root = res;
            }
            cur = res;
          }
        }
      });
    });
  }
  return root;
}

function replaceNodeOrRemove(el: Element): boolean {
  if (!el.parentNode) return false;
  el.parentNode.removeChild(el);
  return true;
}

/** a transform that drops the clone root leaves an empty slot rather than a hole. */
function emptyPlaceholder(root: Element, dropped: Element): Element {
  if (dropped !== root) return root;
  const doc = root.ownerDocument;
  return doc ? doc.createElement('div') : root;
}

export function stripDataIds(clone: Element): void {
  eachInclusive(clone, '[' + DATA_ID + ']', (el) => el.removeAttribute(DATA_ID));
}
