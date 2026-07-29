// `@simtabi/printcraft/ui`
//
// Importing this attaches the interaction layer to the class. One import rather
// than a second object to thread around, because every entry point into the
// library already goes through `Printcraft`.

import { attachment } from './index';
import * as uiModule from './ui';
import { makeUiSurface } from './ui/surface';

attachment.Printcraft.ui = makeUiSurface(attachment);

// the test seam gains what only exists once the ui is loaded
Object.assign(attachment.Printcraft._internals, {
  buildMenuItems: uiModule.buildMenuItems,
  computeRect: uiModule.computeRect
});

export * from './index';
export { default } from './index';
export * from './ui';
export type { UiSurface } from './ui/surface';
