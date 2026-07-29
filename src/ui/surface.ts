// The interaction layer as one object, and the function that builds it.
//
// It lives here rather than on the class so the core entry can declare its type
// without importing its code: `static ui = {...}` would be a live reference no
// bundler could drop, and everybody printing an invoice would ship a modal kit
// they never open.

import * as ui from './index';
import { icon } from './icons';
import {
  LAYERS,
  customStore,
  explain,
  httpStore,
  localStore,
  memoryStore,
  resolveConfig,
  sessionStore,
  type Session
} from '../state';
import type { Env, PrintcraftOptions } from '../types';

export interface Attachment {
  deps: ui.UiDeps;
}

export function makeUiSurface({ deps: uiDeps }: Attachment) {
  /**
   * The page's interface, created on first use.
   *
   * One per page is what most callers want, and asking them to construct it is
   * ceremony. `Printcraft.ui.create()` makes another for anyone who needs two.
   */
  let shared: ui.PrintcraftInterface | null = null;
  const iface = (env?: Env): ui.PrintcraftInterface => {
    if (!shared || !shared.isLive) shared = ui.createInterface(uiDeps, {}, env);
    return shared;
  };

  return {
    /** A new interface, with its own actions, menu, keymap and scope. */
    create(options?: ui.InterfaceOptions, env?: Env): ui.PrintcraftInterface {
      return ui.createInterface(uiDeps, options, env);
    },
    /** The page's shared interface. */
    get instance(): ui.PrintcraftInterface {
      return iface();
    },
    /** Every registered action on the shared interface. */
    get actions(): ui.ActionRegistry {
      return iface().actions;
    },
    /**
     * The stock catalogue, as a plain array.
     *
     * The pair to `contributeActions`: that adds to what ships, this is what
     * ships. Useful for building a registry from a subset, and for asserting
     * things about the catalogue that a registry cannot — it keys by id, so a
     * duplicate is invisible by the time it becomes one.
     */
    buildActions: (): ui.Action[] => ui.buildActions(uiDeps),
    palette: (env?: Env) => iface(env).palette(),
    notes: (env?: Env) => iface(env).notes(),
    run: (id: string, target?: Element) => iface().run(id, target),
    register: (action: ui.Action) => iface().register(action),

    contextMenu(cfg?: ui.ContextMenuOptions, env?: Env): () => void {
      const instance = ui.createInterface(
        uiDeps,
        {
          ...(cfg?.base ? { base: cfg.base } : {}),
          ...(cfg?.items ? { items: cfg.items } : {}),
          ...(cfg?.extra ? { actions: cfg.extra } : {}),
          ...(cfg?.title ? { title: cfg.title } : {}),
          ...(cfg?.description ? { description: cfg.description } : {}),
          ...(cfg?.registry ? { registry: cfg.registry } : {}),
          keyboard: false
        },
        env
      );
      return () => instance.destroy();
    },
    pickSections(base?: PrintcraftOptions, env?: Env) {
      return ui.pickSections(uiDeps, base, env);
    },
    drawArea(base?: ui.DrawOptions, env?: Env) {
      // the registry, so a right-click inside the selection has actions to
      // offer. Without it the tool opened fine and its context menu silently
      // fell through to the browser's own — which is what a user sees, and it
      // looks like nothing works.
      return ui.drawArea(uiDeps, { registry: iface(env).actions, ...base }, env);
    },
    redactArea(base?: ui.RedactOptions, env?: Env) {
      return ui.redactArea(uiDeps, base, env);
    },
    toggleRedact: ui.toggleRedact,
    annotate: ui.annotate,
    removeNote: ui.removeNote,
    askForNote: ui.askForNote,
    computeRect: ui.computeRect,
    icon,

    // the component kit, so a host can build its own surfaces in the same style
    modal: ui.modal,
    confirm: ui.confirm,
    notify: ui.notify,
    prompt: ui.promptFor,
    toast: ui.toast,
    menu: ui.openMenu,
    toolbar: ui.openToolbar,
    printDialog: (base?: PrintcraftOptions, env?: Env) => ui.printDialog(uiDeps, base, env),
    // env is optional here as it is everywhere else on this surface. exported
    // raw, these two were the only public functions that required it, which
    // failed with a destructuring error rather than anything readable.
    tooltip: (el: HTMLElement, spec: ui.TooltipSpec, env?: Env) =>
      ui.tooltip(el, spec, env || { document, window: window as Window & typeof globalThis }),
    popover: (anchor: HTMLElement, spec: ui.PopoverSpec, env?: Env) =>
      ui.popover(anchor, spec, env || { document, window: window as Window & typeof globalThis }),
    openPalette: ui.openPalette,
    notesPanel: (o?: ui.NotesPanelOptions, env?: Env) => ui.notesPanel(uiDeps, o, env),
    annotations: ui.annotations,
    clearAnnotations: ui.clearAnnotations,
    theme: { set: ui.setTheme, get: ui.getTheme, reset: ui.resetTheme, defaults: ui.DEFAULT_THEME },

    /**
     * What is remembered, and where it goes.
     *
     * `memory` is the shared interface's session, so `Printcraft.ui.memory
     * .export()` is everything this page has saved. The store constructors are
     * here so `create({ persist: httpStore({ url }) })` needs no second import.
     */
    get memory(): Session {
      return iface().memory;
    },
    stores: {
      memory: memoryStore,
      local: localStore,
      session: sessionStore,
      http: httpStore,
      custom: customStore
    },
    config: { resolve: resolveConfig, explain, layers: LAYERS }
  };
}

export type UiSurface = ReturnType<typeof makeUiSurface>;
