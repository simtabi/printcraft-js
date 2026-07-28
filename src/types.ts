// the public type surface. every option printcraft accepts, the shapes it hands
// back, and the interfaces the internal collaborators implement.

import type { PrivacyConfig } from './privacy/redact';
import type { PrinterMarks, ResolvedPrinterMarks } from './production/marks';

export type { PrivacyConfig } from './privacy/redact';
export type { PrinterMarks, ResolvedPrinterMarks } from './production/marks';

/** the document/window pair a job runs against. jobs never touch globals directly. */
export interface Env {
  document: Document;
  window: Window & typeof globalThis;
}

/** a rectangle in page coordinates (scroll offsets already folded in). */
export interface ClipRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** a note chip rendered next to every element matching `selector`. */
export interface Annotation {
  selector: string;
  text: string;
}

/** a selector-keyed clone transform. return null to drop, an element to replace. */
export interface Transform {
  selector: string;
  fn: (el: Element, options: ResolvedOptions) => Element | null | void;
}

/** mutation points on the pipeline. `beforePrint` returning false cancels the job. */
export interface Hooks {
  beforeClone?: (targets: Element[], options: ResolvedOptions) => unknown;
  transformClone?: (clone: Element, options: ResolvedOptions) => Element | null | void;
  beforeAssemble?: (clones: Element[], options: ResolvedOptions) => unknown;
  beforePrint?: (ctx: { window: Window; document: Document; options: ResolvedOptions }) => unknown;
  afterPrint?: (ctx: { options: ResolvedOptions }) => unknown;
}

/** legacy ezPrintJS-era transform map, keyed by tag name. `transforms` supersedes it. */
export type CustomMethodMap = Record<
  string,
  | ((el: Element, options: ResolvedOptions) => Element | null | void)
  | ((el: Element, options: ResolvedOptions) => Element | null | void)[]
>;

export type LinkExposure = 'all' | 'external';
export type HeaderFooterMode = 'repeat' | 'once';
export type ScrollExpansion = boolean | 'table';
export type PrintTarget = string | Element | Array<string | Element> | null;

/** every event name the instance emitter and the global bus can emit. */
export type PrintcraftEvent =
  | 'job:start'
  | 'job:measure'
  | 'job:clone'
  | 'job:transform'
  | 'job:mount'
  | 'job:assets'
  | 'job:beforeprint'
  | 'job:afterprint'
  | 'job:done'
  | 'job:cancel'
  | 'job:error'
  | 'job:inspected'
  | 'trigger'
  | 'hotkey'
  | 'config:loaded'
  | 'config:skipped'
  | 'ui:menu'
  | 'ui:pick'
  | 'ui:draw'
  | 'ui:redact'
  | 'ui:annotate';

export type JobStatus = 'running' | 'done' | 'cancelled' | 'inspected' | 'error';

/** what a job resolves with, and what devtools keeps in its ring buffer. */
export interface JobRecord {
  id: number;
  name: string;
  mode: string;
  status: JobStatus;
  startedAt: number;
  timings: Record<string, number>;
  targetCount: number;
  cancelled: boolean;
  error: unknown;
  redactions: number;
  duration?: number;
  documentHTML?: string;
}

/**
 * everything a caller may pass. all optional — `normalizeOptions` fills the rest
 * from DEFAULTS and `Printcraft.defaults`.
 */
export interface PrintcraftOptions {
  /* target and mode */
  target?: PrintTarget;
  html?: string | null;
  clipRect?: ClipRect | null;
  /**
   * The layout width `clipRect` was measured against. Captured from the live
   * window when a job runs, so the clipped clone reproduces the layout the
   * region was drawn on rather than the paper's. Set it yourself only when
   * replaying a rectangle captured somewhere else.
   */
  clipSourceWidth?: number | null;
  documentTitle?: string | null;
  jobName?: string | null;
  printInIframe?: boolean;
  windowFeatures?: string;

  /* page setup */
  setPrintSize?: string | null;
  pageMargin?: string | null;
  pageBreakBetweenTargets?: boolean;
  pageBreakBeforeSelectors?: string | string[];
  pageBreakAfterSelectors?: string | string[];
  avoidBreakSelectors?: string | string[];
  headerText?: string | null;
  footerText?: string | null;
  headerFooterMode?: HeaderFooterMode;
  watermarkImageURL?: string | null;
  watermarkText?: string | null;
  watermarkOpacity?: number;
  watermarkAngle?: number;
  printerMarks?: PrinterMarks | boolean | null;

  /* content transforms */
  excludeSelectorList?: string | string[];
  revealHiddenElements?: boolean;
  exposeLinkUrls?: LinkExposure | null;
  linkTextTemplate?: string;
  printCanvas?: boolean;
  removeImages?: boolean;
  forceLazyImages?: boolean;
  extendScrollableAreas?: ScrollExpansion;
  scrollableAreasMaxHeight?: number | null;
  keepSourceCSS?: boolean;
  keepInlineStyles?: boolean;
  /** legacy alias: true forces `keepInlineStyles` false. */
  removeInlineStyles?: boolean;
  injectCustomStyle?: string | null;
  stripDarkMode?: boolean;
  flattenShadowDom?: boolean;
  preserveFormState?: boolean;
  transforms?: Transform | Transform[];
  customMethodMap?: CustomMethodMap | null;
  annotations?: Annotation | Annotation[];

  /* security and privacy */
  sanitize?: boolean;
  redactSelectorList?: string | string[];
  redactChar?: string;
  privacy?: PrivacyConfig | true | null;

  /* lifecycle */
  beforePrintCb?: ((options: ResolvedOptions) => unknown) | null;
  afterPrintCb?: ((options: ResolvedOptions) => unknown) | null;
  onError?: ((error: unknown) => unknown) | null;
  assetTimeout?: number;
  extraDelay?: number;
  afterPrintTimeout?: number;
  on?: Partial<Record<PrintcraftEvent, Listener>> | null;
  hooks?: Hooks | null;
  debug?: boolean | null;
}

/**
 * the post-normalization shape every internal stage receives: list options are
 * arrays, `printerMarks` is resolved, and nothing is undefined.
 */
export interface ResolvedOptions extends PrintcraftOptions {
  target: PrintTarget;
  html: string | null;
  clipRect: ClipRect | null;
  clipSourceWidth: number | null;
  documentTitle: string | null;
  jobName: string | null;
  printInIframe: boolean;
  windowFeatures: string;

  setPrintSize: string | null;
  pageMargin: string | null;
  pageBreakBetweenTargets: boolean;
  pageBreakBeforeSelectors: string[];
  pageBreakAfterSelectors: string[];
  avoidBreakSelectors: string[];
  headerText: string | null;
  footerText: string | null;
  headerFooterMode: HeaderFooterMode;
  watermarkImageURL: string | null;
  watermarkText: string | null;
  watermarkOpacity: number;
  watermarkAngle: number;
  printerMarks: ResolvedPrinterMarks | null;

  excludeSelectorList: string[];
  revealHiddenElements: boolean;
  exposeLinkUrls: LinkExposure | null;
  linkTextTemplate: string;
  printCanvas: boolean;
  removeImages: boolean;
  forceLazyImages: boolean;
  extendScrollableAreas: ScrollExpansion;
  scrollableAreasMaxHeight: number | null;
  keepSourceCSS: boolean;
  keepInlineStyles: boolean;
  injectCustomStyle: string | null;
  stripDarkMode: boolean;
  flattenShadowDom: boolean;
  preserveFormState: boolean;
  transforms: Transform[];
  customMethodMap: CustomMethodMap | null;
  annotations: Annotation[];

  sanitize: boolean;
  redactSelectorList: string[];
  redactChar: string;
  privacy: PrivacyConfig | true | null;

  assetTimeout: number;
  extraDelay: number;
  afterPrintTimeout: number;
  hooks: Hooks;
  debug: boolean | null;
}

export type Listener = (payload: EventPayload) => unknown;

/** what every `job:*` listener receives. extra keys vary by event. */
export interface EventPayload {
  job?: JobRecord;
  options?: ResolvedOptions;
  [key: string]: unknown;
}

/** per-element facts read off the live tree before cloning. */
export interface ElementMeta {
  canvasData?: string;
  canvasW?: number;
  canvasH?: number;
  imgW?: number;
  imgH?: number;
  currentSrc?: string;
  wasHidden?: boolean;
  scrollable?: boolean;
}

export type MetaMap = Record<string, ElementMeta>;

/** the measurement pass hands back facts plus the undo for its live-tree tagging. */
export interface Measurement {
  meta: MetaMap;
  cleanup(): void;
}

/** where an assembled print document goes: hidden iframe, popup, or inspector overlay. */
export interface Mount {
  readonly window: Window;
  readonly document: Document;
  /** inspector overlay only — the host element and its buttons. */
  readonly overlay?: HTMLElement;
  teardown(): void;
}

export interface Logger {
  active: boolean;
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  group(label: string): void;
  groupEnd(): void;
  table(data: unknown): void;
}

/** what `Printcraft.inspect()` resolves with. */
export interface InspectController {
  job: JobRecord;
  window: Window;
  document: Document;
  overlay: HTMLElement | undefined;
  print(): void;
  close(): void;
}
