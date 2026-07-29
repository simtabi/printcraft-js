// Redacting what a rectangle actually covers.
//
// Dragging a box over half a paragraph should redact half a paragraph. Marking
// the nearest element instead is the easy version and the wrong one: it either
// destroys a whole section to hide one line, or leaves the line showing because
// the element extends past the box.
//
// So a rectangle resolves to the text runs it covers, using `Range` and
// `getClientRects` to ask the browser where each character actually is.
//
// Nothing here touches the live page. A run is recorded as a path of child
// indices plus a character offset, and applied to the clone later. The clone is
// a deep copy, so the same path leads to the same node. Wrapping live text in
// marker elements would mutate a page we promised only to read.

import type { ClipRect } from '../types';

export interface TextRun {
  /** child indices from the root down to the text node */
  path: number[];
  start: number;
  end: number;
  /** what will be destroyed, kept so the verifier can confirm it was */
  text: string;
}

/** Overlap between a client rect and a rectangle in page coordinates. */
function intersects(box: DOMRect, rect: ClipRect, scrollX: number, scrollY: number): boolean {
  const left = box.left + scrollX;
  const top = box.top + scrollY;
  return (
    left < rect.x + rect.width &&
    left + box.width > rect.x &&
    top < rect.y + rect.height &&
    top + box.height > rect.y
  );
}

function pathTo(root: Element, node: Node): number[] {
  const path: number[] = [];
  let current: Node | null = node;
  while (current && current !== root) {
    const parent: Node | null = current.parentNode;
    if (!parent) return [];
    path.unshift(Array.prototype.indexOf.call(parent.childNodes, current));
    current = parent;
  }
  return path;
}

function nodeAt(root: Node, path: number[]): Node | null {
  let node: Node | null = root;
  for (const index of path) {
    node = node?.childNodes[index] ?? null;
    if (!node) return null;
  }
  return node;
}

/**
 * Every text run inside `root` that `rect` covers.
 *
 * Text nodes wholly inside the rectangle are taken whole. Only the ones
 * straddling an edge are walked character by character, so a rectangle over a
 * long document costs a handful of range measurements rather than one per glyph.
 */
export function runsInRect(root: Element, rect: ClipRect, win: Window): TextRun[] {
  const doc = root.ownerDocument;
  if (!doc) return [];

  const scrollX = win.scrollX || 0;
  const scrollY = win.scrollY || 0;
  const runs: TextRun[] = [];
  const walker = doc.createTreeWalker(root, 4 /* SHOW_TEXT */);
  const range = doc.createRange();

  let node = walker.nextNode() as Text | null;
  while (node) {
    const text = node.nodeValue || '';
    if (text.trim()) {
      range.selectNodeContents(node);
      const whole = range.getBoundingClientRect();

      if (intersects(whole, rect, scrollX, scrollY)) {
        const inside =
          whole.left + scrollX >= rect.x &&
          whole.top + scrollY >= rect.y &&
          whole.right + scrollX <= rect.x + rect.width &&
          whole.bottom + scrollY <= rect.y + rect.height;

        if (inside) {
          runs.push({ path: pathTo(root, node), start: 0, end: text.length, text });
        } else {
          // straddling an edge, so find where the covered characters begin and end
          let from = -1;
          for (let i = 0; i < text.length; i++) {
            range.setStart(node, i);
            range.setEnd(node, i + 1);
            const hit = intersects(range.getBoundingClientRect(), rect, scrollX, scrollY);

            if (hit && from === -1) from = i;
            if (!hit && from !== -1) {
              runs.push({
                path: pathTo(root, node),
                start: from,
                end: i,
                text: text.slice(from, i)
              });
              from = -1;
            }
          }
          if (from !== -1) {
            runs.push({
              path: pathTo(root, node),
              start: from,
              end: text.length,
              text: text.slice(from)
            });
          }
        }
      }
    }
    node = walker.nextNode() as Text | null;
  }

  range.detach?.();
  return runs;
}

/**
 * Replaces each recorded run in the clone with blocks.
 *
 * Runs are applied back to front within a node so an earlier replacement cannot
 * shift the offsets of a later one.
 */
export function applyRuns(clone: Element, runs: TextRun[], ch: string): number {
  const byNode = new Map<string, TextRun[]>();
  for (const run of runs) {
    const key = run.path.join('.');
    const list = byNode.get(key);
    if (list) list.push(run);
    else byNode.set(key, [run]);
  }

  let applied = 0;
  for (const [key, list] of byNode) {
    const node = nodeAt(clone, key === '' ? [] : key.split('.').map(Number));
    if (!node || node.nodeType !== 3) continue;

    const text = node.nodeValue || '';
    let next = text;
    // sorted in place rather than with toSorted: the array is built here and
    // discarded here, and toSorted needs es2023, which is newer than we support
    // oxlint-disable-next-line no-array-sort
    for (const run of list.sort((a, b) => b.start - a.start)) {
      const start = Math.max(0, Math.min(run.start, next.length));
      const end = Math.max(start, Math.min(run.end, next.length));
      if (end === start) continue;
      next = next.slice(0, start) + ch.repeat(end - start) + next.slice(end);
      applied++;
    }
    node.nodeValue = next;

    // mark the element holding it, so the redaction stylesheet paints a bar
    const owner = node.parentElement;
    if (owner) owner.classList.add('pc-redacted-run');
  }
  return applied;
}

/** The strings a set of runs destroys, for the verifier to look for afterwards. */
export function secretsOf(runs: TextRun[]): string[] {
  const out = new Set<string>();
  for (const run of runs) {
    const trimmed = run.text.trim();
    if (trimmed.length >= 3) out.add(trimmed);
  }
  return [...out];
}
