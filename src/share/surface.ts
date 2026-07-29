// The share layer as one object, and the function that builds it.
//
// Same reason as the ui surface: keeping it off the class is what lets the core
// entry stay small for someone who only calls print().

import * as share from './index';
import * as ui from '../ui';
import type { Env, PrintcraftOptions } from '../types';
import type { Emitter } from '../support';

function defaultEnv(): Env {
  return { document, window };
}

export interface Attachment {
  Printcraft: {
    render(
      options: PrintcraftOptions | string | Element,
      env?: Env
    ): {
      element: Element;
      title: string;
      redactions: number;
      width: number;
    };
    share: ReturnType<typeof makeShareSurface>;
  };
  bus: Emitter;
  deps: ui.UiDeps;
}

export function makeShareSurface({ Printcraft, bus, deps: uiDeps }: Attachment) {
  return {
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
}

export type ShareSurface = ReturnType<typeof makeShareSurface>;
