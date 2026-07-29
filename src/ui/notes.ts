// Everything marked on the page, in one list.
//
// Notes and redactions are stored as attributes on the live element, which is
// what makes them survive between jobs. It also makes them invisible: a note
// added twenty minutes ago is a `data-` attribute nobody can see until something
// prints, and a redaction marked on the wrong paragraph is only discovered on
// paper.
//
// So: a panel that lists them, scrolls to each one, and lets you edit or remove
// it before anything is printed.

import { unmountOverlay as unmountDrawing } from '../annotate/render';
import { annotations, clearAnnotations, removeNote, toggleRedact, type Mark } from './annotations';
import { h, confirm, iconNode, modal, toast, tooltip } from './kit';
import { defaultEnv, type UiDeps } from './shared';
import type { Env, PrintcraftOptions } from '../types';

export interface NotesPanelOptions {
  base?: PrintcraftOptions;
  /** what to print when the panel's print button is used. the page by default. */
  target?: string | Element;
}

export interface NotesPanelResult {
  action: 'close' | 'print' | 'cleared';
  notes: number;
  redactions: number;
  drawings: number;
}

/** Draws one row, with the buttons that act on it. */
function card(mark: Mark, doc: Document, env: Env, refresh: () => void): HTMLElement {
  const row = h(doc, 'div', { class: 'prjs-card', attrs: { 'data-prjs-mark-kind': mark.kind } });

  const GLYPH: Record<Mark['kind'], string> = {
    note: 'note',
    redaction: 'redact',
    drawing: 'draw'
  };
  row.appendChild(
    h(doc, 'span', { class: 'prjs-item-icon', children: [iconNode(doc, GLYPH[mark.kind])] })
  );

  const said =
    mark.kind === 'note'
      ? mark.text || '(empty note)'
      : mark.kind === 'drawing'
        ? mark.text
        : 'Redacted on paper';

  const text = h(doc, 'div', { class: 'prjs-card-text' });
  text.appendChild(h(doc, 'div', { text: said }));
  text.appendChild(h(doc, 'div', { class: 'prjs-card-where', text: mark.where }));
  row.appendChild(text);

  const actions = h(doc, 'div', { class: 'prjs-card-actions' });

  const show = h(doc, 'button', {
    class: 'prjs-btn',
    attrs: { type: 'button', 'data-size': 'sm', 'data-icon-only': '', 'data-prjs-act': 'show' },
    children: [iconNode(doc, 'inspect')]
  });
  tooltip(show, { text: 'Scroll to it and flash it' }, env);
  show.addEventListener('click', () => {
    mark.element.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const el = mark.element as HTMLElement;
    const before = el.style.outline;
    el.style.outline = '3px solid var(--prjs-primary, #0f766e)';
    setTimeout(() => {
      el.style.outline = before;
    }, 1400);
  });
  actions.appendChild(show);

  if (mark.kind === 'note') {
    const edit = h(doc, 'button', {
      class: 'prjs-btn',
      attrs: { type: 'button', 'data-size': 'sm', 'data-icon-only': '', 'data-prjs-act': 'edit' },
      children: [iconNode(doc, 'note')]
    });
    tooltip(edit, { text: 'Change the wording' }, env);
    edit.addEventListener('click', () => {
      void import('./annotations').then(async ({ askForNote }) => {
        const next = await askForNote(mark.element, env);
        if (next != null) refresh();
      });
    });
    actions.appendChild(edit);
  }

  const remove = h(doc, 'button', {
    class: 'prjs-btn',
    attrs: {
      type: 'button',
      'data-size': 'sm',
      'data-icon-only': '',
      'data-tone': 'ghost',
      'data-prjs-act': 'remove'
    },
    children: [iconNode(doc, 'trash')]
  });
  const REMOVE_SAYS: Record<Mark['kind'], string> = {
    note: 'Delete this note',
    redaction: 'Stop redacting this',
    drawing: 'Rub this drawing out'
  };
  tooltip(remove, { text: REMOVE_SAYS[mark.kind] }, env);
  remove.addEventListener('click', () => {
    if (mark.kind === 'note') removeNote(mark.element);
    else if (mark.kind === 'drawing') {
      mark.element.removeAttribute('data-printcraft-drawing');
      unmountDrawing(mark.element as HTMLElement);
    } else toggleRedact(mark.element);
    refresh();
  });
  actions.appendChild(remove);

  row.appendChild(actions);
  return row;
}

/**
 * Opens the panel.
 *
 * Rebuilt from the live page each time something changes rather than kept in
 * state, because the page is the only place these live and anything else would
 * be a second copy to keep in step.
 */
export async function notesPanel(
  deps: UiDeps,
  options: NotesPanelOptions = {},
  env?: Env
): Promise<NotesPanelResult> {
  const scope = env || defaultEnv();
  const doc = scope.document;

  const body = h(doc, 'div');
  let counts = { notes: 0, redactions: 0, drawings: 0 };

  const paint = (): void => {
    const marks = annotations(doc);
    counts = {
      notes: marks.filter((m) => m.kind === 'note').length,
      redactions: marks.filter((m) => m.kind === 'redaction').length,
      drawings: marks.filter((m) => m.kind === 'drawing').length
    };

    body.textContent = '';
    if (!marks.length) {
      body.appendChild(
        h(doc, 'div', {
          class: 'prjs-empty',
          text: 'Nothing marked yet. Right-click anything to note it, redact it or draw on it.'
        })
      );
      return;
    }

    const summary = h(doc, 'div', { style: 'display:flex;gap:6px;margin-bottom:12px;' });
    const tally: Array<[number, string, string, string | null]> = [
      [counts.notes, 'note', 'notes', null],
      [counts.redactions, 'redaction', 'redactions', 'danger'],
      [counts.drawings, 'drawing', 'drawings', 'info']
    ];
    for (const [n, one, many, tone] of tally) {
      if (!n) continue;
      summary.appendChild(
        h(doc, 'span', {
          class: 'prjs-badge',
          ...(tone ? { attrs: { 'data-tone': tone } } : {}),
          text: n + ' ' + (n === 1 ? one : many)
        })
      );
    }
    body.appendChild(summary);

    const list = h(doc, 'div', { class: 'prjs-list', attrs: { 'data-prjs-notes': '' } });
    for (const mark of marks) list.appendChild(card(mark, doc, scope, paint));
    body.appendChild(list);
  };

  paint();

  const result = await modal(
    {
      title: 'Notes and redactions',
      description: 'Everything marked on this page. Nothing here has printed yet.',
      icon: 'note',
      size: 'md',
      body,
      // no "Close" here: the header's × is the way out, and a footer that
      // repeats it makes three controls out of two decisions
      actions: [
        { id: 'clear', label: 'Remove all', tone: 'ghost' },
        { id: 'print', label: 'Print with these', tone: 'primary', icon: 'printer' }
      ]
    },
    scope
  );

  if (result.action === 'clear') {
    const sure = await confirm(
      {
        title: 'Remove every mark?',
        message:
          counts.notes +
          counts.redactions +
          counts.drawings +
          ' marks would be removed from the page.',
        detail: 'The page itself is otherwise untouched, and nothing has printed.',
        confirmLabel: 'Remove all',
        tone: 'danger'
      },
      scope
    );
    if (sure) {
      const gone = clearAnnotations(doc);
      deps.emit('ui:annotate', { cleared: gone });
      toast({ message: gone + ' marks removed', tone: 'success' }, scope);
      return { action: 'cleared', ...counts };
    }
    return notesPanel(deps, options, scope);
  }

  if (result.action === 'print') {
    void deps.print({ ...options.base, target: options.target || 'body' }, scope);
    return { action: 'print', ...counts };
  }

  return { action: 'close', ...counts };
}
