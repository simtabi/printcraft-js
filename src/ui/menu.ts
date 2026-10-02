// The right-click menu and the command palette, over one registry.
//
// Both are views of the same actions. That is the point of the registry: adding
// a capability once puts it in the menu, in the palette, on its keybinding and
// in the API, instead of in one of the four.

import {
  formatKeys,
  type Action,
  type ActionContext,
  type ActionRegistry,
  type ActionScope,
  type ResolvedAction
} from './actions';
import { openMenu, openPalette, type MenuEntry, type MenuHandle } from './kit';
import { defaultEnv, type UiDeps } from './shared';
import type { Env, PrintcraftOptions } from '../types';

/** What a menu item is handed when it runs. Kept for callers that predate actions. */
export interface MenuContext {
  target: Element;
  env: Env;
  base: PrintcraftOptions;
  deps: UiDeps;
}

export type ContextMenuEntry = MenuEntry<MenuContext>;

export interface ContextMenuOptions {
  /** merged into every job the menu starts */
  base?: PrintcraftOptions;
  /**
   * Read each time the menu opens, over `base`. How an interface hands over
   * options that change after the menu is installed.
   */
  context?: () => Partial<ActionContext>;
  /** action ids to keep, in the order you want them */
  items?: string[];
  /** extra actions, appended */
  extra?: Action[];
  /** the heading at the top of the menu */
  title?: string;
  /** the line under it */
  description?: string;
  /** return false to leave the native menu alone for this target */
  shouldOpen?: (target: Element) => boolean;
  /** replace the whole catalogue */
  registry?: ActionRegistry;
}

/** The default heading, so the menu says whose it is rather than floating there. */
const TITLE = 'Print & mark up';
const DESCRIPTION = 'Choose what prints, redact it, or note it first';

/** A right-click on the page offers both what is about the page and about what was clicked. */
const PAGE_SCOPES: readonly ActionScope[] = ['page', 'element'];

/** What a menu over a drawn rectangle offers. */
const REGION_SCOPES: readonly ActionScope[] = ['region'];

/**
 * The menu for a drawn region.
 *
 * Separate from `contextMenu` because it is not installed on the document and
 * torn down again: the region tool owns a modal overlay for as long as the
 * selection exists, and calls this from its own handler. Everything else — how
 * actions become entries, how groups are drawn — is shared.
 */
export function openRegionMenu(
  registry: ActionRegistry,
  ctx: Omit<ActionContext, 'via' | 'scopes'>,
  at: { x: number; y: number },
  options: { onClose?: () => void } = {}
): MenuHandle {
  return openActionMenu(registry, { ...ctx, via: 'menu', scopes: REGION_SCOPES }, at, {
    title: 'This area',
    description: ctx.region
      ? Math.round(ctx.region.width) + ' × ' + Math.round(ctx.region.height) + ' px'
      : 'The rectangle you drew',
    ...(options.onClose ? { onClose: options.onClose } : {})
  });
}

/**
 * Turns resolved actions into menu entries, with a rule between groups.
 *
 * Groups come from the actions themselves, so a host that registers one with a
 * new group name gets a new section without touching this.
 */
export function actionsToEntries(registry: ActionRegistry, ctx: ActionContext): ContextMenuEntry[] {
  const entries: ContextMenuEntry[] = [];

  // Collected by group rather than emitted in registration order.
  //
  // A contributed action lands wherever its layer was loaded, so a group can
  // reappear later in the list. Emitting a heading whenever the name changed
  // would then draw the same one twice. Groups keep the order they were first
  // seen, and actions keep theirs within a group.
  const groups = new Map<string, ResolvedAction[]>();
  for (const action of registry.available(ctx)) {
    const name = action.group || '';
    const bucket = groups.get(name);
    if (bucket) bucket.push(action);
    else groups.set(name, [action]);
  }

  let first = true;
  for (const [name, actions] of groups) {
    if (name) {
      if (!first) entries.push({ separator: true });
      entries.push({ group: name });
    }
    first = false;

    for (const action of actions) {
      entries.push({
        id: action.id,
        label: action.label,
        ...(action.icon ? { icon: action.icon } : {}),
        ...(action.description ? { hint: action.description } : {}),
        ...(action.keys ? { kbd: formatKeys(action.keys, ctx.env) } : {}),
        ...(action.tone && action.tone !== 'default' ? { tone: action.tone } : {}),
        ...(action.checked ? { checked: action.isChecked } : {}),
        ...(action.disabledReason ? { disabled: action.disabledReason } : {}),
        run: () => void registry.run(action.id, { ...ctx, via: 'menu' })
      });
    }
  }
  return entries;
}

/** The same actions as palette items. */
export function actionsToPaletteItems(
  registry: ActionRegistry,
  ctx: ActionContext
): Array<{
  id: string;
  label: string;
  description?: string;
  icon?: string;
  group?: string;
  keys?: string[];
  keywords?: string[];
  disabled?: boolean;
  tone?: string;
}> {
  // oxlint-disable-next-line no-map-spread
  return registry.available(ctx).map((action) => ({
    id: action.id,
    label: action.label,
    ...(action.description ? { description: action.description } : {}),
    ...(action.icon ? { icon: action.icon } : {}),
    ...(action.group ? { group: action.group } : {}),
    ...(action.keys ? { keys: formatKeys(action.keys, ctx.env) } : {}),
    ...(action.keywords ? { keywords: action.keywords } : {}),
    ...(action.tone && action.tone !== 'default' ? { tone: action.tone } : {}),
    disabled: !!action.disabledReason
  }));
}

/** Opens the menu at a point. */
export function openActionMenu(
  registry: ActionRegistry,
  ctx: ActionContext,
  at: { x: number; y: number },
  options: { title?: string; description?: string; onClose?: () => void } = {}
): MenuHandle {
  return openMenu<MenuContext>(
    {
      entries: actionsToEntries(registry, ctx) as MenuEntry<MenuContext>[],
      anchor: at,
      label: 'Printcraft actions',
      icon: 'printer',
      title: options.title || TITLE,
      description: options.description || DESCRIPTION,
      ...(options.onClose ? { onClose: options.onClose } : {})
    },
    ctx.env
  );
}

/** Opens the palette over the same registry. */
export function openActionPalette(registry: ActionRegistry, ctx: ActionContext): void {
  let items = actionsToPaletteItems(registry, ctx);
  // what this person actually does rises to the top, under its own heading,
  // instead of sitting wherever the catalogue happened to put it
  const lifted = (ctx.recent || []).filter((id) => items.some((i) => i.id === id && !i.disabled));
  if (lifted.length) {
    items = [
      ...lifted.map((id) => ({ ...items.find((i) => i.id === id)!, group: 'Recently used' })),
      ...items.filter((i) => !lifted.includes(i.id))
    ];
  }
  openPalette(
    {
      items,
      placeholder: 'Print, redact, note, preview…',
      onPick: (id) => void registry.run(id, { ...ctx, via: 'palette' })
    },
    ctx.env
  );
}

/**
 * Installs the right-click menu. The returned function removes it again.
 *
 * `target` is remembered on every right-click, so an action fired later from the
 * palette or a keybinding still knows what the user was aiming at.
 */
export function contextMenu(
  registry: ActionRegistry,
  cfg: ContextMenuOptions,
  deps: UiDeps,
  env?: Env
): () => void {
  const scope = env || defaultEnv();
  const doc = scope.document;
  const base = cfg.base || {};

  let open: MenuHandle | null = null;

  function onContext(ev: Event): void {
    const target = ev.target as Element | null;
    // never take over the menu on the kit's own surfaces
    if (!target || (typeof target.closest === 'function' && target.closest('[data-prjs-ui]')))
      return;
    if (cfg.shouldOpen && !cfg.shouldOpen(target)) return;

    ev.preventDefault();
    open?.close();

    const me = ev as MouseEvent;
    const ctx: ActionContext = {
      target,
      env: scope,
      base,
      ...cfg.context?.(),
      via: 'menu',
      scopes: PAGE_SCOPES
    };

    open = openActionMenu(
      registry,
      ctx,
      { x: me.clientX, y: me.clientY },
      {
        ...(cfg.title ? { title: cfg.title } : {}),
        ...(cfg.description ? { description: cfg.description } : {}),
        onClose: () => {
          open = null;
        }
      }
    );
    deps.emit('ui:menu', { target, actions: registry.available(ctx).map((a) => a.id) });
  }

  doc.addEventListener('contextmenu', onContext);

  return function disable(): void {
    open?.close();
    open = null;
    doc.removeEventListener('contextmenu', onContext);
  };
}
