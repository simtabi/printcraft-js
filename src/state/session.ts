// What the library remembers between visits.
//
// Marks are the reason this exists. Redacting a forty-page contract is twenty
// minutes of work held in `data-` attributes on a live page, and a stray refresh
// used to take all of it. But once there is somewhere to put things, the rest
// follows for free: the paper you always pick, the actions you actually use, the
// region you were half way through selecting.
//
// Nothing here is on by default. Everything is namespaced by page, so two
// documents in one app do not inherit each other's redactions.

import { describe, resolve, type Anchor, type Confidence } from './anchor';
import { memoryStore, type Store } from './store';
import { NS } from '../support';

/**
 * Just the part of the emitter a session needs.
 *
 * The return value is deliberately unconstrained: the library's own bus hands
 * back what the listeners returned, and a host passing a plain function should
 * not have to care.
 */
export interface Announcer {
  emit(name: string, payload?: unknown): unknown;
}

/* what is remembered ------------------------------------------------------ */

export type MarkKind = 'note' | 'redaction' | 'drawing';

export interface StoredMark {
  kind: MarkKind;
  anchor: Anchor;
  /** a note's text, or a drawing's serialised shapes */
  data?: string;
  /** when it was made */
  at: number;
}

export interface RestoredMark extends StoredMark {
  element: Element;
  confidence: Confidence;
}

export interface LostMark extends StoredMark {
  reason: string;
}

export interface RestoreReport {
  restored: RestoredMark[];
  /** marks whose element could not be found with enough confidence to apply */
  lost: LostMark[];
}

export interface SessionOptions {
  /** where it goes. memory by default, which is to say nowhere. */
  store?: Store;
  /**
   * What counts as "this page". The path by default, so a query string that
   * only carries a tracking parameter does not orphan a document's marks.
   */
  scope?: string;
  /** how many recent actions to keep for the palette's ordering */
  recentLimit?: number;
  /** told about every load and save */
  bus?: Announcer;
}

const KEYS = {
  marks: 'marks',
  options: 'options',
  recent: 'recent',
  progress: 'progress'
} as const;

/**
 * The options worth carrying from one visit to the next, and what each may hold.
 *
 * A target selector is about one job and a hook is a function, so neither
 * belongs in storage. The checks are the shape only: a value from an older
 * build, another tab or a hand-edited store that fails one is dropped rather
 * than handed to a job that would refuse it.
 */
const isPlain = (v: unknown): boolean =>
  !!v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.getPrototypeOf(v) === Object.prototype;
const str = (v: unknown): boolean => v === null || typeof v === 'string';
const bool = (v: unknown): boolean => typeof v === 'boolean';
const loose = (v: unknown): boolean => v === null || bool(v) || typeof v === 'string' || isPlain(v);
const REMEMBERED: Record<string, (v: unknown) => boolean> = {
  setPrintSize: str,
  orientation: (v) => v === 'portrait' || v === 'landscape',
  pageMargin: str,
  pagePadding: (v) => typeof v === 'string' || isPlain(v),
  paginate: (v) => bool(v) || isPlain(v),
  pageNumbers: (v) => bool(v) || isPlain(v),
  hideBrowserHeaderFooter: bool,
  watermark: loose,
  coverPage: loose,
  notesPage: loose,
  printHeading: bool,
  privacy: (v) => v === null || v === true || isPlain(v)
};

/** Only the remembered options, and only values of a shape a job accepts. */
export function rememberedOptions(raw: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!isPlain(raw)) return out;
  for (const [name, ok] of Object.entries(REMEMBERED)) {
    const value = (raw as Record<string, unknown>)[name];
    // a function, a Date or a class instance does not survive storage, so it
    // is not remembered even in a store that could hold it
    if (value !== undefined && ok(value) && survivesJson(value)) out[name] = value;
  }
  return out;
}

function survivesJson(value: unknown): boolean {
  try {
    return JSON.stringify(JSON.parse(JSON.stringify(value))) === JSON.stringify(value);
  } catch {
    return false;
  }
}

/** A stored mark with everything `restoreMarks` reads, or not one at all. */
function isMark(m: unknown): m is StoredMark {
  if (!isPlain(m)) return false;
  const { kind, anchor } = m as StoredMark;
  return (
    (kind === 'note' || kind === 'redaction' || kind === 'drawing') &&
    isPlain(anchor) &&
    typeof anchor.selector === 'string' &&
    typeof anchor.tag === 'string' &&
    typeof anchor.text === 'string'
  );
}

/** The default namespace: origin plus path, no query, no hash. */
export function scopeFor(win: Window): string {
  try {
    const url = new URL(win.location.href);
    return url.origin + url.pathname;
  } catch {
    return 'about:blank';
  }
}

/**
 * The remembering half of an interface.
 *
 * Reads and writes are all async because a store may be a server. Callers that
 * do not care can ignore the promise; the surfaces that show what was restored
 * await it.
 */
export class Session {
  private readonly store: Store;
  private readonly scope: string;
  private readonly recentLimit: number;
  private readonly bus: Announcer | undefined;

  constructor(options: SessionOptions = {}) {
    this.store = options.store || memoryStore();
    this.scope = options.scope || 'default';
    this.recentLimit = options.recentLimit ?? 20;
    this.bus = options.bus;
  }

  /** Which store is behind this, for a panel that wants to say so. */
  get storeName(): string {
    return this.store.name;
  }

  private key(part: string): string {
    return this.scope + '|' + part;
  }

  private announce(event: string, detail: Record<string, unknown>): void {
    try {
      this.bus?.emit(event, detail);
    } catch {
      /* a listener throwing must not fail the write */
    }
  }

  /* marks ---------------------------------------------------------------- */

  /**
   * Writes every mark currently on the page.
   *
   * Reads the live DOM rather than keeping a parallel copy, for the same reason
   * the notes panel does: the attributes are the truth, and a second copy is a
   * second thing to keep in step.
   */
  async saveMarks(doc: Document): Promise<number> {
    const marks: StoredMark[] = [];
    const now = Date.now();

    for (const el of doc.querySelectorAll('[data-' + NS + '-note]')) {
      marks.push({
        kind: 'note',
        anchor: describe(el),
        data: el.getAttribute('data-' + NS + '-note') || '',
        at: now
      });
    }
    for (const el of doc.querySelectorAll('[data-' + NS + '-redact]')) {
      marks.push({ kind: 'redaction', anchor: describe(el), at: now });
    }
    for (const el of doc.querySelectorAll('[data-' + NS + '-drawing]')) {
      marks.push({
        kind: 'drawing',
        anchor: describe(el),
        data: el.getAttribute('data-' + NS + '-drawing') || '',
        at: now
      });
    }

    await this.store.set(this.key(KEYS.marks), marks);
    this.announce('state:save', { what: 'marks', count: marks.length, store: this.store.name });
    return marks.length;
  }

  /**
   * Puts saved marks back on the page.
   *
   * A mark whose element cannot be found with confidence is **not** applied. It
   * is returned in `lost` instead, with the reason. Guessing would eventually
   * mean redacting the wrong paragraph, and a privacy tool that does that once
   * is worse than one that admits it does not know.
   */
  async restoreMarks(doc: Document): Promise<RestoreReport> {
    // anything that is not a mark — a different build's format, a hand-edited
    // store, a truncated write — is skipped, never thrown on
    const raw = await this.store.get<unknown>(this.key(KEYS.marks));
    const saved = Array.isArray(raw) ? raw.filter(isMark) : [];
    const report: RestoreReport = { restored: [], lost: [] };

    for (const mark of saved) {
      const found = resolve(mark.anchor, doc);
      if (!found.element) {
        report.lost.push({ ...mark, reason: found.reason || 'not found' });
        continue;
      }

      if (mark.kind === 'note') {
        found.element.setAttribute('data-' + NS + '-note', mark.data || '');
      } else if (mark.kind === 'redaction') {
        found.element.setAttribute('data-' + NS + '-redact', '');
      } else {
        found.element.setAttribute('data-' + NS + '-drawing', mark.data || '');
      }
      report.restored.push({ ...mark, element: found.element, confidence: found.confidence });
    }

    this.announce('state:load', {
      what: 'marks',
      restored: report.restored.length,
      lost: report.lost.length,
      store: this.store.name
    });
    return report;
  }

  async clearMarks(): Promise<void> {
    await this.store.remove(this.key(KEYS.marks));
    this.announce('state:clear', { what: 'marks' });
  }

  /* options -------------------------------------------------------------- */

  /** The print options last used, so the next job starts where the last ended. */
  async options(): Promise<Record<string, unknown>> {
    return rememberedOptions(await this.store.get<unknown>(this.key(KEYS.options)));
  }

  /**
   * Merges a job's options into what is remembered.
   *
   * Only the settings worth carrying forward: paper, orientation, margins and
   * the switches. A target selector is about one job and a hook is a function,
   * so neither belongs in storage.
   */
  async rememberOptions(options: Record<string, unknown>): Promise<void> {
    const next = { ...(await this.options()), ...rememberedOptions(options) };
    await this.store.set(this.key(KEYS.options), next);
    this.announce('state:save', { what: 'options', keys: Object.keys(next).length });
  }

  /* activity ------------------------------------------------------------- */

  /** Action ids, most recent first. */
  async recent(): Promise<string[]> {
    const raw = await this.store.get<unknown>(this.key(KEYS.recent));
    return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : [];
  }

  /**
   * Notes that an action ran.
   *
   * The palette sorts by this, so the two or three things somebody actually does
   * rise to the top instead of sitting under whatever happens to be alphabetically
   * first.
   */
  async used(actionId: string): Promise<void> {
    const list = await this.recent();
    const next = [actionId, ...list.filter((id) => id !== actionId)].slice(0, this.recentLimit);
    await this.store.set(this.key(KEYS.recent), next);
    this.announce('state:save', { what: 'recent', count: next.length, store: this.store.name });
  }

  /** Forgets the remembered options, when they turned out to be ones a job refuses. */
  async forgetOptions(): Promise<void> {
    await this.store.remove(this.key(KEYS.options));
    this.announce('state:clear', { what: 'options' });
  }

  /* work in progress ----------------------------------------------------- */

  /** Whatever was half-finished: a region being dragged, a drawing not yet saved. */
  async progress<T>(): Promise<T | null> {
    return this.store.get<T>(this.key(KEYS.progress));
  }

  async saveProgress<T>(value: T | null): Promise<void> {
    if (value == null) {
      await this.store.remove(this.key(KEYS.progress));
      return;
    }
    await this.store.set(this.key(KEYS.progress), value);
  }

  /* all of it ------------------------------------------------------------ */

  /** Everything remembered for this page, as plain data. */
  async export(): Promise<Record<string, unknown>> {
    const [marks, options, recent, progress] = await Promise.all([
      this.store.get(this.key(KEYS.marks)),
      this.store.get(this.key(KEYS.options)),
      this.store.get(this.key(KEYS.recent)),
      this.store.get(this.key(KEYS.progress))
    ]);
    return { scope: this.scope, marks, options, recent, progress };
  }

  /** Puts an exported bundle back, as-is. */
  async import(bundle: Record<string, unknown>): Promise<void> {
    await Promise.all(
      Object.values(KEYS)
        .filter((part) => bundle[part] !== undefined)
        .map((part) => this.store.set(this.key(part), bundle[part]))
    );
    this.announce('state:load', { what: 'import', store: this.store.name });
  }

  /** Forgets this page. Other pages in the same store are untouched. */
  async forget(): Promise<void> {
    await Promise.all(Object.values(KEYS).map((part) => this.store.remove(this.key(part))));
    this.announce('state:clear', { what: 'all', scope: this.scope });
  }
}
