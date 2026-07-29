// The interaction layer as one object, and the function that builds it.
//
// It lives here rather than on the class so the core entry can declare its type
// without importing its code: `static ui = {...}` would be a live reference no
// bundler could drop, and everybody printing an invoice would ship a modal kit
// they never open.

import * as ui from './index';
import { icon } from './icons';
import type { Env, PrintcraftOptions } from '../types';

export interface Attachment {
  deps: ui.UiDeps;
}

export function makeUiSurface({ deps: uiDeps }: Attachment) {
  return {
    contextMenu(cfg?: ui.ContextMenuOptions, env?: Env): () => void {
      return ui.contextMenu(uiDeps, cfg, env);
    },
    pickSections(base?: PrintcraftOptions, env?: Env) {
      return ui.pickSections(uiDeps, base, env);
    },
    drawArea(base?: PrintcraftOptions, env?: Env) {
      return ui.drawArea(uiDeps, base, env);
    },
    redactArea(base?: ui.RedactOptions, env?: Env) {
      return ui.redactArea(uiDeps, base, env);
    },
    toggleRedact: ui.toggleRedact,
    annotate: ui.annotate,
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
    theme: { set: ui.setTheme, get: ui.getTheme, defaults: ui.DEFAULT_THEME }
  };
}

export type UiSurface = ReturnType<typeof makeUiSurface>;
