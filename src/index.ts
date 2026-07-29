// public entry: the fluent Printcraft class, static one-shots, the event bus,
// json config, declarative triggers, devtools, the ui layer, and browser boot.

import * as core from './core';
import * as redact from './privacy/redact';
import * as marks from './production/marks';
import * as ui from './ui';
import * as share from './share';
import { icon } from './ui/icons';
import { browserBackend } from './backend/browser';
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
  BackendPrintOptions,
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
  PrintBackend,
  ScrollExpansion,
  Transform,
  Watermark
} from './types';

export type {
  Annotation,
  BackendCapabilities,
  BackendPrintOptions,
  BackendResult,
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
  PrintBackend,
  PrinterInfo,
  PrinterMarks,
  PrintTarget,
  PrivacyConfig,
  RenderedJob,
  ResolvedOptions,
  ResolvedPrinterMarks,
  ResolvedWatermark,
  ScrollExpansion,
  Transform,
  Watermark,
  WatermarkPosition
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
/**
 * `file://` pages cannot fetch their siblings: the origin is `null` and every
 * browser refuses. Worth naming, because the raw failure is a bare
 * "TypeError: Failed to fetch" that tells you nothing about what to do.
 */
function unfetchableFromFile(url: string, env?: Env): boolean {
  const from = env?.window?.location?.protocol;
  const to = /^([a-z][a-z0-9+.-]*):/i.exec(url)?.[1]?.toLowerCase();
  return (from === 'file:' && !to) || to === 'file';
}

function loadConfig(
  url: string,
  fetchImpl?: (input: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>,
  env?: Env
): Promise<PrintcraftOptions> {
  const f = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
  if (!f) return Promise.reject(new Error('Printcraft: fetch is not available for loadConfig'));

  if (!fetchImpl && unfetchableFromFile(url, env || defaultEnv())) {
    return Promise.reject(
      new Error(
        'Printcraft: cannot load "' +
          url +
          '" from a file:// page, because its origin is null and the browser blocks the request. ' +
          'Serve the page over http, or move the defaults into an inline ' +
          '<script type="application/json" data-printcraft-config> block.'
      )
    );
  }

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

  /**
   * `.watermark('DRAFT')` for the simple case, or the full spec for position,
   * tiling, colour and the rest. The opacity argument is a shorthand for the
   * one key people reach for most.
   */
  watermark(mark: string | Watermark, opacity?: number): this {
    const spec: Watermark = typeof mark === 'string' ? { text: mark } : assign({}, mark);
    if (opacity != null) spec.opacity = opacity;
    this.options.watermark = spec;
    return this;
  }

  /** Send this job somewhere other than the browser dialog. See docs/backends.md. */
  via(backend: PrintBackend, options?: BackendPrintOptions): this {
    this.options.backend = backend;
    if (options) this.options.backendOptions = options;
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

  /**
   * Where finished jobs go. The browser's dialog by default, which needs nothing
   * installed and cannot print silently or pick a device — those need a
   * companion service on the machine. See docs/backends.md.
   */
  static get backend(): PrintBackend {
    return (defaultsRef.current.backend as PrintBackend) || browserBackend;
  }
  static set backend(b: PrintBackend | null) {
    defaultsRef.current.backend = b;
  }
  static browserBackend = browserBackend;

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

  /* getting the result out of the page ---------------------------------- */

  /**
   * The transformed content, with nothing mounted and nothing printed.
   *
   * Everything under `share` goes through this, so a screenshot or a clipboard
   * copy carries the print copy rather than the live page — redaction included.
   */
  static render(
    options: PrintcraftOptions | string | Element,
    env?: Env
  ): { element: Element; title: string; redactions: number; width: number } {
    return core.renderJob(normalizeOptions(options), env || defaultEnv(), bus);
  }

  static share = {
    /** Renders the job to an image, optionally saving it. */
    async screenshot(options: share.ScreenshotOptions = {}, env?: Env) {
      const scope = env || defaultEnv();
      const shot = await share.screenshot(
        (o, e) => Promise.resolve(Printcraft.render(o, e)),
        options,
        scope
      );
      bus.emit('share:screenshot', {
        width: shot.width,
        height: shot.height,
        skipped: shot.skipped
      });
      return shot;
    },

    /**
     * Puts the job on the clipboard as a png.
     *
     * Safari only counts a gesture as live until the first `await`, so the
     * pending render is handed to `ClipboardItem` rather than awaited first.
     * Call this straight from a click handler.
     */
    copyImage(options: share.ScreenshotOptions = {}, env?: Env) {
      const scope = env || defaultEnv();
      const pending = Printcraft.share
        .screenshot({ ...options, download: false, type: 'image/png' }, scope)
        .then((shot) => shot.blob);
      return share.copyImage(pending, scope).then((r) => {
        bus.emit('share:copy', { format: r.format, via: r.via });
        return r;
      });
    },

    /** Copies the print copy as rich markup, with plain text alongside. */
    async copy(options: PrintcraftOptions | string | Element = {}, env?: Env) {
      const scope = env || defaultEnv();
      const { element } = Printcraft.render(options, scope);
      const result = await share.copyHtml(
        element.innerHTML,
        (element as HTMLElement).innerText || element.textContent || '',
        scope
      );
      bus.emit('share:copy', { format: result.format, via: result.via });
      return result;
    },

    /** Copies the print copy as plain text. */
    async copyText(options: PrintcraftOptions | string | Element = {}, env?: Env) {
      const scope = env || defaultEnv();
      const { element } = Printcraft.render(options, scope);
      const result = await share.copyText(
        (element as HTMLElement).innerText || element.textContent || '',
        scope
      );
      bus.emit('share:copy', { format: result.format, via: result.via });
      return result;
    },

    /** Opens the compose window, then sends through your transport. */
    async email(options: ui.ComposeOptions & share.ScreenshotOptions = {}, env?: Env) {
      const scope = env || defaultEnv();
      let attachment: share.EmailAttachment | null = null;

      if (options.attachment !== null) {
        const shot = await Printcraft.share.screenshot({ ...options, download: false }, scope);
        attachment = {
          filename: (options.documentTitle || 'printcraft') + '.png',
          type: 'image/png',
          blob: shot.blob,
          dataUrl: shot.dataUrl
        };
      }
      return ui.composeEmail(uiDeps, { ...options, attachment }, scope);
    },

    sendEmail: share.sendEmail,
    mailtoUrl: share.mailtoUrl,
    parseAddresses: share.parseAddresses,
    invalidAddresses: share.invalidAddresses,
    saveBlob: share.saveBlob,
    rasterize: share.rasterize
  };

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
    redactArea(base?: ui.RedactOptions, env?: Env) {
      return ui.redactArea(uiDeps, base, env);
    },
    toggleRedact: ui.toggleRedact,
    annotate: ui.annotate,
    askForNote: ui.askForNote,
    computeRect: ui.computeRect,
    icon,

    // the component kit, so a host can build its own surfaces in the same style
    modal: ui.modal,
    confirm: ui.confirm,
    notify: ui.notify,
    prompt: ui.promptFor,
    toast: ui.toast,
    menu: ui.openMenu,
    toolbar: ui.openToolbar,
    printDialog: (base?: PrintcraftOptions, env?: Env) => ui.printDialog(uiDeps, base, env),
    theme: { set: ui.setTheme, get: ui.getTheme, defaults: ui.DEFAULT_THEME }
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
      const scope: Env = { document: doc, window: win as Window & typeof globalThis };

      // A page opened from disk can never fetch its own files. Nothing the author
      // writes changes that, so booting stays quiet about it and says so on the
      // bus instead. An explicit loadConfig() call still rejects with the full
      // explanation, because there someone asked.
      if (configUrl && unfetchableFromFile(configUrl, scope)) {
        bus.emit('config:skipped', {
          source: configUrl,
          reason: 'a file:// page cannot fetch its own files'
        });
      } else if (configUrl) {
        loadConfig(configUrl, undefined, scope).catch((e: unknown) => {
          try {
            console.error('[' + NS + '] ' + (e instanceof Error ? e.message : String(e)));
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
    resolveWatermark: core.resolveWatermark,
    runsInRect: core.runsInRect,
    applyRuns: core.applyRuns,
    secretsOf: core.secretsOf,
    verifyRedaction: core.verifyRedaction,
    buildWatermarkLayer: core.buildWatermarkLayer,
    needsPages: core.needsPages,
    assemblePrintDocument: core.assemblePrintDocument,
    buildClipClone: core.buildClipClone,
    escapeHtml: core.escapeHtml,
    // page geometry
    resolveSheet: core.resolveSheet,
    toPx: core.toPx,
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
