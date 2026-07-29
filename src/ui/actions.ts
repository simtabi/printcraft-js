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

/** What an action is handed when it runs. */
export interface ActionContext {
  /** what was right-clicked, or the last element the user aimed at */
  target: Element | null;
  env: Env;
  /** options every job from this instance starts with */
  base: PrintcraftOptions;
  /** how it was invoked, so an action can behave differently in the palette */
  via: 'menu' | 'palette' | 'keyboard' | 'api';
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

      if (action.when) {
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

/** True on a platform where the meta key is the modifier. */
function isApple(env: Env): boolean {
  const nav = env.window.navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = nav.userAgentData?.platform || nav.platform || '';
  return /mac|iphone|ipad|ipod/i.test(platform);
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

/** Whether an event is the binding. */
export function matchesKeys(e: KeyboardEvent, keys: string, env: Env): boolean {
  const want = parseKeys(keys);
  const mod = isApple(env) ? e.metaKey : e.ctrlKey;

  if (want.mod !== mod) return false;
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
