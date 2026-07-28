// the opt-in interaction layer. nothing here runs unless the host page asks for
// it, and every mode funnels back into an ordinary printcraft job.

export { icon } from './icons';
export { computeRect, toggleRedact, annotate, askForNote, noteOn } from './annotations';
export {
  buildMenuItems,
  contextMenu,
  openContextMenuAt,
  type ContextMenuOptions,
  type ContextMenuEntry,
  type MenuContext
} from './menu';

export * from './kit';
export { pickSections, type PickResult } from './picker';
export { drawArea, type DrawResult, type DrawOptions } from './draw';
export {
  printDialog,
  optionsFromForm,
  type PrintDialogOptions,
  type PrintDialogResult
} from './print-dialog';
export type { UiDeps } from './shared';
