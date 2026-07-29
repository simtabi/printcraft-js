// Attaching a surface to the class, once.
//
// Both `/ui` and `/share` need the interaction layer, and a page that imports
// both used to get two surfaces: the second replaced the first, and with it the
// closure holding the page's interface. The result was two live menus answering
// one right-click.

import { attachment } from './index';
import { makeUiSurface } from './ui/surface';

let attached = false;

/** Builds the ui surface if nothing has, and installs the interface. */
export function attachUi(): void {
  if (attached) return;
  attached = true;

  attachment.Printcraft.ui = makeUiSurface(attachment);

  // The menu and the keymap, once every entry has finished loading.
  //
  // index.ts cannot do this itself: its boot runs before this file has attached
  // anything. And it cannot happen inline here either, because /share
  // contributes its own actions after /ui has loaded, and an interface built
  // before that would be missing them. A microtask is after all of it: module
  // evaluation is synchronous.
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const install = (): void => attachment.Printcraft._installInterface();
    if (typeof queueMicrotask === 'function') queueMicrotask(install);
    else setTimeout(install, 0);
  }
}
