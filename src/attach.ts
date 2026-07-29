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

  // the menu and the keymap, now that there is something to install. index.ts
  // cannot do this itself: its boot runs before this file has attached anything.
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    attachment.Printcraft._installInterface();
  }
}
