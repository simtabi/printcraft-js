// Placing a floating box near a point, without leaving the viewport.
//
// Deliberately not floating-ui. That library is excellent and general, and it is
// 166KB on disk for three behaviours we need: keep the box on screen, flip a
// submenu to the other side when it would overflow, and never cover the thing it
// belongs to. Sixty lines of arithmetic against a library whose selling point is
// having no dependencies is the right trade.

export interface Anchor {
  x: number;
  y: number;
  /** when placing beside something, its box, so the menu can flip around it */
  rect?: { left: number; top: number; right: number; bottom: number };
}

export interface PlaceOptions {
  /** gap from the viewport edge */
  margin?: number;
  /** 'point' hangs off a cursor position, 'beside' flanks an existing box */
  mode?: 'point' | 'beside';
}

export interface Placement {
  left: number;
  top: number;
  /** which side it ended up on, for callers that care */
  side: 'right' | 'left';
  /** how tall it may be before it should scroll */
  maxHeight: number;
}

/**
 * Positions `box` near `anchor`. The element must already be in the document and
 * displayed, because this measures it.
 */
export function place(
  box: HTMLElement,
  anchor: Anchor,
  view: { innerWidth: number; innerHeight: number },
  options: PlaceOptions = {}
): Placement {
  const margin = options.margin ?? 8;
  const vw = view.innerWidth || 1024;
  const vh = view.innerHeight || 768;

  const measured = box.getBoundingClientRect();
  const width = measured.width || box.offsetWidth || 220;
  const height = measured.height || box.offsetHeight || 200;

  let side: Placement['side'] = 'right';
  let left: number;

  if (options.mode === 'beside' && anchor.rect) {
    // prefer the right of the anchor, flip left when that would overflow
    const toRight = anchor.rect.right;
    const toLeft = anchor.rect.left - width;
    if (toRight + width + margin <= vw || toLeft < margin) {
      left = toRight;
    } else {
      left = toLeft;
      side = 'left';
    }
  } else {
    left = anchor.x;
    if (left + width + margin > vw) {
      // flip to the other side of the cursor rather than just sliding, so the
      // pointer never ends up on top of the first item
      const flipped = anchor.x - width;
      left = flipped >= margin ? flipped : vw - width - margin;
      side = 'left';
    }
  }

  let top = anchor.y;
  const spaceBelow = vh - anchor.y - margin;
  const spaceAbove = anchor.y - margin;

  let maxHeight = vh - margin * 2;
  if (height > spaceBelow) {
    if (spaceAbove > spaceBelow) {
      // open upwards when there is more room there
      top = Math.max(margin, anchor.y - Math.min(height, spaceAbove));
      maxHeight = Math.min(height, spaceAbove);
    } else {
      top = Math.max(margin, vh - height - margin);
      maxHeight = Math.min(height, spaceBelow > 0 ? vh - top - margin : maxHeight);
    }
  }

  return {
    left: clamp(left, margin, Math.max(margin, vw - width - margin)),
    top: clamp(top, margin, Math.max(margin, vh - margin)),
    side,
    maxHeight: Math.max(120, Math.round(maxHeight))
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Applies a placement to an element. */
export function applyPlacement(box: HTMLElement, at: Placement): void {
  box.style.left = at.left + 'px';
  box.style.top = at.top + 'px';
  box.style.maxHeight = at.maxHeight + 'px';
}
