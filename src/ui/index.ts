// the opt-in interaction layer. nothing here runs unless the host page asks for
// it, and every mode funnels back into an ordinary printcraft job.

export { icon } from './icons';
export {
  computeRect,
  toggleRedact,
  annotate,
  askForNote,
  noteOn,
  removeNote,
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
export { buildActions, contributeActions, markCount, GROUPS } from './catalogue';
export {
  PrintcraftInterface,
  createInterface,
  rememberingMemory,
  type InterfaceOptions
} from './instance';
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

// the stores, so `import { localStore } from '@simtabi/printcraft/ui'` works as
// docs/tools/memory.md shows. they are already in this chunk, behind `persist`.
export { memoryStore, localStore, sessionStore, httpStore, customStore } from '../state';
