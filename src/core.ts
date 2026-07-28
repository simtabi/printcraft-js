// the internal barrel.
//
// the pipeline lives in focused folders — support/ (primitives), options/ (how a
// job is described), pipeline/ (how it runs), privacy/, production/, ui/ — and
// this file is the single seam they are re-exported through, so
// `Printcraft._internals` and anything that imported from './core' keeps working.

/** injected by vite at build time from package.json; falls back when run from source. */
declare const __PRINTCRAFT_VERSION__: string;

export const VERSION: string =
  typeof __PRINTCRAFT_VERSION__ !== 'undefined' ? __PRINTCRAFT_VERSION__ : '0.0.0-dev';

export {
  NS,
  DATA_ID,
  FORBIDDEN_TAGS,
  Emitter,
  assign,
  toArray,
  isElement,
  escapeHtml,
  clamp,
  raise,
  now,
  camelize,
  eachInclusive,
  selfAndMatches,
  replaceNode,
  removeNode,
  debugState,
  detectDebug,
  makeLogger
} from './support';

export { DEFAULTS, defaultsRef, normalizeOptions, coerceValue, parseDataOptions } from './options';

export {
  resolveTargets,
  measureLiveTree,
  snapshotFormState,
  cloneTargets,
  applyShadowFlatten,
  buildClipClone,
  clipSourceWidth
} from './pipeline/measure';

export {
  applyExclusions,
  applyReveal,
  applyLinkExposure,
  applyCanvasCapture,
  applyImageHandling,
  applyScrollableExpansion,
  applyInlineStyleStrip,
  applyAnnotations,
  applyCustomTransforms,
  stripDataIds
} from './pipeline/transforms';

export {
  buildPageCss,
  buildWatermarkNode,
  collectSourceCss,
  assemblePrintDocument
} from './pipeline/document';

export {
  mountIframe,
  mountWindow,
  mountOverlay,
  waitForAssets,
  waitForDialogClose
} from './pipeline/mounts';

export { resolveSheet, toPx, DEFAULT_SHEET } from './production/sheets';
export type { SheetSize } from './production/sheets';

export { devtools } from './pipeline/devtools';

export { Job, runJob } from './pipeline/job';

export type {
  Annotation,
  ClipRect,
  CustomMethodMap,
  ElementMeta,
  Env,
  EventPayload,
  HeaderFooterMode,
  Hooks,
  InspectController,
  JobRecord,
  JobStatus,
  LinkExposure,
  Listener,
  Logger,
  Measurement,
  MetaMap,
  Mount,
  PrintcraftEvent,
  PrintcraftOptions,
  PrinterMarks,
  PrintTarget,
  PrivacyConfig,
  ResolvedOptions,
  ResolvedPrinterMarks,
  ScrollExpansion,
  Transform
} from './types';

/** @deprecated use `PrintcraftOptions` for input, `ResolvedOptions` internally. */
export type Options = import('./types').PrintcraftOptions;
