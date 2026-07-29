// one print job, start to finish. every surface (imperative, fluent,
// declarative, the ui layer) converges here on the same ordered stages, each of
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
import { applyRuns, secretsOf } from '../privacy/marking';
import { RedactionLeakError, verifyRedaction } from '../privacy/verify';
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
import { paginate as paginateInto } from './paginate';
import { mountIframe, mountWindow, waitForAssets } from './mounts';
import { browserBackend } from '../backend/browser';
import { resolveSheet } from '../production/sheets';
import { devtools } from './devtools';
import type {
  Env,
  EventPayload,
  Hooks,
  RenderedJob,
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

/**
 * `proof` assembles exactly as `print` does and then stops, showing the result
 * and waiting. Pressing Print in the proof continues *this* job rather than
 * starting another, which is what makes "what you looked at is what prints"
 * true by construction instead of by promise.
 */
export type JobMode = 'print' | 'inspect' | 'proof';

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

  /**
   * Whether the source-to-clone link outlives the transform chain.
   *
   * Only the proof needs it, and only while it is open: it is what lets a note
   * added on sheet two find the paragraph it belongs to on the live page, so
   * changing the paper size and re-rendering does not throw the note away.
   */
  private get keepsSourceLink(): boolean {
    return this.mode === 'proof' || this.mode === 'inspect';
  }
  /** every string redaction destroyed, for the verifier to look for afterwards */
  private readonly secrets: string[] = [];

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

  /** clip rect, raw html, or resolved targets: the three ways content enters. */
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

    this.measured = measureLiveTree(targets, options, env.window, this.keepsSourceLink);
    const clones = cloneTargets(targets, options);
    if (options.flattenShadowDom) applyShadowFlatten(targets, clones);
    // the proof keeps the link (see `keepsSourceLink`), and sweeps it on close
    if (!this.keepsSourceLink) this.measured.cleanup();
    return clones;
  }

  /**
   * Runs the whole job again with some options changed.
   *
   * Used by the proof sheet's settings. The current job is already cancelled by
   * the time this fires — the panel answers `cancel` before calling — so this is
   * a fresh job rather than a resumed one, and the record the original caller is
   * awaiting resolves as cancelled. That is the honest description of what
   * happened: the sheet they asked for is not the sheet they printed.
   */
  private restart(patch: Record<string, unknown>): void {
    // `this.options` is already resolved, so the patch merges onto a complete
    // set and needs no normalising pass of its own
    const next = { ...this.options, ...patch } as ResolvedOptions;
    this.fire('job:restart', { patch });
    void runJob(next, this.env, null, this.bus, 'proof');
  }

  /** the ordered transform chain. some stages can swap the clone root outright. */
  private transformClone(clone: Element): Element {
    const { options, env } = this;
    const meta = this.measured ? this.measured.meta : {};
    let root = clone;

    if (options.sanitize) sanitizeClone(root);
    applyExclusions(root, options);

    // everything destroyed here is remembered, so the assembled document can be
    // re-read for it before the job leaves the browser. see verifyDocument.
    applyRedaction(root, options.redactSelectorList, options.redactChar, NS, this.secrets);
    if (options.redactRuns.length) {
      this.record.redactions += applyRuns(root, options.redactRuns, options.redactChar);
      this.secrets.push(...secretsOf(options.redactRuns));
    }
    if (options.privacy) {
      this.record.redactions += applyPrivacy(
        root,
        options.privacy as PrivacyConfig | true,
        options.redactChar,
        this.secrets
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
    // The proof sheet keeps it.
    //
    // `data-prjs-id` is written on the source element and inherited by the
    // clone, which is how the transform chain correlates a measurement with the
    // node it measured. Stripped, the two documents share nothing an annotation
    // could be carried across — and a mark made on the proof would belong to a
    // copy that is thrown away the moment anything re-renders.
    if (!this.keepsSourceLink) stripDataIds(root);

    const replaced = this.hook('transformClone', root, options);
    return isElement(replaced) ? replaced : root;
  }

  private mount(): Promise<Mount> {
    // every mount gets the options so it can size itself to the sheet. a frame
    // laid out at the wrong width reflows the clone and the job prints something
    // the user never saw
    // `inspect` is the proof sheet, opened to look rather than to decide.
    //
    // It used to be a separate hand-inline-styled overlay with Print / Log HTML
    // / Close, answering the same question — "what is about to print?" — worse,
    // and it is the thing `mode: 'proof'` was built to be. One panel, not two.
    if (this.mode === 'inspect' || this.mode === 'proof') {
      // loaded on demand: a job that prints straight through never needs the
      // panel, and it is the largest thing the pipeline can reach
      return import('../proof').then(({ mountProof }) =>
        mountProof(this.options, this.env, {
          readOnly: this.mode === 'inspect',
          // changing the paper means running the pipeline again, which the panel
          // cannot do and this can. marks live on the source page rather than on
          // the copy, so the sheet that comes back still has them.
          ...(this.mode === 'proof' ? { restart: (patch) => this.restart(patch) } : {})
        })
      );
    }
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

    // normalizeOptions turns pagination on for a repeating watermark, because
    // one fixed element cannot reach page two. Say so: it changes the layout.
    if (options.watermark && options.watermark.repeat !== 'first-page') {
      this.log.info(
        'watermark repeat is "' +
          options.watermark.repeat +
          '", so the content is laid out as real sheets. ' +
          'A fixed mark only ever prints on the first page.'
      );
    }

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

  /**
   * Clone, transform, and stop.
   *
   * No frame, no printer, no assets waited for. The share layer uses this so a
   * screenshot or a clipboard copy carries exactly what the printer would have
   * been given, redaction and all.
   */
  renderOnly(): { element: Element; title: string; redactions: number; width: number } {
    // the layout width the content was measured at, so a raster of it is the
    // width it had on screen rather than whatever a detached div collapses to
    const sourceWidth = this.sourceWidth();
    const clones = this.buildClones().map((c) => this.transformClone(c));
    const holder = this.env.document.createElement('div');
    holder.className = 'prjs-render';
    holder.setAttribute('data-prjs-ui', '');
    for (const clone of clones) holder.appendChild(clone);

    if (this.options.redactionPolicy !== 'off' && this.secrets.length) {
      // the same guarantee the print path gets: nothing leaves with content
      // redaction was told to destroy
      const scratch = this.env.document.implementation.createHTMLDocument('');
      scratch.body.appendChild(scratch.importNode(holder, true));
      const report = verifyRedaction(scratch, this.secrets);
      this.fire('redact:verify', { ...report });
      if (report.leaked.length) {
        this.fire('redact:leak', { ...report });
        if (this.options.redactionPolicy === 'strict') throw new RedactionLeakError(report);
        this.log.warn('redacted content survived into the rendered copy:', report.leaked.length);
      }
    }

    return {
      element: holder,
      title: this.options.documentTitle || this.env.document.title || '',
      redactions: this.record.redactions,
      width: sourceWidth
    };
  }

  /** How wide the content is on screen, falling back to the sheet. */
  private sourceWidth(): number {
    const { options, env } = this;
    if (options.clipRect) return Math.round(options.clipRect.width);
    try {
      const first = resolveTargets(options.target, env.document)[0];
      const width = first?.getBoundingClientRect().width;
      if (width && width > 1) return Math.round(width);
    } catch {
      // an unresolvable target fails properly later, in buildClones
    }
    return resolveSheet(options.setPrintSize).width;
  }

  /**
   * The job as a backend sees it.
   *
   * `html` is the assembled document, which has already been through every
   * transform, so a backend that ships it off the machine ships the redacted
   * copy and never the original.
   */
  private renderedJob(mount: Mount): RenderedJob {
    const sheet = resolveSheet(this.options.setPrintSize);
    return {
      id: String(this.record.id),
      title: this.options.documentTitle || mount.document.title || '',
      html: mount.document.documentElement.outerHTML,
      sheet: { width: sheet.width, height: sheet.height, name: sheet.label },
      pages: this.record.pages ?? null,
      document: mount.document,
      window: mount.window
    };
  }

  /**
   * Re-reads the assembled document for anything redaction destroyed.
   *
   * Everything else in the pipeline is best-effort: a missed exclusion prints an
   * extra paragraph. A missed redaction prints a name. So the last thing before
   * the handoff is checking our own work, and by default a leak stops the job
   * rather than reaching paper.
   */
  private verifyDocument(doc: Document): void {
    const policy = this.options.redactionPolicy;
    if (policy === 'off' || !this.secrets.length) return;

    const report = verifyRedaction(doc, this.secrets);
    this.mark('verify');
    this.fire('redact:verify', { ...report });
    if (!report.leaked.length) return;

    this.fire('redact:leak', { ...report });
    if (policy === 'warn') {
      this.log.warn(
        'redacted content is still in the print document:',
        report.leaked.length,
        'string(s).',
        'Printing anyway because redactionPolicy is "warn".'
      );
      return;
    }
    throw new RedactionLeakError(report);
  }

  /** splits the assembled content into real sheets, when asked */
  private paginateDocument(doc: Document): void {
    if (!this.options.paginate) return;

    const host = doc.querySelector('.prjs-pages') || doc.body;
    this.fire('paginate:start');
    const result = paginateInto(doc, host, this.options, this.log);
    this.mark('paginate');
    this.record.pages = result.pages;
    // the proof draws a page rail from this; nothing else knows the count until
    // the paginator has run
    const proofSheet = (this.mounted as { sheet?: { setPages(n: number | null): void } } | null)
      ?.sheet;
    proofSheet?.setPages(result.pages);
    this.fire('paginate:done', { pages: result.pages, oversized: result.oversized });

    // the sheets are live elements now, which is what makes this the only place
    // to stamp one of them in particular
    this.hook('afterPaginate', {
      sheets: [...doc.querySelectorAll('.prjs-page-sheet')],
      document: doc,
      options: this.options
    });
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

        // pagination measures a live layout, so it belongs here: the frame
        // exists, the content is in it, and nothing has printed yet
        this.paginateDocument(mount.document);

        // and the check runs on the finished document, after every stage that
        // could have put something back, including pagination, which rebuilds
        // container chains as it splits
        this.verifyDocument(mount.document);

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

        /**
         * Everything from the last hooks to the backend handoff.
         *
         * A function because the proof sheet sits in front of it: the document
         * is assembled and shown, and only if somebody presses Print does any of
         * this run. Same job, same mount, same bytes.
         */
        const handOff = (): JobRecord | Promise<JobRecord> => {
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

          // the handoff goes through a backend so a companion service can take it
          // over without a caller changing anything. the browser's dialog is the
          // default, and the only one that needs nothing installed.
          const backend = options.backend || browserBackend;
          let rendered = this.renderedJob(mount);

          // the last look before it leaves the browser. beforePrint fires against
          // the mounted document; this fires against the payload itself, which is
          // the only place to inspect or amend it.
          if (backend !== browserBackend) {
            const amended = this.hook('beforeBackend', {
              job: rendered,
              backend: backend.name,
              options
            });
            if (amended === false) return this.cancelled();
            if (amended && typeof amended === 'object') rendered = amended as RenderedJob;
          }

          this.fire('backend:start', { backend: backend.name });

          return backend.print(rendered, options.backendOptions).then((result) => {
            this.mark('dialog');
            this.teardownMount();
            this.record.backend = result;
            this.fire('backend:done', { ...result });
            this.hook('afterPrint', { options });
            if (typeof options.afterPrintCb === 'function') options.afterPrintCb(options);
            this.finalize(result.status === 'cancelled' ? 'cancelled' : 'done');
            this.fire('job:afterprint');
            this.fire('job:done');
            this.detachTempListeners();
            return this.record;
          });
        };

        // asked of the mount rather than imported from `../proof`, which would
        // be a static edge into the component kit and put a modal library in
        // front of everyone who only calls print(). The packaging test caught
        // exactly that.
        const proof = mount as Mount & { decision?: Promise<'print' | 'cancel'> };
        if (this.mode === 'proof' && typeof proof.decision?.then === 'function') {
          return proof.decision.then((verdict) =>
            verdict === 'cancel' ? this.cancelled() : handOff()
          );
        }
        return handOff();
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
 * runs one job. pass `null` for the emitter to get a private one, which is what
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

/**
 * The transformed content, without mounting or printing anything.
 *
 * This is what the share layer photographs and copies. It has to be the same
 * clones the printer would get: a screenshot of the live page would put back
 * everything redaction was asked to destroy.
 */
export function renderJob(
  options: ResolvedOptions,
  env: Env,
  bus: Emitter
): { element: Element; title: string; redactions: number; width: number } {
  const job = new Job(options, env, new Emitter(), bus);
  return job.renderOnly();
}
