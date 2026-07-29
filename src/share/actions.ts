// The share layer, as actions.
//
// These live here rather than in the catalogue because `/share` is a separate
// entry: importing it from the catalogue would put a rasteriser and an email
// composer in front of everyone who only wanted a menu. They are contributed
// when `/share` is imported, and simply absent when it is not, which is honest
// — there is no screenshot without the screenshot code.

import { toast } from '../ui/kit';
import type { Action, ActionContext } from '../ui/actions';
import type { Env, PrintcraftOptions } from '../types';

/** The part of the class these need, so this file does not import it. */
export interface ShareHost {
  share: {
    screenshot(options?: Record<string, unknown>, env?: Env): Promise<{ width: number }>;
    copyImage(options?: Record<string, unknown>, env?: Env): Promise<{ via: string }>;
    copy(options?: PrintcraftOptions | string | Element, env?: Env): Promise<{ via: string }>;
    email(options?: Record<string, unknown>, env?: Env): Promise<{ status: string }>;
  };
}

/** What an action should aim at, falling back to the whole page. */
function aim(ctx: ActionContext): Element | string {
  return ctx.target || 'body';
}

/** Reports a failure the way the rest of the interface does. */
function complain(e: unknown, env: Env): void {
  toast(
    { message: e instanceof Error ? e.message : String(e), tone: 'danger', duration: 6000 },
    env
  );
}

export function shareActions(host: ShareHost): Action[] {
  return [
    {
      id: 'screenshot',
      label: 'Save as an image',
      description: 'A png of what would print, redaction and all',
      icon: 'image',
      group: 'Share',
      keys: 'mod+shift+s',
      keywords: ['png', 'picture', 'export', 'download', 'save'],
      run: (ctx) =>
        host.share
          .screenshot({ ...ctx.base, target: aim(ctx), download: true }, ctx.env)
          .then(() => toast({ message: 'Saved', tone: 'success' }, ctx.env))
          .catch((e: unknown) => complain(e, ctx.env))
    },
    {
      id: 'copy-image',
      label: 'Copy as an image',
      description: 'Straight to the clipboard, as a png',
      icon: 'copy',
      group: 'Share',
      keywords: ['clipboard', 'png', 'paste'],
      run: (ctx) =>
        // called synchronously so the gesture is still live: Safari stops
        // treating one as live after the first await
        host.share
          .copyImage({ ...ctx.base, target: aim(ctx) }, ctx.env)
          .then(() => toast({ message: 'Copied as an image', tone: 'success' }, ctx.env))
          .catch((e: unknown) => complain(e, ctx.env))
    },
    {
      id: 'copy-markup',
      label: 'Copy the text',
      description: 'Rich markup, with plain text alongside',
      icon: 'copy',
      group: 'Share',
      keywords: ['clipboard', 'html', 'paste', 'text'],
      run: (ctx) =>
        host.share
          .copy({ ...ctx.base, target: aim(ctx) }, ctx.env)
          .then(() => toast({ message: 'Copied', tone: 'success' }, ctx.env))
          .catch((e: unknown) => complain(e, ctx.env))
    },
    {
      id: 'email',
      label: 'Send it…',
      description: 'Compose a message with this attached',
      icon: 'mail',
      group: 'Share',
      keywords: ['mail', 'send', 'share', 'attach'],
      run: (ctx) =>
        host.share
          .email({ ...ctx.base, target: aim(ctx) }, ctx.env)
          .catch((e: unknown) => complain(e, ctx.env))
    }
  ];
}
