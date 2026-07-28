// one print job, start to finish. every surface — imperative, fluent,
// declarative, the ui layer — converges here on the same ordered stages, each of
// which emits an event and records a timing.

import {
  assign,
  debugState,
  detectDebug,
  Emitter,
  isElement,
  makeLogger,
  now,
  NS
} from '../support';
import {
  applyShadowFlatten,
  buildClipClone,
  clipSourceWidth,
  cloneTargets,
  measureLiveTree,
  resolveTargets
} from './measure';
import { applyPrivacy, applyRedaction, sanitizeClone } from '../privacy/redact';
import {
  applyAnnotations,
  applyCanvasCapture,
  applyCustomTransforms,
  applyExclusions,
  applyImageHandling,
  applyInlineStyleStrip,
  applyLinkExposure,
  applyReveal,
  applyScrollableExpansion,
  stripDataIds
} from './transforms';
import { assemblePrintDocument } from './document';
import { captureRegion } from './capture';
import {
  mountIframe,
  mountOverlay,
  mountWindow,
  waitForAssets,
  waitForDialogClose
} from './mounts';
import { devtools } from './devtools';
import type {
  Env,
  EventPayload,
  Hooks,
  InspectController,
  JobRecord,
  JobStatus,
  Logger,
  Measurement,
  Mount,
  PrivacyConfig,
  ResolvedOptions
} from '../types';

let jobCounter = 0;

export type JobMode = 'print' | 'inspect';

/** describes a job in devtools and the debug log before any target is resolved. */
function describe(options: ResolvedOptions): string {
  if (options.jobName) return options.jobName;
  if (typeof options.target === 'string') return options.target;
  if (options.clipRect) return 'clip region';
  if (options.html != null) return '<html string>';
  return 'element';
}

/**
 * owns the lifecycle of a single job: its record, its timings, its listeners, and
 * the teardown of whatever it mounted. constructed per call and never reused.
 */
export class Job {
  readonly record: JobRecord;

  private readonly log: Logger;
  private readonly debugOn: boolean;
  private readonly startedAt = now();
  private lastMark = this.startedAt;
  private readonly tempListeners: Array<[string, unknown]> = [];

  private measured: Measurement | null = null;
  private mounted: Mount | null = null;

  constructor(
    private readonly options: ResolvedOptions,
    private readonly env: Env,
    /** per-job emitter. never the global bus, or concurrent jobs would cross-talk. */
    private readonly emitter: Emitter,
    private readonly bus: Emitter,
    private readonly mode: JobMode = 'print'
  ) {
    this.record = {
      id: ++jobCounter,
      name: describe(options),
      mode: mode === 'inspect' ? 'inspect' : options.printInIframe ? 'iframe' : 'window',
      status: 'running',
      startedAt: Date.now(),
      timings: {},
      targetCount: 0,
      cancelled: false,
      error: null,
      redactions: 0
    };

    const debugOn =
      options.debug != null ? !!options.debug : debugState.enabled || detectDebug(env.window);
    this.log = makeLogger(debugOn, this.record.id);
    this.debugOn = debugOn;
  }

  /* wiring ------------------------------------------------------------- */

  private attachTempListeners(): void {
    const on = this.options.on;
    if (!on || typeof on !== 'object') return;
    for (const name of Object.keys(on)) {
      const fn = (on as Record<string, unknown>)[name];
      if (typeof fn === 'function') {
        this.emitter.on(name, fn);
        this.tempListeners.push([name, fn]);
      }
    }
  }

  private detachTempListeners(): void {
    for (const [name, fn] of this.tempListeners) this.emitter.off(name, fn);
    this.tempListeners.length = 0;
  }

  /** emits on the job's own emitter and mirrors to the global bus. */
  private fire(name: string, extra?: Record<string, unknown>): unknown[] {
    const payload: EventPayload = assign({ job: this.record, options: this.options }, extra || {});
    const own = this.emitter.emit(name, payload);
    const mirrored = this.bus === this.emitter ? [] : this.bus.emit(name, payload);
    return own.concat(mirrored);
  }

  private hook<K extends keyof Hooks>(name: K, arg1?: unknown, arg2?: unknown): unknown {
    const fn = this.options.hooks[name];
    if (typeof fn === 'function') {
      return (fn as (a?: unknown, b?: unknown) => unknown)(arg1, arg2);
    }
    return undefined;
  }

  private mark(stage: string): void {
    const t = now();
    this.record.timings[stage] = Math.round((t - this.lastMark) * 100) / 100;
    this.lastMark = t;
    this.log.debug('stage:', stage, '(' + this.record.timings[stage] + 'ms)');
  }

  private finalize(status: JobStatus, error?: unknown): void {
    this.record.status = status;
    this.record.error = error || null;
    this.record.duration = Math.round((now() - this.startedAt) * 100) / 100;
    devtools.record(this.record);
    this.log.group('job ' + this.record.id + ' ' + status + ' in ' + this.record.duration + 'ms');
    this.log.table(this.record.timings);
    this.log.groupEnd();
  }

  /* stages ------------------------------------------------------------- */

  /** clip rect, raw html, or resolved targets — the three ways content enters. */
  private buildClones(): Element[] {
    const { options, env } = this;

    if (options.clipRect && !options.target && options.html == null) {
      // the rectangle's coordinates only mean something against the layout they
      // were taken from, so record that width before anything is mounted
      if (!options.clipSourceWidth) {
        options.clipSourceWidth = clipSourceWidth(env.document, options.clipRect);
      }
      this.record.targetCount = 1;
      return [buildClipClone(env.document, options.clipRect, options)];
    }

    if (options.html != null) {
      const holder = env.document.createElement('div');
      holder.innerHTML = String(options.html);
      this.record.targetCount = 1;
      return [holder];
    }

    const targets = resolveTargets(options.target, env.document);
    this.record.targetCount = targets.length;
    this.hook('beforeClone', targets, options);
    this.fire('job:measure', { targets });

    this.measured = measureLiveTree(targets, options, env.window);
    const clones = cloneTargets(targets, options);
    if (options.flattenShadowDom) applyShadowFlatten(targets, clones);
    this.measured.cleanup();
    return clones;
  }

  /** the ordered transform chain. some stages can swap the clone root outright. */
  private transformClone(clone: Element): Element {
    const { options, env } = this;
    const meta = this.measured ? this.measured.meta : {};
    let root = clone;

    if (options.sanitize) sanitizeClone(root);
    applyExclusions(root, options);
    applyRedaction(root, options.redactSelectorList, options.redactChar, NS);
    if (options.privacy) {
      this.record.redactions += applyPrivacy(
        root,
        options.privacy as PrivacyConfig | true,
        options.redactChar
      );
    }
    if (options.revealHiddenElements) applyReveal(root, meta);
    applyLinkExposure(root, options, env.window.location);
    if (options.printCanvas) root = applyCanvasCapture(root, meta, env.document);
    root = applyImageHandling(root, options, meta, env.document);
    if (options.extendScrollableAreas) applyScrollableExpansion(root, options, meta);
    if (!options.keepInlineStyles) applyInlineStyleStrip(root);
    applyAnnotations(root, options, env.document);
    root = applyCustomTransforms(root, options);
    stripDataIds(root);

    const replaced = this.hook('transformClone', root, options);
    return isElement(replaced) ? replaced : root;
  }

  private mount(): Promise<Mount> {
    // every mount gets the options so it can size itself to the sheet. a frame
    // laid out at the wrong width reflows the clone and the job prints something
    // the user never saw
    if (this.mode === 'inspect') return mountOverlay(this.env.document, this.options);
    if (this.options.printInIframe) return mountIframe(this.env.document, this.options);
    return mountWindow(this.env.window, this.options);
  }

  private cancelled(): JobRecord {
    this.record.cancelled = true;
    this.teardownMount();
    this.finalize('cancelled');
    this.fire('job:cancel');
    this.detachTempListeners();
    return this.record;
  }

  private teardownMount(): void {
    if (!this.mounted) return;
    try {
      this.mounted.teardown();
    } catch {
      /* already gone */
    }
    this.mounted = null;
  }

  private toInspectController(mount: Mount): InspectController {
    return {
      job: this.record,
      window: mount.window,
      document: mount.document,
      overlay: mount.overlay,
      print: () => {
        try {
          mount.window.focus();
          mount.window.print();
        } catch {
          /* noop */
        }
      },
      close: () => mount.teardown()
    };
  }

  /* the run ------------------------------------------------------------ */

  run(): Promise<JobRecord | InspectController> {
    const { options } = this;
    this.attachTempListeners();

    this.log.group('job ' + this.record.id + ' "' + this.record.name + '" start');
    this.log.table({
      mode: this.record.mode,
      target: String(options.target),
      clip: !!options.clipRect,
      debug: this.debugOn
    });
    this.log.groupEnd();

    return Promise.resolve()
      .then(() => {
        this.fire('job:start');

        let clones = this.buildClones();
        this.mark('clone');
        this.fire('job:clone', { clones });

        if (typeof options.beforePrintCb === 'function') options.beforePrintCb(options);

        clones = clones.map((clone) => this.transformClone(clone));
        this.mark('transform');
        this.fire('job:transform', { clones });

        // A selected region is rasterised here, after every transform, so the
        // capture already has redaction and exclusions baked in. Doing it any
        // later would mean photographing content we promised to destroy.
        return this.captureIfRegion(clones).then((finalClones) => {
          this.hook('beforeAssemble', finalClones, options);
          return this.assembleAndPrint(finalClones);
        });
      })
      .catch((err: unknown) => this.fail(err));
  }

  /** replaces a clip clone with its raster when `clipMode` asks for one */
  private captureIfRegion(clones: Element[]): Promise<Element[]> {
    const { options } = this;
    const rect = options.clipRect;
    if (!rect || options.clipMode !== 'capture' || options.target || options.html != null) {
      return Promise.resolve(clones);
    }
    const clone = clones[0];
    if (!clone) return Promise.resolve(clones);

    this.fire('capture:start', { rect });
    return captureRegion(clone, rect, options, this.env.document).then((result) => {
      this.mark('capture');
      if (result.skipped.length) {
        this.log.warn('could not inline', result.skipped.length, 'asset(s):', result.skipped);
      }
      this.fire('capture:done', {
        rect,
        width: result.width,
        height: result.height,
        skipped: result.skipped
      });
      return [result.element];
    });
  }

  private assembleAndPrint(clones: Element[]): Promise<JobRecord | InspectController> {
    const { options } = this;
    return this.mount()
      .then((mount) => {
        this.mounted = mount;
        assemblePrintDocument(mount.document, clones, options, this.env.document);
        this.mark('assemble');
        if (this.debugOn || this.mode === 'inspect') {
          try {
            this.record.documentHTML = mount.document.documentElement.outerHTML;
          } catch {
            /* noop */
          }
        }
        this.fire('job:mount', { window: mount.window, document: mount.document });
        return waitForAssets(mount.document, mount.window, options).then(() => mount);
      })
      .then((mount) => {
        this.mark('assets');
        this.fire('job:assets');

        if (this.mode === 'inspect') {
          this.finalize('inspected');
          const controller = this.toInspectController(mount);
          this.fire('job:inspected', { controller });
          this.detachTempListeners();
          return controller;
        }

        const hookSaysNo =
          this.hook('beforePrint', {
            window: mount.window,
            document: mount.document,
            options
          }) === false;
        const eventSaysNo = this.fire('job:beforeprint', {
          window: mount.window,
          document: mount.document
        }).some((r) => r === false);
        if (hookSaysNo || eventSaysNo) return this.cancelled();

        const closed = waitForDialogClose(mount.window, options);
        try {
          mount.window.focus();
        } catch {
          /* noop */
        }
        mount.window.print();

        return closed.then(() => {
          this.mark('dialog');
          this.teardownMount();
          this.hook('afterPrint', { options });
          if (typeof options.afterPrintCb === 'function') options.afterPrintCb(options);
          this.finalize('done');
          this.fire('job:afterprint');
          this.fire('job:done');
          this.detachTempListeners();
          return this.record;
        });
      });
  }

  /**
   * One exit for everything that goes wrong: sweep the live page clean, tear the
   * mount down, and either hand the error to `onError` or rethrow it.
   */
  private fail(err: unknown): JobRecord {
    if (this.measured) {
      try {
        this.measured.cleanup();
      } catch {
        /* noop */
      }
    }
    this.teardownMount();
    this.finalize('error', err);
    this.fire('job:error', { error: err });
    this.detachTempListeners();
    this.log.error(err);

    if (typeof this.options.onError === 'function') {
      this.options.onError(err);
      return this.record;
    }
    throw err;
  }
}

/**
 * runs one job. pass `null` for the emitter to get a private one — which is what
 * every static entry point does, so two concurrent jobs never see each other's
 * per-job `on` listeners.
 */
export function runJob(
  options: ResolvedOptions,
  env: Env,
  emitter: Emitter | null,
  bus: Emitter,
  mode?: JobMode
): Promise<JobRecord | InspectController> {
  return new Job(options, env, emitter || new Emitter(), bus, mode).run();
}
