// Every capability, as one registered thing.
//
// Before this, the context menu was a list of closures. That works until you
// want the same capability from a keyboard shortcut, a command palette, a
// toolbar button and your own code — at which point the menu's array is the only
// place it exists, and the other four have to reach into it.
//
// So an action is the unit instead. It has an id, a label, a description, an
// icon, a keybinding, a `when` that decides whether it applies, and a `run`.
// The menu renders actions, the palette searches them, the keymap fires them,
// and a host can register its own or replace ours.

import type { Env, PrintcraftOptions } from '../types';

/**
 * Where an action belongs.
 *
 * `group` says which heading an action appears under; this says which *surface*
 * it appears on at all. Without it every menu offered everything: a drawn region
 * had no menu of its own because there was no way to ask for the handful of
 * actions that are about a region, and the page menu carried entries that make
 * no sense until something is selected.
 *
 * - `page`       the document as a whole
 * - `element`    whatever was right-clicked
 * - `region`     a drawn rectangle
 * - `selection`  a text selection
 * - `proof`      the proof sheet, before it prints
 * - `annotation` inside the drawing tools
 */
export type ActionScope = 'page' | 'element' | 'region' | 'selection' | 'proof' | 'annotation';

/** What an unscoped action means. Nothing a host registered disappears. */
export const DEFAULT_SCOPE: readonly ActionScope[] = ['page', 'element'];

/** What an action is handed when it runs. */
export interface ActionContext {
  /** what was right-clicked, or the last element the user aimed at */
  target: Element | null;
  env: Env;
  /** options every job from this instance starts with */
  base: PrintcraftOptions;
  /** how it was invoked, so an action can behave differently in the palette */
  via: 'menu' | 'palette' | 'keyboard' | 'api' | 'toolbar';
  /**
   * What the asking surface shows.
   *
   * A set rather than one name, because a right-click on the page legitimately
   * offers both page-level and element-level actions. Left out entirely by the
   * palette, which is the one surface that should reach everything — it is how
   * you get at a capability whose usual surface is not open.
   */
  scopes?: readonly ActionScope[];
  /** the rectangle, when a region is what is being acted on */
  region?: { x: number; y: number; width: number; height: number } | null;
  /**
   * The registry the action came from.
   *
   * So an action can open a menu of other actions — which is what the region
   * tool needs, since its menu is built while a selection is live and the
   * catalogue was built at boot.
   */
  registry?: ActionRegistry;
}

export interface Action {
  id: string;
  label: string;
  /** one line under the label, in the menu and the palette */
  description?: string;
  icon?: string;
  /** the group it appears under */
  group?: string;
  /**
   * Which surfaces offer it. `['page', 'element']` when not given.
   *
   * A surface asks for one scope and gets the actions that claim it, so the
   * region menu is region actions and nothing else.
   */
  scope?: ActionScope[];
  /**
   * A keybinding, written as it is read: `mod+p`, `shift+alt+r`, `?`.
   * `mod` is Command on a Mac and Control everywhere else.
   */
  keys?: string;
  /** colours the entry, and the button it becomes */
  tone?: 'default' | 'primary' | 'danger' | 'warn' | 'success' | 'info';
  /** extra words the palette should match on */
  keywords?: string[];
  /** false hides it; a string disables it and says why */
  when?: (ctx: ActionContext) => boolean | string;
  /** shown with a tick when true */
  checked?: (ctx: ActionContext) => boolean;
  run: (ctx: ActionContext) => unknown;
}

/** An action's scopes, with the default filled in. */
export function scopeOf(action: Action): readonly ActionScope[] {
  return action.scope?.length ? action.scope : DEFAULT_SCOPE;
}

export interface ResolvedAction extends Action {
  /** false when `when` hid it */
  visible: boolean;
  /** the reason it is disabled, or null */
  disabledReason: string | null;
  isChecked: boolean;
}

/**
 * A set of actions, in registration order.
 *
 * One per Printcraft instance, so two instances on a page can offer different
 * capabilities without fighting over a global.
 */
export class ActionRegistry {
  private readonly items = new Map<string, Action>();
  private readonly order: string[] = [];

  constructor(actions: Action[] = []) {
    for (const action of actions) this.add(action);
  }

  /** Adds an action, or replaces one with the same id. */
  add(action: Action): this {
    if (!this.items.has(action.id)) this.order.push(action.id);
    this.items.set(action.id, action);
    return this;
  }

  /** Merges a patch into an existing action. Unknown ids are ignored. */
  update(id: string, patch: Partial<Action>): this {
    const existing = this.items.get(id);
    if (existing) this.items.set(id, { ...existing, ...patch });
    return this;
  }

  remove(id: string): this {
    this.items.delete(id);
    const at = this.order.indexOf(id);
    if (at !== -1) this.order.splice(at, 1);
    return this;
  }

  get(id: string): Action | undefined {
    return this.items.get(id);
  }

  has(id: string): boolean {
    return this.items.has(id);
  }

  /** Every action, in registration order. */
  all(): Action[] {
    return this.order.map((id) => this.items.get(id)!).filter(Boolean);
  }

  ids(): string[] {
    return this.order.slice();
  }

  /** Puts the ids in this order. Anything not named keeps its place after them. */
  reorder(ids: string[]): this {
    const known = ids.filter((id) => this.items.has(id));
    const rest = this.order.filter((id) => !known.includes(id));
    this.order.length = 0;
    this.order.push(...known, ...rest);
    return this;
  }

  /**
   * Every action with `when` and `checked` evaluated against a context.
   *
   * Evaluated once per open rather than per render, so an expensive `when` costs
   * the same whether it is read by the menu, the palette or both.
   */
  resolve(ctx: ActionContext): ResolvedAction[] {
    return this.all().map((action) => {
      let visible = true;
      let disabledReason: string | null = null;

      // scope first: an action that does not belong on this surface was never a
      // candidate, rather than something `when` hid. the palette passes no
      // scopes and so reaches everything.
      if (ctx.scopes && !scopeOf(action).some((s) => ctx.scopes!.includes(s))) visible = false;

      if (visible && action.when) {
        const verdict = action.when(ctx);
        if (verdict === false) visible = false;
        else if (typeof verdict === 'string') disabledReason = verdict;
      }

      // oxlint-disable-next-line no-map-spread
      return Object.assign({}, action, {
        visible,
        disabledReason,
        isChecked: action.checked ? action.checked(ctx) : false
      });
    });
  }

  /** The ones that apply right now. */
  available(ctx: ActionContext): ResolvedAction[] {
    return this.resolve(ctx).filter((a) => a.visible);
  }

  /**
   * Runs an action by id.
   *
   * Returns whatever the action returned, or undefined when it is unknown,
   * hidden or disabled. Nothing throws: an action fired from a keybinding that
   * no longer applies is an ordinary thing to happen, not an error.
   */
  run(id: string, ctx: ActionContext): unknown {
    const action = this.items.get(id);
    if (!action) return undefined;

    if (action.when) {
      const verdict = action.when(ctx);
      if (verdict === false || typeof verdict === 'string') return undefined;
    }
    return action.run(ctx);
  }

  /** A copy, so an instance can start from another's set without sharing it. */
  clone(): ActionRegistry {
    return new ActionRegistry(this.all());
  }
}

/* keybindings ------------------------------------------------------------- */

/**
 * Whether to draw the modifier as ⌘ rather than Ctrl.
 *
 * Both signals are consulted because either can be wrong on its own:
 * `navigator.platform` is deprecated and frozen on some builds, and
 * `userAgentData.platform` reports the UA's claimed platform, which is
 * "Windows" under an automated Chromium running on a Mac. This only decides how
 * a binding is *drawn* — see `matchesKeys` for why matching does not sniff.
 */
function isApple(env: Env): boolean {
  const nav = env.window.navigator as Navigator & { userAgentData?: { platform?: string } };
  const claimed = nav.userAgentData?.platform || '';
  const legacy = nav.platform || '';
  return /mac|iphone|ipad|ipod/i.test(claimed) || /mac|iphone|ipad|ipod/i.test(legacy);
}

/** Turns `mod+shift+p` into the parts an event can be compared against. */
export function parseKeys(keys: string): {
  key: string;
  mod: boolean;
  shift: boolean;
  alt: boolean;
} {
  const parts = keys.toLowerCase().split('+');
  const key = parts.pop() || '';
  return {
    key,
    mod: parts.includes('mod') || parts.includes('cmd') || parts.includes('ctrl'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt') || parts.includes('option')
  };
}

/**
 * Whether an event is the binding.
 *
 * `mod` matches either Command or Control, without asking which platform this
 * is. Deciding from a platform string means one wrong answer silently disables
 * every shortcut, and the strings do lie: an automated Chromium on a Mac reports
 * "Windows" through `userAgentData` and "MacIntel" through `navigator.platform`.
 * Accepting both is also kinder to anyone on a keyboard their OS did not ship
 * with.
 */
export function matchesKeys(e: KeyboardEvent, keys: string, env: Env): boolean {
  void env;
  const want = parseKeys(keys);

  if (want.mod !== (e.metaKey || e.ctrlKey)) return false;
  if (want.shift !== e.shiftKey) return false;
  if (want.alt !== e.altKey) return false;
  return e.key.toLowerCase() === want.key;
}

/** `mod+shift+p` as the caps a person reads: `⌘ ⇧ P`, or `Ctrl Shift P`. */
export function formatKeys(keys: string, env: Env): string[] {
  const apple = isApple(env);
  const parts = keys.toLowerCase().split('+');
  const out: string[] = [];

  for (const part of parts.slice(0, -1)) {
    if (part === 'mod' || part === 'cmd' || part === 'ctrl') out.push(apple ? '⌘' : 'Ctrl');
    else if (part === 'shift') out.push(apple ? '⇧' : 'Shift');
    else if (part === 'alt' || part === 'option') out.push(apple ? '⌥' : 'Alt');
  }

  const key = parts[parts.length - 1] || '';
  const named: Record<string, string> = {
    enter: '↵',
    escape: 'Esc',
    arrowup: '↑',
    arrowdown: '↓',
    arrowleft: '←',
    arrowright: '→',
    ' ': 'Space'
  };
  out.push(named[key] || key.toUpperCase());
  return out;
}

/**
 * Whether a keystroke should be ignored because the user is typing.
 *
 * A shortcut that fires while somebody is filling in a form is worse than no
 * shortcut, and this is the single most common bug in hand-rolled keymaps.
 */
export function isTyping(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
}

/**
 * Listens for every bound key in a registry and runs the action.
 *
 * Returns a function that stops listening. Bindings are read at each keystroke
 * rather than cached, so an action registered later works without rebinding.
 */
export function bindKeys(
  registry: ActionRegistry,
  context: () => ActionContext,
  env: Env,
  options: { allowWhileTyping?: string[] } = {}
): () => void {
  const onKey = (e: KeyboardEvent): void => {
    if (e.defaultPrevented) return;

    for (const action of registry.all()) {
      if (!action.keys) continue;
      if (!matchesKeys(e, action.keys, env)) continue;
      // a palette on mod+k should still open from inside a search box
      if (isTyping(e) && !options.allowWhileTyping?.includes(action.id)) continue;

      const ctx = { ...context(), via: 'keyboard' as const };
      if (action.when) {
        const verdict = action.when(ctx);
        if (verdict === false || typeof verdict === 'string') continue;
      }

      e.preventDefault();
      e.stopPropagation();
      action.run(ctx);
      return;
    }
  };

  env.document.addEventListener('keydown', onKey, true);
  return function unbind(): void {
    env.document.removeEventListener('keydown', onKey, true);
  };
}
