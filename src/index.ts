// public entry: the fluent Printcraft class, static one-shots, the event bus,
// json config, declarative triggers, devtools, the ui layer, and browser boot.

import * as core from './core';
import * as redact from './privacy/redact';
import * as marks from './production/marks';
import * as ui from './ui';
import { icon } from './ui/icons';
import {
  assign,
  defaultsRef,
  detectDebug,
  debugState,
  devtools,
  Emitter,
  FORBIDDEN_TAGS,
  isElement,
  normalizeOptions,
  NS,
  parseDataOptions,
  raise,
  runJob,
  VERSION
} from './core';
import type {
  ClipRect,
  Env,
  HeaderFooterMode,
  Hooks,
  InspectController,
  JobRecord,
  LinkExposure,
  Listener,
  PrintcraftEvent,
  PrintcraftOptions,
  PrinterMarks,
  PrintTarget,
  PrivacyConfig,
  ResolvedOptions,
  ScrollExpansion,
  Transform
} from './types';

export type {
  Annotation,
  ClipRect,
  CustomMethodMap,
  Env,
  HeaderFooterMode,
  Hooks,
  InspectController,
  JobRecord,
  JobStatus,
  LinkExposure,
  Listener,
  Logger,
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

function defaultEnv(): Env {
  return { document, window };
}

/** the global bus. every job mirrors its events here, whatever surface started it. */
const bus = new Emitter();

/* json config ---------------------------------------------------------- */

/** merges a plain object into `Printcraft.defaults`. */
function applyConfig(obj: PrintcraftOptions): PrintcraftOptions {
  if (!obj || typeof obj !== 'object') raise('config must be a plain object');
  assign(defaultsRef.current, obj);
  bus.emit('config:loaded', { config: obj, source: 'object' });
  return defaultsRef.current;
}

/** fetches a json config file and merges it into the defaults. */
function loadConfig(
  url: string,
  fetchImpl?: (input: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>
): Promise<PrintcraftOptions> {
  const f = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
  if (!f) return Promise.reject(new Error('Printcraft: fetch is not available for loadConfig'));

  return Promise.resolve(f(url as string & Request))
    .then((res) => {
      if (!res.ok) raise('config request failed with status ' + res.status);
      return res.json();
    })
    .then((json) => {
      assign(defaultsRef.current, json as object);
      bus.emit('config:loaded', { config: json, source: url });
      return defaultsRef.current;
    });
}

/** picks up `<script type="application/json" data-printcraft-config>`. */
function readInlineConfig(doc: Document | null): PrintcraftOptions | null {
  if (!doc) return null;
  const node = doc.querySelector('script[type="application/json"][data-' + NS + '-config]');
  if (!node) return null;

  let json: PrintcraftOptions;
  try {
    json = JSON.parse(node.textContent || '') as PrintcraftOptions;
  } catch (e) {
    return raise('inline config is not valid json: ' + (e as Error).message);
  }
  applyConfig(json);
  return json;
}

/* declarative triggers -------------------------------------------------- */

/** one delegated listener turns every `[data-printcraft]` element into a trigger. */
function initDeclarative(env?: Env): () => void {
  const scope = env || defaultEnv();
  const doc = scope.document;
  readInlineConfig(doc);

  function onClick(e: Event): void {
    // only a plain primary click, and never one another handler already claimed
    if (e.defaultPrevented) return;
    const me = e as MouseEvent;
    if (typeof me.button === 'number' && me.button !== 0) return;

    const t = e.target as Element | null;
    const el = t && typeof t.closest === 'function' ? t.closest('[data-' + NS + ']') : null;
    if (!el) return;
    e.preventDefault();

    let opts: PrintcraftOptions;
    try {
      opts = parseDataOptions(el);
    } catch (err) {
      bus.emit('job:error', { error: err, trigger: el });
      try {
        console.error(err);
      } catch {
        /* noop */
      }
      return;
    }

    bus.emit('trigger', { element: el, options: opts });
    Printcraft.print(opts, scope).catch((err: unknown) => {
      try {
        console.error('[' + NS + ']', err);
      } catch {
        /* noop */
      }
    });
  }

  doc.addEventListener('click', onClick);
  return function teardown(): void {
    doc.removeEventListener('click', onClick);
  };
}

/* fluent class ---------------------------------------------------------- */

/**
 * the fluent builder and the static entry points. every setter mutates and
 * returns `this`, and validation is deferred to the terminals, so a partial chain
 * is legal and reusable.
 */
class Printcraft {
  options: PrintcraftOptions;
  private readonly _emitter: Emitter;

  constructor(options?: PrintcraftOptions | string | Element) {
    let init: PrintcraftOptions;
    if (typeof options === 'string' || isElement(options)) init = { target: options };
    else init = options || {};
    this.options = assign({} as PrintcraftOptions, init);
    this._emitter = new Emitter();
  }

  /* fluent setters ----------------------------------------------------- */

  target(t: PrintTarget): this {
    this.options.target = t;
    return this;
  }
  html(h: string): this {
    this.options.html = h;
    this.options.target = null;
    return this;
  }
  title(t: string): this {
    this.options.documentTitle = t;
    return this;
  }
  name(n: string): this {
    this.options.jobName = n;
    return this;
  }

  inWindow(features?: string): this {
    this.options.printInIframe = false;
    if (features) this.options.windowFeatures = features;
    return this;
  }

  pageSize(size: string): this {
    this.options.setPrintSize = size;
    return this;
  }
  margins(m: string): this {
    this.options.pageMargin = m;
    return this;
  }

  breakBefore(...selectors: string[]): this {
    this.options.pageBreakBeforeSelectors = core
      .toArray(this.options.pageBreakBeforeSelectors)
      .concat(selectors);
    return this;
  }
  breakAfter(...selectors: string[]): this {
    this.options.pageBreakAfterSelectors = core
      .toArray(this.options.pageBreakAfterSelectors)
      .concat(selectors);
    return this;
  }
  avoidBreak(...selectors: string[]): this {
    this.options.avoidBreakSelectors = core
      .toArray(this.options.avoidBreakSelectors)
      .concat(selectors);
    return this;
  }

  exclude(...selectors: string[]): this {
    this.options.excludeSelectorList = core
      .toArray(this.options.excludeSelectorList)
      .concat(selectors);
    return this;
  }
  redact(...selectors: string[]): this {
    this.options.redactSelectorList = core
      .toArray(this.options.redactSelectorList)
      .concat(selectors);
    return this;
  }
  privacy(cfg: PrivacyConfig | true = true): this {
    this.options.privacy = cfg;
    return this;
  }

  annotate(selector: string, text: string): this {
    this.options.annotations = core.toArray(this.options.annotations).concat([{ selector, text }]);
    return this;
  }
  marks(cfg: PrinterMarks | true = true): this {
    this.options.printerMarks = cfg;
    return this;
  }
  clip(rect: ClipRect): this {
    this.options.clipRect = rect;
    return this;
  }

  watermark(textOrCfg: string | PrintcraftOptions, opacity?: number): this {
    if (typeof textOrCfg === 'string') {
      this.options.watermarkText = textOrCfg;
      if (opacity != null) this.options.watermarkOpacity = opacity;
    } else {
      assign(this.options, textOrCfg);
    }
    return this;
  }

  header(text: string): this {
    this.options.headerText = text;
    return this;
  }
  footer(text: string): this {
    this.options.footerText = text;
    return this;
  }
  headerFooter(mode: HeaderFooterMode): this {
    this.options.headerFooterMode = mode;
    return this;
  }

  keepCss(on = true): this {
    this.options.keepSourceCSS = on;
    return this;
  }
  style(css: string): this {
    this.options.injectCustomStyle = (this.options.injectCustomStyle || '') + css;
    return this;
  }
  revealHidden(on = true): this {
    this.options.revealHiddenElements = on;
    return this;
  }

  expandScroll(mode: ScrollExpansion = true, maxHeight?: number): this {
    this.options.extendScrollableAreas = mode;
    if (maxHeight != null) this.options.scrollableAreasMaxHeight = maxHeight;
    return this;
  }

  links(mode: LinkExposure, template?: string): this {
    this.options.exposeLinkUrls = mode;
    if (template) this.options.linkTextTemplate = template;
    return this;
  }

  transform(selector: string, fn: Transform['fn']): this {
    this.options.transforms = core.toArray(this.options.transforms).concat([{ selector, fn }]);
    return this;
  }

  hook<K extends keyof Hooks>(name: K, fn: Hooks[K]): this {
    this.options.hooks = assign({}, this.options.hooks || {});
    this.options.hooks[name] = fn;
    return this;
  }

  set(patch: PrintcraftOptions): this {
    assign(this.options, patch);
    return this;
  }
  debug(on = true): this {
    this.options.debug = on;
    return this;
  }

  /* events -------------------------------------------------------------- */

  on(name: PrintcraftEvent | string, fn: Listener): this {
    this._emitter.on(name, fn);
    return this;
  }
  off(name?: PrintcraftEvent | string, fn?: Listener): this {
    this._emitter.off(name, fn);
    return this;
  }
  once(name: PrintcraftEvent | string, fn: Listener): this {
    this._emitter.once(name, fn);
    return this;
  }
  emit(name: PrintcraftEvent | string, payload?: unknown): unknown[] {
    return this._emitter.emit(name, payload);
  }

  /* terminals ----------------------------------------------------------- */

  /** the seam where every surface converges on one validated options object. */
  toOptions(): ResolvedOptions {
    return normalizeOptions(assign({} as PrintcraftOptions, this.options));
  }

  print(env?: Env): Promise<JobRecord> {
    return runJob(this.toOptions(), env || defaultEnv(), this._emitter, bus) as Promise<JobRecord>;
  }

  inspect(env?: Env): Promise<InspectController> {
    return runJob(
      this.toOptions(),
      env || defaultEnv(),
      this._emitter,
      bus,
      'inspect'
    ) as Promise<InspectController>;
  }

  /* statics ------------------------------------------------------------- */

  static version = VERSION;
  static FORBIDDEN_TAGS = FORBIDDEN_TAGS.slice();
  static devtools = devtools;
  static _bus = bus;
  static autoInit = true;

  static get defaults(): PrintcraftOptions {
    return defaultsRef.current;
  }
  static set defaults(v: PrintcraftOptions) {
    defaultsRef.current = v || {};
  }

  static job(target?: PrintcraftOptions | string | Element): Printcraft {
    return new Printcraft(target);
  }

  // statics pass no emitter, so each job gets a private one and two concurrent
  // jobs never see each other's per-job `on` listeners
  static print(options: PrintcraftOptions | string | Element, env?: Env): Promise<JobRecord> {
    return runJob(normalizeOptions(options), env || defaultEnv(), null, bus) as Promise<JobRecord>;
  }

  static inspect(
    options: PrintcraftOptions | string | Element,
    env?: Env
  ): Promise<InspectController> {
    return runJob(
      normalizeOptions(options),
      env || defaultEnv(),
      null,
      bus,
      'inspect'
    ) as Promise<InspectController>;
  }

  static printHTML(html: string, options?: PrintcraftOptions): Promise<JobRecord> {
    return Printcraft.print(assign({} as PrintcraftOptions, options || {}, { html, target: null }));
  }

  static on(name: PrintcraftEvent | string, fn: Listener): typeof Printcraft {
    bus.on(name, fn);
    return Printcraft;
  }
  static off(name?: PrintcraftEvent | string, fn?: Listener): typeof Printcraft {
    bus.off(name, fn);
    return Printcraft;
  }
  static once(name: PrintcraftEvent | string, fn: Listener): typeof Printcraft {
    bus.once(name, fn);
    return Printcraft;
  }
  static emit(name: PrintcraftEvent | string, payload?: unknown): unknown[] {
    return bus.emit(name, payload);
  }

  static applyConfig = applyConfig;
  static loadConfig = loadConfig;
  static readInlineConfig = readInlineConfig;
  static initDeclarative = initDeclarative;

  /** remaps Ctrl/Cmd+P to a printcraft job. the returned function restores it. */
  static bindHotkey(options: PrintcraftOptions | string | Element, env?: Env): () => void {
    const scope = env || defaultEnv();
    const handler = (e: Event): void => {
      const ke = e as KeyboardEvent;
      const key = (ke.key || '').toLowerCase();
      if (key === 'p' && (ke.ctrlKey || ke.metaKey) && !ke.altKey && !ke.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        bus.emit('hotkey', { event: ke });
        void Printcraft.print(options, scope);
      }
    };
    scope.window.addEventListener('keydown', handler, true);
    return function unbind(): void {
      scope.window.removeEventListener('keydown', handler, true);
    };
  }

  static debug(on?: boolean): boolean {
    if (on === undefined) return debugState.enabled;
    debugState.enabled = !!on;
    debugState.resolved = true;
    return debugState.enabled;
  }

  /* ui ------------------------------------------------------------------ */

  static ui = {
    contextMenu(cfg?: ui.ContextMenuOptions, env?: Env): () => void {
      return ui.contextMenu(uiDeps, cfg, env);
    },
    pickSections(base?: PrintcraftOptions, env?: Env) {
      return ui.pickSections(uiDeps, base, env);
    },
    drawArea(base?: PrintcraftOptions, env?: Env) {
      return ui.drawArea(uiDeps, base, env);
    },
    toggleRedact: ui.toggleRedact,
    annotate: ui.annotate,
    computeRect: ui.computeRect,
    icon
  };

  /** browser boot: declarative triggers, inline config, linked config file. */
  static _boot(doc: Document | null, win: Window | null): void {
    if (!doc || !win) return;

    let script: HTMLOrSVGScriptElement | null = null;
    try {
      script = doc.currentScript;
    } catch {
      /* noop */
    }

    if (script instanceof Element && script.getAttribute('data-auto-init') === 'false') {
      Printcraft.autoInit = false;
    }
    const configUrl = script instanceof Element ? script.getAttribute('data-config') : null;

    const go = (): void => {
      if (!Printcraft.autoInit) return;
      detectDebug(win);
      try {
        initDeclarative({ document: doc, window: win as Window & typeof globalThis });
      } catch (e) {
        try {
          console.error('[' + NS + '] auto-init failed:', e);
        } catch {
          /* noop */
        }
      }
      if (configUrl) {
        loadConfig(configUrl).catch((e: unknown) => {
          try {
            console.error('[' + NS + '] config load failed:', e);
          } catch {
            /* noop */
          }
        });
      }
      try {
        (win as Window & { printcraft?: unknown }).printcraft = (options: PrintcraftOptions) =>
          Printcraft.print(options);
      } catch {
        /* noop */
      }
    };

    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', go, { once: true });
    else go();
  }

  /** exposed internals for unit testing. underscore = not public api. */
  static _internals = {
    normalizeOptions,
    resolveTargets: core.resolveTargets,
    measureLiveTree: core.measureLiveTree,
    cloneTargets: core.cloneTargets,
    snapshotFormState: core.snapshotFormState,
    applyExclusions: core.applyExclusions,
    applyLinkExposure: core.applyLinkExposure,
    applyImageHandling: core.applyImageHandling,
    applyCanvasCapture: core.applyCanvasCapture,
    applyScrollableExpansion: core.applyScrollableExpansion,
    applyInlineStyleStrip: core.applyInlineStyleStrip,
    applyCustomTransforms: core.applyCustomTransforms,
    applyAnnotations: core.applyAnnotations,
    applyReveal: core.applyReveal,
    buildPageCss: core.buildPageCss,
    buildWatermarkNode: core.buildWatermarkNode,
    assemblePrintDocument: core.assemblePrintDocument,
    buildClipClone: core.buildClipClone,
    escapeHtml: core.escapeHtml,
    // mounts + waits
    mountIframe: core.mountIframe,
    mountWindow: core.mountWindow,
    mountOverlay: core.mountOverlay,
    waitForAssets: core.waitForAssets,
    waitForDialogClose: core.waitForDialogClose,
    Emitter,
    coerceValue: core.coerceValue,
    parseDataOptions,
    camelize: core.camelize,
    makeLogger: core.makeLogger,
    // security + privacy
    sanitizeClone: redact.sanitizeClone,
    redactElement: redact.redactElement,
    applyRedaction: redact.applyRedaction,
    applyPrivacy: redact.applyPrivacy,
    resolvePrivacyPatterns: redact.resolvePrivacyPatterns,
    // marks + ui
    marksCss: marks.marksCss,
    normalizeMarks: marks.normalizeMarks,
    buildMenuItems: ui.buildMenuItems,
    computeRect: ui.computeRect
  };
}

const uiDeps: ui.UiDeps = {
  print: (options, env) => Printcraft.print(options, env),
  inspect: (options, env) => Printcraft.inspect(options, env),
  emit: (name, payload) => bus.emit(name, payload)
};

// browser auto-boot. a no-op under node, where window is undefined.
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  Printcraft._boot(document, window);
}

export default Printcraft;
