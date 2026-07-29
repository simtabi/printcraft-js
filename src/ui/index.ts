// the opt-in interaction layer. nothing here runs unless the host page asks for
// it, and every mode funnels back into an ordinary printcraft job.

export { icon } from './icons';
export {
  computeRect,
  toggleRedact,
  annotate,
  askForNote,
  noteOn,
  annotations,
  clearAnnotations,
  describeElement,
  type Mark
} from './annotations';
export {
  contextMenu,
  openActionMenu,
  openActionPalette,
  actionsToEntries,
  actionsToPaletteItems,
  type ContextMenuOptions,
  type ContextMenuEntry,
  type MenuContext
} from './menu';

export {
  ActionRegistry,
  bindKeys,
  formatKeys,
  matchesKeys,
  parseKeys,
  isTyping,
  type Action,
  type ActionContext,
  type ResolvedAction
} from './actions';
export { buildActions, markCount, GROUPS } from './catalogue';
export { PrintcraftInterface, createInterface, type InterfaceOptions } from './instance';
export { notesPanel, type NotesPanelOptions, type NotesPanelResult } from './notes';

export * from './kit';
export { pickSections, type PickResult } from './picker';
export { drawArea, type DrawResult, type DrawOptions } from './draw';
export { redactArea, type RedactResult, type RedactOptions } from './redact';
export { composeEmail, type ComposeOptions } from './share';
export {
  printDialog,
  optionsFromForm,
  type PrintDialogOptions,
  type PrintDialogResult
} from './print-dialog';
export type { UiDeps } from './shared';
