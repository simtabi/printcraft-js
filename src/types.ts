// the public type surface. every option printcraft accepts, the shapes it hands
// back, and the interfaces the internal collaborators implement.

import type { PrivacyConfig } from './privacy/redact';
import type { PrinterMarks, ResolvedPrinterMarks } from './production/marks';
import type { BackendPrintOptions, BackendResult, PrintBackend } from './backend';
import type { TextRun } from './privacy/marking';
import type { RedactionPolicy } from './privacy/verify';

export type { PrivacyConfig } from './privacy/redact';
export type { PrinterMarks, ResolvedPrinterMarks } from './production/marks';
export type { TextRun } from './privacy/marking';
export type { RedactionPolicy, RedactionReport } from './privacy/verify';
export type {
  BackendCapabilities,
  BackendPrintOptions,
  BackendResult,
  PrintBackend,
  PrinterInfo
} from './backend';

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

/**
 * A finished job, as a backend sees it.
 *
 * Everything here has already been through the transform chain, so exclusions,
 * redaction and the sanitiser have all run. A backend never gets the live page,
 * which is what keeps "nothing leaks into the print copy" true no matter where
 * the job ends up.
 */
export interface RenderedJob {
  id: string;
  title: string;
  /** the assembled print document, as markup */
  html: string;
  sheet: { width: number; height: number; name: string };
  /** sheets, when the job was paginated; null when the browser flowed it */
  pages: number | null;
  /** present only for backends printing in the page, such as the browser's */
  document?: Document;
  window?: Window;
}

export type WatermarkPosition =
  | 'center'
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

/** How a watermark looks and where it lands. */
export interface Watermark {
  text?: string | null;
  /** a url; drawn instead of `text` when both are given */
  image?: string | null;
  /** a named spot on the sheet, or explicit coordinates the mark centres on */
  position?: WatermarkPosition | { x: string; y: string };
  /**
   * `first-page` marks page one, which is all a browser does unaided.
   * `every-page` marks each sheet. `tile` covers each sheet with a grid.
   * The last two turn `paginate` on.
   */
  repeat?: 'first-page' | 'every-page' | 'tile';
  tile?: { gap?: string; stagger?: boolean };
  /** a percentage of the sheet width, any css length, or a number of pixels */
  size?: string | number;
  /** degrees clockwise; negative leans left */
  rotate?: number;
  opacity?: number;
  color?: string;
  font?: string;
  weight?: string | number;
  /** `over` the content, or `behind` it where the content has no background */
  layer?: 'behind' | 'over';
  /** how far a corner or edge position sits in from the sheet edge */
  margin?: string;
}

export interface ResolvedWatermark {
  text: string | null;
  image: string | null;
  position: WatermarkPosition | { x: string; y: string };
  repeat: 'first-page' | 'every-page' | 'tile';
  tile: { gap: string; stagger: boolean };
  size: string;
  rotate: number;
  opacity: number;
  color: string;
  font: string;
  weight: string;
  layer: 'behind' | 'over';
  margin: string;
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

/** Where a page number sits on the sheet. */
export type PageNumberPosition =
  'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';

export interface PageNumbers {
  /** placeholders: {page} {pages} {title} {date} */
  template?: string;
  position?: PageNumberPosition;
  /** the number the first sheet carries, for a document in parts */
  startAt?: number;
  hideOnFirst?: boolean;
}

export interface PageBorder {
  width?: string;
  style?: 'solid' | 'dashed' | 'dotted' | 'double' | 'none';
  color?: string;
  radius?: string;
}

export interface PagePadding {
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
}

export interface PaginateConfig {
  /** keep at least this many lines of a block on the page it starts on */
  orphans?: number;
  widows?: number;
  /** break long tables by row, repeating the head. on by default. */
  splitTables?: boolean;
}

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
  | 'capture:start'
  | 'capture:done'
  | 'paginate:start'
  | 'paginate:done'
  | 'backend:start'
  | 'backend:done'
  | 'ui:menu'
  | 'ui:pick'
  | 'ui:draw'
  | 'ui:redact'
  | 'ui:annotate'
  | 'redact:mark'
  | 'redact:review'
  | 'redact:verify'
  | 'redact:leak'
  | 'share:screenshot'
  | 'share:copy'
  | 'share:email';

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
  /** sheets produced, when the job paginated */
  pages?: number;
  duration?: number;
  documentHTML?: string;
  /** what the backend reported, once the handoff completed */
  backend?: BackendResult;
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
  /**
   * How a clipped region reaches paper.
   *
   * `capture` rasterises the region at the layout it was selected against, which
   * is the only way to print what was actually on screen: at pagination time the
   * browser re-evaluates media queries against the page box, so live markup is
   * re-laid-out and the region no longer frames the same content.
   *
   * `reflow` keeps live, selectable markup and accepts that it will be laid out
   * at paper width. Right when text matters more than fidelity.
   */
  clipMode?: 'capture' | 'reflow';
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
  /** @deprecated use `watermark: { image }` */
  watermarkImageURL?: string | null;
  /** @deprecated use `watermark: { text }`, or pass a string to `watermark` */
  watermarkText?: string | null;
  /** @deprecated use `watermark: { opacity }` */
  watermarkOpacity?: number;
  /** @deprecated use `watermark: { rotate }` */
  watermarkAngle?: number;

  /**
   * Mark the pages.
   *
   * A string is the shorthand for `{ text }`. Asking for `repeat: 'every-page'`
   * or `'tile'` turns `paginate` on, because `position: fixed` prints on the
   * first page only and a mark on every page needs sheets to sit in.
   */
  watermark?: Watermark | string | null;
  printerMarks?: PrinterMarks | boolean | null;

  /**
   * Where the finished job goes. Defaults to the browser's own print dialog,
   * which needs nothing installed and cannot print silently or choose a device.
   * See docs/backends.md.
   */
  backend?: PrintBackend | null;
  /** passed to the backend: printer, copies, duplex, tray, silent */
  backendOptions?: BackendPrintOptions;

  /**
   * Text runs to destroy, as produced by dragging a rectangle over the page.
   * Unlike `redactSelectorList` these are character-accurate, so half a
   * paragraph redacts as half a paragraph.
   */
  redactRuns?: TextRun[];
  /**
   * What to do when the assembled document still contains something redaction
   * was told to destroy. `strict` stops the job, and is the default whenever a
   * job has any redaction at all.
   */
  redactionPolicy?: RedactionPolicy;

  /**
   * Lay the content out as real sheets rather than letting the browser flow it.
   *
   * This is what makes page numbers, per-page borders, per-page padding and
   * per-page headers possible at all: browsers do not implement the Paged Media
   * margin boxes those would otherwise need.
   */
  paginate?: boolean | PaginateConfig;
  pageNumbers?: boolean | PageNumbers;
  pageBorder?: boolean | PageBorder;
  pagePadding?: string | PagePadding;
  /** per-page bands, with the same placeholders as pageNumbers */
  pageHeader?: string | null;
  pageFooter?: string | null;
  /**
   * Emit `@page { margin: 0 }`, which leaves the browser nowhere to draw its own
   * date, title, URL and page count. Works in Chromium and Firefox; Safari
   * ignores it, and the reader can always switch them back on in the dialog.
   * Implied by `paginate`.
   */
  hideBrowserHeaderFooter?: boolean;

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
  clipMode: 'capture' | 'reflow';
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
  watermark: ResolvedWatermark | null;
  printerMarks: ResolvedPrinterMarks | null;
  backend: PrintBackend | null;
  backendOptions: BackendPrintOptions;
  redactRuns: TextRun[];
  redactionPolicy: RedactionPolicy;
  paginate: boolean | PaginateConfig;
  pageNumbers: boolean | PageNumbers;
  pageBorder: boolean | PageBorder;
  pagePadding: string | PagePadding;
  pageHeader: string | null;
  pageFooter: string | null;
  hideBrowserHeaderFooter: boolean;

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
