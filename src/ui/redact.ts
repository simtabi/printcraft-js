// Marking things for redaction by dragging over them.
//
// Selectors work when you know the markup. Nobody reading a document on screen
// knows the markup, and the thing they want gone is usually a phrase rather than
// an element. So: drag a box over it, see what will be destroyed, and confirm.
//
// A rectangle resolves to the characters it actually covers, so half a paragraph
// redacts as half a paragraph. The review step lists every mark and what it
// removes, because a destructive operation you cannot inspect before it runs is
// one you have to trust blindly.

import { h as node, confirm, modal, openToolbar, toast, type ToolbarHandle } from './kit';
import { computeRect } from './annotations';
import { defaultEnv, el, Z, type UiDeps, suppressNativeMenu } from './shared';
import { runsInRect, secretsOf, type TextRun } from '../privacy/marking';
import type { ClipRect, Env, InspectController, JobRecord, PrintcraftOptions } from '../types';

export interface RedactOptions extends PrintcraftOptions {
  /** what the rectangles are drawn over. the whole page by default. */
  scope?: string | Element | null;
  /** show the review list before printing. on by default. */
  review?: boolean;
}

export interface RedactResult {
  action: 'cancel';
}

interface Mark {
  id: number;
  rect: ClipRect;
  runs: TextRun[];
  box: HTMLElement;
}

const MIN = 8;

/**
 * Opens the redaction overlay.
 *
 * Resolves once the job has printed, or with `{ action: 'cancel' }` if the
 * session is abandoned. Nothing is destroyed until the job runs, and nothing at
 * all happens to the live page.
 */
export function redactArea(
  deps: UiDeps,
  opts: RedactOptions = {},
  env?: Env
): Promise<JobRecord | InspectController | RedactResult> {
  const scope = env || defaultEnv();
  const doc = scope.document;
  const win = scope.window;

  const root =
    (typeof opts.scope === 'string' ? doc.querySelector(opts.scope) : opts.scope) || doc.body;

  return new Promise((resolve) => {
    let settled = false;
    let marks: Mark[] = [];
    let nextId = 1;
    let drawing: { x: number; y: number } | null = null;
    let live: HTMLElement | null = null;

    const layer = el(
      doc,
      'div',
      'position:fixed;inset:0;z-index:' + Z + ';cursor:crosshair;background:rgba(23,24,27,.18);'
    );
    layer.setAttribute('data-prjs-redact-layer', '');
    const unsuppress = suppressNativeMenu(layer);

    let bar: ToolbarHandle | null = null;

    /* drawing ----------------------------------------------------------- */

    function markStyle(rect: ClipRect, pending: boolean): string {
      return (
        'position:absolute;left:' +
        (rect.x - win.scrollX) +
        'px;top:' +
        (rect.y - win.scrollY) +
        'px;width:' +
        rect.width +
        'px;height:' +
        rect.height +
        'px;background:' +
        (pending ? 'rgba(23,24,27,.55)' : '#17181b') +
        ';border:1px solid ' +
        (pending ? '#e5007d' : '#17181b') +
        ';'
      );
    }

    function onDown(e: PointerEvent): void {
      if (e.button !== 0) return;
      e.preventDefault();
      drawing = { x: e.clientX, y: e.clientY };
      live = el(
        doc,
        'div',
        markStyle(
          { x: drawing.x + win.scrollX, y: drawing.y + win.scrollY, width: 0, height: 0 },
          true
        )
      );
      layer.appendChild(live);
      layer.setPointerCapture?.(e.pointerId);
    }

    function onMove(e: PointerEvent): void {
      if (!drawing || !live) return;
      const rect = computeRect(
        drawing.x,
        drawing.y,
        e.clientX,
        e.clientY,
        win.scrollX,
        win.scrollY
      );
      live.setAttribute('style', markStyle(rect, true));
    }

    function onUp(e: PointerEvent): void {
      if (!drawing || !live) return;
      const rect = computeRect(
        drawing.x,
        drawing.y,
        e.clientX,
        e.clientY,
        win.scrollX,
        win.scrollY
      );
      layer.releasePointerCapture?.(e.pointerId);
      drawing = null;

      if (rect.width < MIN || rect.height < MIN) {
        live.remove();
        live = null;
        return;
      }

      // the overlay would otherwise be measured along with the page
      layer.style.display = 'none';
      const runs = runsInRect(root as Element, rect, win);
      layer.style.display = 'block';

      if (!runs.length) {
        live.remove();
        live = null;
        toast({ message: 'No text under that box, so there is nothing to destroy.' }, scope);
        return;
      }

      live.setAttribute('style', markStyle(rect, false));
      live.setAttribute('data-prjs-mark', String(nextId));
      marks.push({ id: nextId++, rect, runs, box: live });
      live = null;

      deps.emit('redact:mark', { rect, runs: runs.length, marks: marks.length });
      refresh();
    }

    function removeLast(): void {
      const last = marks.pop();
      if (!last) return;
      last.box.remove();
      refresh();
    }

    function refresh(): void {
      const chars = marks.reduce((n, m) => n + m.runs.reduce((c, r) => c + r.text.length, 0), 0);
      bar?.setStatus(
        marks.length
          ? marks.length + (marks.length === 1 ? ' mark' : ' marks') + ' · ' + chars + ' characters'
          : 'Drag over anything you want destroyed'
      );
      bar?.setDisabled('review', marks.length === 0);
      bar?.setDisabled('undo', marks.length === 0);
    }

    /* the review step ---------------------------------------------------- */

    /** Every mark, and exactly what it removes. */
    async function review(): Promise<boolean> {
      const list = node(doc, 'div', { style: 'display:grid;gap:8px;' });

      marks.forEach((mark, i) => {
        const text = mark.runs.map((r) => r.text).join(' ');
        const preview = text.length > 90 ? text.slice(0, 90) + '…' : text;

        list.appendChild(
          node(doc, 'div', {
            style:
              'display:flex;gap:10px;align-items:baseline;padding:8px 10px;' +
              'border:1px solid #d8d8d3;border-radius:4px;background:#faf9f6;',
            children: [
              node(doc, 'span', {
                style: 'font:600 11px ui-monospace,monospace;color:#8a3324;flex:none;',
                text: String(i + 1)
              }),
              node(doc, 'span', {
                style: 'font:13px/1.5 ui-monospace,monospace;word-break:break-word;',
                text: preview
              })
            ]
          })
        );
      });

      const result = await modal(
        {
          title: 'Destroy this text?',
          description:
            marks.length +
            (marks.length === 1 ? ' mark' : ' marks') +
            '. The text is replaced in the print copy, not covered over, and the page you are ' +
            'reading is not touched.',
          size: 'md',
          body: list,
          actions: [
            { id: 'back', label: 'Keep marking', tone: 'ghost' },
            { id: 'print', label: 'Redact and print', tone: 'primary', icon: 'printer' }
          ]
        },
        scope
      );

      deps.emit('redact:review', { marks: marks.length, action: result.action });
      return result.action === 'print';
    }

    /* finishing ---------------------------------------------------------- */

    async function commit(): Promise<void> {
      if (!marks.length) return;
      layer.style.display = 'none';

      if (opts.review !== false && !(await review())) {
        layer.style.display = 'block';
        return;
      }

      teardown();
      settled = true;

      const runs = marks.flatMap((m) => m.runs);
      resolve(
        deps.print(
          {
            ...opts,
            target: opts.scope || opts.target || 'body',
            redactRuns: [...(opts.redactRuns || []), ...runs],
            // a job whose whole point is destroying text should not print when
            // the destruction did not take
            redactionPolicy: opts.redactionPolicy || 'strict'
          },
          scope
        )
      );
    }

    async function cancel(): Promise<void> {
      if (settled) return;
      if (marks.length) {
        layer.style.display = 'none';
        const sure = await confirm(
          {
            title: 'Discard the marks?',
            message:
              marks.length + ' mark' + (marks.length === 1 ? '' : 's') + ' would be thrown away.',
            detail: 'Nothing has printed, and the page itself was never changed.',
            confirmLabel: 'Discard',
            tone: 'danger'
          },
          scope
        );
        if (!sure) {
          layer.style.display = 'block';
          return;
        }
      }
      settled = true;
      teardown();
      resolve({ action: 'cancel' });
    }

    function teardown(): void {
      unsuppress();
      doc.removeEventListener('keydown', onKey, true);
      win.removeEventListener('scroll', reposition);
      bar?.close();
      layer.remove();
    }

    /** marks are held in page coordinates, so scrolling has to move them */
    function reposition(): void {
      for (const mark of marks) mark.box.setAttribute('style', markStyle(mark.rect, false));
    }

    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault();
        void cancel();
      } else if ((e.key === 'Backspace' || e.key === 'Delete') && marks.length) {
        e.preventDefault();
        removeLast();
      } else if (e.key === 'Enter' && marks.length) {
        e.preventDefault();
        void commit();
      }
    }

    /* wiring ------------------------------------------------------------- */

    layer.addEventListener('pointerdown', onDown);
    layer.addEventListener('pointermove', onMove);
    layer.addEventListener('pointerup', onUp);
    doc.addEventListener('keydown', onKey, true);
    win.addEventListener('scroll', reposition);
    doc.body.appendChild(layer);

    bar = openToolbar(
      {
        label: 'Redact',
        status: 'Drag over anything you want destroyed',
        actions: [
          {
            id: 'review',
            label: 'Review',
            icon: 'redact',
            tone: 'primary',
            disabled: true,
            onSelect: () => void commit()
          },
          {
            id: 'undo',
            label: 'Undo',
            icon: 'trash',
            disabled: true,
            onSelect: removeLast
          },
          { id: 'cancel', label: 'Cancel', icon: 'close', onSelect: () => void cancel() }
        ]
      },
      scope
    );
  });
}

/** The strings a set of marks would destroy. Exposed for callers building their own review. */
export { secretsOf };
