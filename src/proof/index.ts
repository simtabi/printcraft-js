// The proof sheet, as a mount.
//
// `mountIframe` puts the assembled document somewhere invisible and
// `mountWindow` puts it in a popup. This puts it on screen, in a panel with a
// page rail and a Print button — which is the only difference. Everything the
// pipeline does either side of the mount is unchanged, and that is the point:
// what the proof shows is the document, not a picture of it.

import { pushMark, releaseSourceLink } from './bridge';
import { openProof, type ProofSheet } from './sheet';
import type { Env, Mount, ResolvedOptions } from '../types';

export { ProofSheet } from './sheet';

/** A mount that is also a surface the user can act on. */
export interface ProofMount extends Mount {
  readonly sheet: ProofSheet;
  /** resolves with what the user chose once they choose it */
  decision: Promise<'print' | 'cancel'>;
}

/**
 * Assembles into a visible sheet and waits for the verdict.
 *
 * The promise the job awaits is the frame being ready, exactly as with the other
 * mounts. `decision` is separate and settles later, when somebody presses a
 * button — the job holds it and only then hands off to the backend.
 */
/** What the proof can ask its caller to do that it cannot do itself. */
export interface ProofHost {
  /**
   * Build the whole thing again with these options changed.
   *
   * Changing the paper means re-running the pipeline, which the panel cannot do
   * — it is a view of a job, not the job. The job hands this in, and because
   * marks live on the source page rather than on the copy (see ./bridge), what
   * comes back has every annotation still on it.
   */
  restart(patch: Record<string, unknown>): void;
}

export interface ProofOptions {
  /**
   * Opened to look at, not to decide.
   *
   * `Printcraft.inspect()` wants the same panel without the verdict: its caller
   * gets a controller and drives Print and Close itself, so the footer's Print
   * button hands off through that rather than settling a promise nobody is
   * waiting on.
   */
  readOnly?: boolean;
  /**
   * Takes down this proof's own source links.
   *
   * The job that measured the page knows which links are this proof's; sweeping
   * every `data-prjs-id` in the document would strip the ones a second open
   * proof is still writing marks through. Without it, the whole page is swept.
   */
  releaseLink?: () => void;
}

export async function mountProof(
  options: ResolvedOptions,
  env: Env,
  cfg: ProofOptions & Partial<ProofHost> = {}
): Promise<ProofMount> {
  const { sheet, window: win, document: doc } = await openProof(options, env);
  sheet.listenToFrame(doc);

  let settle: (verdict: 'print' | 'cancel') => void = () => {};
  const decision = new Promise<'print' | 'cancel'>((resolve) => {
    settle = resolve;
  });

  const release = (): void => {
    if (cfg.releaseLink) cfg.releaseLink();
    else releaseSourceLink(env.document);
  };

  let answered = false;
  const answer = (verdict: 'print' | 'cancel'): void => {
    if (answered) return;
    answered = true;
    settle(verdict);
  };

  sheet.onPrint = cfg.readOnly
    ? () => {
        // no job is waiting on a verdict here; print the frame directly
        try {
          win.focus();
          win.print();
        } catch {
          /* a frame that will not take focus still prints */
        }
      }
    : () => answer('print');
  sheet.onCancel = () => {
    answer('cancel');
    // read-only, nothing tears the mount down after this: an inspected proof
    // closed with Escape or Cancel would otherwise leave its links on the page
    release();
    sheet.close();
  };

  /**
   * A button whose code failed to load, or threw, does nothing rather than
   * surfacing as an unhandled rejection; it is said in the console.
   */
  const failed = (what: string) => (error: unknown) => {
    env.window.console?.error('Printcraft: the proof could not open ' + what, error);
  };

  /**
   * Annotating the proof.
   *
   * The studio takes an `Env`, so it is handed the *frame's* document and window
   * and works unchanged. Marks land on the print copy's elements, which is where
   * somebody looking at a proof means to put them.
   */
  sheet.onAnnotate = () => {
    void import('../annotate').then(({ openStudio }) => {
      openStudio(
        { document: doc, window: win as Window & typeof globalThis },
        {
          // every mark is written straight back to the page element it came
          // from, so changing the paper and rebuilding the sheet does not throw
          // it away. see ./bridge.
          onChange: (el) => {
            if (!pushMark(el, env.document)) {
              // the mark is on this sheet and prints with it, but a rebuild
              // would start from the page and lose it: a cover sheet, a page
              // number, a captured region. so the rebuild goes away instead.
              const rebuildable = sheet.disableSettings();
              void import('../ui/kit')
                .then(({ toast }) =>
                  toast(
                    {
                      message: rebuildable
                        ? 'That mark stays on this sheet only, so Settings is off until it prints'
                        : 'That mark stays on this sheet only',
                      tone: 'warn'
                    },
                    env
                  )
                )
                .catch(failed('its notice'));
            }
          }
        }
      );
    }, failed('the drawing tools'));
  };

  if (cfg.restart) {
    // one Settings dialog at a time: a double-click before the code loaded
    // used to open two, and applying both started two rebuilds
    let asking = false;
    sheet.onSettings = () => {
      if (asking) return;
      asking = true;
      void import('./settings')
        .then(({ askForSettings }) => askForSettings(options, env))
        .then((patch) => {
          if (!patch) return;
          // the panel goes; the job that replaces it brings the marks with it
          answer('cancel');
          release();
          sheet.close();
          cfg.restart!(patch);
        })
        .catch(failed('its settings'))
        .finally(() => {
          asking = false;
        });
    };
    sheet.enableSettings();
  }

  return {
    window: win,
    document: doc,
    overlay: sheet.root,
    sheet,
    decision,
    teardown: () => {
      // a proof that was never answered was dismissed
      answer('cancel');
      // the link is ours and invisible, but leaving it on somebody's live dom
      // after the panel has gone is litter
      release();
      sheet.close();
    }
  };
}
