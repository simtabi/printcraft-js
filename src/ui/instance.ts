// One interface, owned by one instance.
//
// Everything the UI layer does used to hang off statics: one menu, one set of
// actions, one keymap, one event bus. That is fine for a page with one printable
// thing on it and wrong for anything else — two editors side by side, a dashboard
// where each panel prints differently, an app that mounts the same component
// twice.
//
// So an interface is an object. It owns its registry, its base options, its
// menu, its keybindings and its scope, and two of them on one page do not know
// about each other.

import { ActionRegistry, bindKeys, type Action, type ActionContext } from './actions';
import { buildActions } from './catalogue';
import { contextMenu, openActionMenu, openActionPalette } from './menu';
import { notesPanel } from './notes';
import { defaultEnv, type UiDeps } from './shared';
import { Session, defaultStore, scopeFor, type RestoreReport, type Store } from '../state';
import type { Env, PrintcraftOptions } from '../types';

export interface InterfaceOptions {
  /** merged into every job this interface starts */
  base?: PrintcraftOptions;
  /**
   * Only right-clicks inside this element open the menu. Without it, the whole
   * document, which is what a single-instance page wants.
   */
  scope?: string | Element | null;
  /** the heading at the top of the menu */
  title?: string;
  /** the line under it */
  description?: string;
  /** false leaves the browser's own menu alone */
  contextMenu?: boolean;
  /** false turns off every keybinding, including the palette */
  keyboard?: boolean;
  /** what opens the palette. `mod+k` by default. */
  paletteKeys?: string;
  /** ids to keep, in the order you want them */
  items?: string[];
  /** registered on top of the stock catalogue */
  actions?: Action[];
  /** replace the catalogue outright */
  registry?: ActionRegistry;

  /**
   * Remember marks, options and activity between visits.
   *
   * `true` uses the browser's own storage under a `printcraft:` prefix. Pass a
   * `Store` to put it somewhere else — a server, IndexedDB, your own state tree.
   * Off by default: writing somebody's redactions into their browser without
   * being asked is not a default worth having.
   */
  persist?: boolean | Store;
  /** what counts as "this page" for persistence. the path by default. */
  scopeKey?: string;
  /**
   * Called once marks have been put back, including the ones that could not be.
   * Without it, a lost mark is only in the log.
   */
  onRestore?: (report: RestoreReport) => void;
}

/**
 * A live interface.
 *
 * `destroy()` takes everything down: the menu listener, the keymap, and any
 * surface still open. An app that mounts and unmounts a panel needs that to be
 * complete, or the second mount installs a second menu.
 */
export class PrintcraftInterface {
  readonly actions: ActionRegistry;
  readonly env: Env;
  /** What this interface remembers. Present even when nothing is persisted. */
  readonly memory: Session;

  private base: PrintcraftOptions;
  private readonly cleanups: Array<() => void> = [];
  private lastTarget: Element | null = null;
  private live = true;
  private restoring: Promise<RestoreReport> | null = null;

  constructor(
    private readonly deps: UiDeps,
    private readonly options: InterfaceOptions = {},
    env?: Env
  ) {
    this.env = env || defaultEnv();
    this.base = options.base || {};

    this.actions = options.registry || new ActionRegistry(buildActions(deps));
    for (const action of options.actions || []) this.actions.add(action);
    if (options.items) {
      for (const id of this.actions.ids()) {
        if (!options.items.includes(id)) this.actions.remove(id);
      }
      this.actions.reorder(options.items);
    }

    // the palette is an action like any other, so it appears in the menu, has a
    // keybinding and can be removed by id
    if (options.paletteKeys !== '' && !this.actions.has('palette')) {
      this.actions.add({
        id: 'palette',
        label: 'All commands…',
        description: 'Search everything this page can print',
        icon: 'inspect',
        group: 'Inspect',
        keys: options.paletteKeys || 'mod+k',
        keywords: ['palette', 'command', 'search', 'help'],
        run: (ctx) => openActionPalette(this.actions, ctx)
      });
    }

    this.memory = new Session({
      store: options.persist
        ? options.persist === true
          ? defaultStore(this.env.window)
          : options.persist
        : undefined,
      scope: options.scopeKey || scopeFor(this.env.window),
      bus: deps
    });
    if (options.persist) this.rememberFromNowOn();

    if (options.contextMenu !== false) this.enableContextMenu();
    if (options.keyboard !== false) this.enableKeyboard();
    this.watchTarget();
  }

  /**
   * Puts saved marks back, and starts writing new ones.
   *
   * Saving is driven by the DOM rather than by every call site that could make a
   * mark. A `MutationObserver` on the three attributes catches a note added from
   * the menu, a redaction toggled by a keybinding and a drawing finished in the
   * studio, without any of them having to know persistence exists.
   */
  private rememberFromNowOn(): void {
    const doc = this.env.document;
    const MO = this.env.window.MutationObserver;

    // marks arrive in bursts — a drag over six paragraphs is six mutations — so
    // the write is coalesced rather than run once per attribute
    let pending: ReturnType<typeof setTimeout> | undefined;
    const save = (): void => {
      clearTimeout(pending);
      pending = setTimeout(() => void this.memory.saveMarks(doc), 250);
    };

    // Held, not saved, while the restore is running. Putting saved marks back
    // writes the same attributes an edit does, and saving that would overwrite
    // the store with only the marks that resolved: every mark reported lost
    // would be deleted for good, where a later build of the page might have
    // found it.
    let held: MutationRecord[] | null = [];
    const watcher =
      typeof MO === 'function'
        ? new MO((records) => {
            if (held) held.push(...records);
            else save();
          })
        : null;
    watcher?.observe(doc.documentElement, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-printcraft-note', 'data-printcraft-redact', 'data-printcraft-drawing']
    });

    this.restoring = this.memory.restoreMarks(doc).then(
      (report) => {
        // what changed while restoring that restoring did not write was the
        // user, and is saved like any other edit
        const restored = new Set<Node>(report.restored.map((m) => m.element));
        const seen = (held || []).concat(watcher?.takeRecords() || []);
        held = null;
        if (seen.some((r) => !restored.has(r.target))) save();

        if (report.lost.length) {
          this.deps.emit('state:lost', { marks: report.lost });
        }
        this.options.onRestore?.(report);
        return report;
      },
      (err: unknown) => {
        // a store that cannot be read must not stop later edits being saved
        held = null;
        throw err;
      }
    );

    this.cleanups.push(() => {
      clearTimeout(pending);
      watcher?.disconnect();
    });
  }

  /** Resolves once saved marks have been put back. Immediate when off. */
  restored(): Promise<RestoreReport> {
    return this.restoring || Promise.resolve({ restored: [], lost: [] });
  }

  /* what an action is handed ------------------------------------------- */

  context(via: ActionContext['via'] = 'api'): ActionContext {
    return { target: this.lastTarget, env: this.env, base: this.base, via, registry: this.actions };
  }

  /** Remembers what the user last aimed at, so the palette knows too. */
  private watchTarget(): void {
    const remember = (e: Event): void => {
      const t = e.target as Element | null;
      if (!t || (typeof t.closest === 'function' && t.closest('[data-prjs-ui]'))) return;
      if (!this.inScope(t)) return;
      this.lastTarget = t;
    };
    this.env.document.addEventListener('pointerdown', remember, true);
    this.env.document.addEventListener('contextmenu', remember, true);
    this.cleanups.push(() => {
      this.env.document.removeEventListener('pointerdown', remember, true);
      this.env.document.removeEventListener('contextmenu', remember, true);
    });
  }

  private inScope(el: Element): boolean {
    const scope = this.options.scope;
    if (!scope) return true;
    const root = typeof scope === 'string' ? this.env.document.querySelector(scope) : scope;
    return !!root && root.contains(el);
  }

  /* the surfaces --------------------------------------------------------- */

  private enableContextMenu(): void {
    const off = contextMenu(
      this.actions,
      {
        base: this.base,
        ...(this.options.title ? { title: this.options.title } : {}),
        ...(this.options.description ? { description: this.options.description } : {}),
        shouldOpen: (target) => this.inScope(target)
      },
      this.deps,
      this.env
    );
    this.cleanups.push(off);
  }

  private enableKeyboard(): void {
    const off = bindKeys(this.actions, () => this.context('keyboard'), this.env, {
      // the palette is the one binding that should work from inside a text field
      allowWhileTyping: ['palette']
    });
    this.cleanups.push(off);
  }

  /* the api -------------------------------------------------------------- */

  /** Opens the palette. */
  palette(): this {
    openActionPalette(this.actions, this.context('palette'));
    return this;
  }

  /** Opens the menu at a point, without waiting for a right-click. */
  menu(at: { x: number; y: number }, target?: Element): this {
    if (target) this.lastTarget = target;
    openActionMenu(this.actions, this.context('menu'), at, {
      ...(this.options.title ? { title: this.options.title } : {}),
      ...(this.options.description ? { description: this.options.description } : {})
    });
    return this;
  }

  /** Every note and redaction on the page. */
  notes(): Promise<unknown> {
    return notesPanel(this.deps, { base: this.base }, this.env);
  }

  /** Runs an action by id, as though it had been chosen from the menu. */
  run(id: string, target?: Element): unknown {
    if (target) this.lastTarget = target;
    return this.actions.run(id, this.context('api'));
  }

  /** Registers an action, or replaces one with the same id. */
  register(action: Action): this {
    this.actions.add(action);
    return this;
  }

  /** Merges into the options every job from this interface starts with. */
  configure(patch: PrintcraftOptions): this {
    this.base = { ...this.base, ...patch };
    return this;
  }

  get isLive(): boolean {
    return this.live;
  }

  /** Removes every listener this interface installed. */
  destroy(): void {
    if (!this.live) return;
    this.live = false;
    for (const off of this.cleanups.splice(0)) {
      try {
        off();
      } catch {
        // a teardown that throws must not strand the rest
      }
    }
  }
}

/** Creates an interface. The common case is one per page, with no arguments. */
export function createInterface(
  deps: UiDeps,
  options?: InterfaceOptions,
  env?: Env
): PrintcraftInterface {
  return new PrintcraftInterface(deps, options, env);
}
