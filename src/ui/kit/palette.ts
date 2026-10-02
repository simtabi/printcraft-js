// The command palette.
//
// Same shape everyone has converged on since Sublime, and that Linear and Raycast
// made an expectation: ⌘K, type a few letters, arrow to the one you meant,
// Enter. The parts that matter are the matching and the keyboard model, not the
// chrome — a palette that needs exact prefixes, or that loses your place when the
// list re-sorts, is the one people stop opening.
//
// Matching is a subsequence scorer rather than a substring test, so "pgn" finds
// "Page numbers" and "dpa" finds "Draw a print area". Matched characters are
// marked in the result, which is what makes it obvious why something ranked.

import { button, h, iconNode, root } from './dom';
import { Surface, type SurfaceOptions } from './surface';
import type { Env } from '../../types';

export interface PaletteItem {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  group?: string;
  /** rendered as key caps on the right */
  keys?: string[];
  /** extra words to match on that are not shown */
  keywords?: string[];
  disabled?: boolean;
  tone?: string;
}

export interface PaletteSpec {
  items: PaletteItem[];
  placeholder?: string;
  /** shown when the list is empty before anything is typed */
  emptyLabel?: string;
  onPick: (id: string, item: PaletteItem) => void;
}

export interface PaletteHandle {
  close(): void;
}

/* matching ---------------------------------------------------------------- */

interface Scored {
  item: PaletteItem;
  score: number;
  /** indices in the label that matched, for marking */
  hits: number[];
}

/**
 * Subsequence score for `query` against `text`.
 *
 * Returns -1 for no match. Higher is better. A match at a word boundary counts
 * for more than one mid-word, and consecutive matches count for more than
 * scattered ones, which is what makes "pgn" rank "Page numbers" above "Paginate
 * a long green document".
 */
function score(query: string, text: string): { score: number; hits: number[] } {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (!q) return { score: 0, hits: [] };

  const hits: number[] = [];
  let total = 0;
  let at = 0;
  let streak = 0;

  for (const ch of q) {
    const found = t.indexOf(ch, at);
    if (found === -1) return { score: -1, hits: [] };

    const boundary = found === 0 || /[\s\-_/(]/.test(t[found - 1] || '');
    total += boundary ? 12 : 4;
    streak = found === at ? streak + 1 : 0;
    total += streak * 6;
    // a match early in the label beats the same match late in it
    total -= Math.min(found, 24) * 0.25;

    hits.push(found);
    at = found + 1;
  }

  // a short label that matched is a better answer than a long one
  total += Math.max(0, 30 - text.length) * 0.4;
  return { score: total, hits };
}

function rank(items: PaletteItem[], query: string): Scored[] {
  if (!query.trim()) return items.map((item) => ({ item, score: 0, hits: [] }));

  const out: Scored[] = [];
  for (const item of items) {
    const direct = score(query, item.label);
    let best = direct;

    // keywords and the description can match, but never outrank the label
    for (const extra of [item.description || '', ...(item.keywords || [])]) {
      if (!extra) continue;
      const alt = score(query, extra);
      if (alt.score > best.score) best = { score: alt.score * 0.6, hits: [] };
    }
    if (best.score >= 0)
      out.push({ item, score: best.score, hits: direct.score >= 0 ? direct.hits : [] });
  }
  // sorted in place: `out` is built here and returned here
  // oxlint-disable-next-line no-array-sort
  return out.sort((a, b) => b.score - a.score);
}

/** The label with matched characters wrapped, so the ranking explains itself. */
function marked(doc: Document, label: string, hits: number[]): DocumentFragment {
  const frag = doc.createDocumentFragment();
  if (!hits.length) {
    frag.appendChild(doc.createTextNode(label));
    return frag;
  }

  const set = new Set(hits);
  let run = '';
  let runIsHit = set.has(0);

  const flush = (): void => {
    if (!run) return;
    if (runIsHit) frag.appendChild(h(doc, 'span', { class: 'prjs-match', text: run }));
    else frag.appendChild(doc.createTextNode(run));
    run = '';
  };

  for (let i = 0; i < label.length; i++) {
    const hit = set.has(i);
    if (hit !== runIsHit) {
      flush();
      runIsHit = hit;
    }
    run += label[i];
  }
  flush();
  return frag;
}

/* the surface ------------------------------------------------------------- */

class Palette extends Surface {
  private input!: HTMLInputElement;
  private list!: HTMLElement;
  private rows: Array<{ el: HTMLElement; item: PaletteItem }> = [];
  private cursor = 0;

  constructor(
    private readonly spec: PaletteSpec,
    options: SurfaceOptions
  ) {
    super(options);
  }

  protected build(): HTMLElement {
    const doc = this.doc;
    const scrim = root(doc, 'div', { class: 'prjs prjs-scrim' });
    const panel = h(doc, 'div', {
      class: 'prjs-palette',
      attrs: {
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': 'Commands',
        'data-prjs-palette': ''
      }
    });

    /* search */
    const search = h(doc, 'div', { class: 'prjs-palette-search' });
    search.appendChild(iconNode(doc, 'inspect'));

    this.input = h(doc, 'input', {
      class: 'prjs-palette-input',
      attrs: {
        type: 'text',
        placeholder: this.spec.placeholder || 'Search commands…',
        role: 'combobox',
        'aria-expanded': 'true',
        'aria-controls': 'prjs-palette-list',
        'aria-autocomplete': 'list',
        autocomplete: 'off',
        spellcheck: 'false'
      }
    }) as HTMLInputElement;
    search.appendChild(this.input);

    // Escape closes it, and the footer says so, but a surface with no visible
    // way out is a surface some people will not open twice.
    const dismiss = button(doc, {
      label: '',
      tone: 'ghost',
      icon: 'close',
      attrs: {
        'aria-label': 'Close',
        'data-size': 'sm',
        'data-icon-only': '',
        'data-prjs-modal-close': ''
      },
      onClick: () => this.close()
    });
    search.appendChild(dismiss);
    panel.appendChild(search);

    /* results */
    this.list = h(doc, 'div', {
      class: 'prjs-palette-list',
      attrs: { id: 'prjs-palette-list', role: 'listbox' }
    });
    panel.appendChild(this.list);

    /* the hints along the bottom, which is where people learn the keyboard */
    const foot = h(doc, 'div', { class: 'prjs-palette-foot' });
    for (const [caps, what] of [
      [['↑', '↓'], 'navigate'],
      [['↵'], 'run'],
      [['Esc'], 'close']
    ] as Array<[string[], string]>) {
      const hint = h(doc, 'span');
      for (const cap of caps) hint.appendChild(h(doc, 'kbd', { class: 'prjs-kbd', text: cap }));
      hint.appendChild(doc.createTextNode(' ' + what));
      foot.appendChild(hint);
    }
    panel.appendChild(foot);

    scrim.appendChild(panel);
    this.wire(doc);
    return scrim;
  }

  private wire(doc: Document): void {
    this.input.addEventListener('input', () => this.render(doc));

    this.input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.move(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.move(-1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        this.setCursor(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        this.setCursor(this.rows.length - 1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this.pick(this.cursor);
      }
    });
  }

  protected override mounted(): void {
    this.render(this.doc);
    this.input.focus();
  }

  private render(doc: Document): void {
    const query = this.input.value;
    const ranked = rank(
      this.spec.items.filter((i) => !i.disabled),
      query
    );

    this.list.textContent = '';
    this.rows = [];

    if (!ranked.length) {
      this.list.appendChild(
        h(doc, 'div', {
          class: 'prjs-palette-empty',
          text: query ? 'Nothing matches “' + query + '”' : this.spec.emptyLabel || 'No commands'
        })
      );
      return;
    }

    let group: string | null = null;
    for (const { item, hits } of ranked) {
      // groups only make sense while the list is in its natural order
      if (!query.trim() && item.group && item.group !== group) {
        group = item.group;
        this.list.appendChild(h(doc, 'div', { class: 'prjs-group', text: group }));
      }

      const row = h(doc, 'button', {
        class: 'prjs-item',
        attrs: {
          type: 'button',
          role: 'option',
          'aria-selected': 'false',
          'data-prjs-item': item.id,
          ...(item.tone ? { 'data-tone': item.tone } : {})
        }
      });

      if (item.icon) {
        row.appendChild(
          h(doc, 'span', { class: 'prjs-item-icon', children: [iconNode(doc, item.icon)] })
        );
      }

      const text = h(doc, 'span', { class: 'prjs-item-text' });
      const label = h(doc, 'span', { class: 'prjs-item-label' });
      label.appendChild(marked(doc, item.label, hits));
      text.appendChild(label);
      if (item.description) {
        text.appendChild(h(doc, 'span', { class: 'prjs-item-hint', text: item.description }));
      }
      row.appendChild(text);

      if (item.keys?.length) {
        const caps = h(doc, 'span', { class: 'prjs-item-kbd' });
        for (const cap of item.keys)
          caps.appendChild(h(doc, 'kbd', { class: 'prjs-kbd', text: cap }));
        row.appendChild(caps);
      }

      const index = this.rows.length;
      row.addEventListener('click', () => this.pick(index));
      row.addEventListener('pointermove', () => this.setCursor(index));

      this.list.appendChild(row);
      this.rows.push({ el: row, item });
    }

    this.setCursor(0);
  }

  private move(by: number): void {
    if (!this.rows.length) return;
    // wraps, because a list you cannot get back to the top of is a list you scroll
    this.setCursor((this.cursor + by + this.rows.length) % this.rows.length);
  }

  private setCursor(at: number): void {
    this.cursor = Math.max(0, Math.min(at, this.rows.length - 1));
    this.rows.forEach((row, i) => {
      const active = i === this.cursor;
      row.el.setAttribute('data-active', active ? 'true' : 'false');
      row.el.setAttribute('aria-selected', active ? 'true' : 'false');
      if (active) {
        this.input.setAttribute('aria-activedescendant', 'prjs-opt-' + i);
        row.el.id = 'prjs-opt-' + i;
        row.el.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  private pick(at: number): void {
    const row = this.rows[at];
    if (!row) return;
    this.close();
    this.spec.onPick(row.item.id, row.item);
  }
}

/** Opens the palette. Resolves nothing; `onPick` is the result. */
export function openPalette(spec: PaletteSpec, env?: Env): PaletteHandle {
  const palette = new Palette(spec, {
    env: env || { document, window: window as Window & typeof globalThis },
    trapFocus: true,
    dismissOnEscape: true
  });
  palette.open();
  return { close: () => palette.close() };
}

export { score as scoreMatch, rank as rankItems };
