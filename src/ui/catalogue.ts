// The stock actions.
//
// Every capability the interface offers is one of these. The context menu
// renders them, the command palette searches them, the keymap fires them, and a
// host can add, replace, reorder or remove any of them by id.
//
// Keeping them in one list rather than inside the menu is what makes the other
// three surfaces possible at all: before, the only place "draw a print area"
// existed was a closure in an array the menu owned.

import { activeRegion, hasRegion } from './region';
import { annotations, askForNote, toggleRedact } from './annotations';
import { drawArea } from './draw';
import { redactArea } from './redact';
import { notesPanel } from './notes';
import { pickSections } from './picker';
import { printDialog } from './print-dialog';
import { toast } from './kit';
import type { Action, ActionContext } from './actions';
import { viaProof, type UiDeps } from './shared';

/**
 * Actions contributed by a layer that is not always loaded.
 *
 * `/share` is a separate entry, so the catalogue cannot import it: doing that
 * would put a rasteriser and an email composer in front of everyone who wanted
 * a menu. Instead the share entry contributes its own actions when it is
 * imported, and they are simply absent when it is not — which is honest, since
 * there is no screenshot without the screenshot code.
 */
type ActionFactory = (deps: UiDeps) => Action[];

const contributed: ActionFactory[] = [];

/** Adds a factory whose actions appear in every interface built after it. */
export function contributeActions(factory: ActionFactory): void {
  if (!contributed.includes(factory)) contributed.push(factory);
}

/** The groups, in the order they appear. */
export const GROUPS = {
  print: 'Print',
  choose: 'Choose what prints',
  mark: 'Mark up',
  share: 'Share',
  inspect: 'Inspect'
} as const;

/**
 * The stock catalogue.
 *
 * `deps` is how an action reaches the library without importing it, which keeps
 * this file testable and keeps the ui layer a leaf.
 */
export function buildActions(deps: UiDeps): Action[] {
  return [...stockActions(deps), ...contributed.flatMap((factory) => factory(deps))];
}

function stockActions(deps: UiDeps): Action[] {
  /** the element an action should aim at, falling back to the whole page */
  const aim = (ctx: ActionContext): Element | string => ctx.target || 'body';

  return [
    /* print --------------------------------------------------------------- */
    {
      id: 'print-element',
      label: 'Print this element',
      description: 'Just what you right-clicked',
      icon: 'click',
      group: GROUPS.print,
      keywords: ['here', 'selection', 'this'],
      when: (ctx) => !!ctx.target,
      run: (ctx) => deps.print({ ...viaProof(ctx.base), target: ctx.target }, ctx.env)
    },
    {
      id: 'print-page',
      label: 'Print the page',
      description: 'Everything, as one job',
      icon: 'printer',
      group: GROUPS.print,
      keys: 'mod+p',
      tone: 'primary',
      keywords: ['all', 'whole', 'document'],
      run: (ctx) => deps.print({ ...viaProof(ctx.base), target: 'body' }, ctx.env)
    },
    {
      id: 'settings',
      label: 'Print settings…',
      description: 'Paper, margins, page numbers, borders, watermark',
      icon: 'settings',
      group: GROUPS.print,
      keys: 'mod+shift+p',
      keywords: ['options', 'paper', 'a4', 'letter', 'margin', 'configure'],
      run: (ctx) => printDialog(deps, { ...ctx.base, target: aim(ctx) }, ctx.env)
    },

    /* choosing ------------------------------------------------------------ */
    {
      id: 'pick',
      label: 'Pick sections…',
      description: 'Click several, then print them together',
      icon: 'marquee',
      group: GROUPS.choose,
      keywords: ['multiple', 'several', 'choose', 'select'],
      run: (ctx) => pickSections(deps, ctx.base, ctx.env)
    },
    {
      id: 'draw',
      label: 'Draw a print area…',
      description: 'Drag a rectangle; only that region prints',
      icon: 'crop',
      group: GROUPS.choose,
      keys: 'mod+shift+d',
      keywords: ['region', 'crop', 'rectangle', 'area', 'capture'],
      run: (ctx) =>
        drawArea(
          deps,
          { ...ctx.base, ...(ctx.registry ? { registry: ctx.registry } : {}) },
          ctx.env
        )
    },

    /* marking up ---------------------------------------------------------- */
    {
      id: 'redact',
      label: 'Redact this element',
      description: 'Blacks it out destructively, on paper only',
      icon: 'redact',
      group: GROUPS.mark,
      tone: 'danger',
      keywords: ['hide', 'censor', 'black', 'classified'],
      when: (ctx) => (ctx.target ? true : 'Right-click an element to redact it'),
      checked: (ctx) => !!ctx.target?.hasAttribute('data-printcraft-redact'),
      run: (ctx) => {
        if (!ctx.target) return;
        const on = toggleRedact(ctx.target);
        deps.emit('ui:redact', { element: ctx.target, redacted: on });
        toast(
          {
            message: on ? 'Marked for redaction' : 'Redaction removed',
            tone: on ? 'warn' : 'default',
            action: {
              label: 'Undo',
              onSelect: () => {
                toggleRedact(ctx.target!);
                deps.emit('ui:redact', { element: ctx.target, redacted: !on });
              }
            }
          },
          ctx.env
        );
        return on;
      }
    },
    {
      id: 'redact-area',
      label: 'Redact by dragging…',
      description: 'Destroys the characters a box covers, not the whole element',
      icon: 'marquee',
      group: GROUPS.mark,
      tone: 'danger',
      keys: 'mod+shift+r',
      keywords: ['censor', 'black', 'classified', 'foia', 'region'],
      run: (ctx) => redactArea(deps, { ...ctx.base }, ctx.env)
    },
    {
      id: 'note',
      label: 'Add a note…',
      description: 'A chip printed beside this element',
      icon: 'note',
      group: GROUPS.mark,
      keywords: ['annotate', 'comment', 'markup', 'label'],
      when: (ctx) => (ctx.target ? true : 'Right-click an element to note it'),
      run: (ctx) => {
        if (!ctx.target) return;
        return askForNote(ctx.target, ctx.env).then((text) => {
          if (text == null) return;
          deps.emit('ui:annotate', { element: ctx.target, text });
          toast({ message: text ? 'Note attached' : 'Note removed', tone: 'success' }, ctx.env);
        });
      }
    },
    {
      // `annotate`, not `draw`: `draw` is the region tool, and registering a
      // second action under that id silently replaced it — the registry keys by
      // id and the later one wins. The name is also the honest one: this is not
      // "draw", it is pen, highlighter, shapes and text.
      id: 'annotate',
      label: 'Annotate the page…',
      description: 'Pen, highlighter, arrows, boxes and text, printed with it',
      icon: 'draw',
      group: GROUPS.mark,
      keys: 'mod+shift+a',
      keywords: ['draw', 'annotate', 'markup', 'pen', 'highlight', 'arrow', 'circle', 'sketch'],
      run: (ctx) => {
        // loaded on demand: the studio is the largest thing the ui layer can
        // reach, and most pages never draw on anything
        return import('../annotate').then(({ openStudio }) => {
          const studio = openStudio(ctx.env, {
            onChange: (element, drawing) =>
              deps.emit('ui:draw', { element, shapes: drawing.shapes.length })
          });
          deps.emit('ui:draw', { opened: true });
          return studio;
        });
      }
    },
    /* the drawn rectangle -------------------------------------------------
     *
     * Scoped to `region`, so they appear when a selection is right-clicked and
     * nowhere else. They reach the live tool through `activeRegion()` rather
     * than a closure, which is what lets them be registered actions at boot and
     * still act on a selection made twenty minutes later.
     */
    {
      id: 'region-print',
      label: 'Print this area',
      description: 'Go on to the title and the preview',
      icon: 'printer',
      group: GROUPS.print,
      scope: ['region'],
      tone: 'primary',
      keywords: ['area', 'region', 'selection', 'continue'],
      when: (ctx) => hasRegion(ctx.env.document) || 'Draw an area first',
      run: (ctx) => activeRegion(ctx.env.document)?.confirm()
    },
    {
      id: 'region-reset',
      label: 'Start this area over',
      description: 'Throw the rectangle away and draw again',
      icon: 'crop',
      group: GROUPS.choose,
      scope: ['region'],
      when: (ctx) => hasRegion(ctx.env.document) || 'Draw an area first',
      run: (ctx) => activeRegion(ctx.env.document)?.reset()
    },
    {
      id: 'region-cancel',
      label: 'Cancel the selection',
      description: 'Put the page back and print nothing',
      icon: 'close',
      group: GROUPS.choose,
      scope: ['region'],
      when: (ctx) => hasRegion(ctx.env.document) || 'Nothing is selected',
      run: (ctx) => activeRegion(ctx.env.document)?.cancel()
    },

    {
      id: 'notes',
      label: 'All notes and redactions…',
      description: 'Everything marked on this page, in one list',
      icon: 'pages',
      group: GROUPS.mark,
      keys: 'mod+shift+n',
      keywords: ['annotations', 'review', 'list', 'marks'],
      when: (ctx) => {
        const marks = markCount(ctx.env.document);
        const total = marks.notes + marks.redactions;
        return total ? true : 'Nothing is marked on this page yet';
      },
      run: (ctx) => notesPanel(deps, { base: ctx.base }, ctx.env)
    },

    /* inspecting ---------------------------------------------------------- */
    {
      id: 'inspect',
      label: 'Preview the print',
      description: 'Opens the assembled document, no dialog',
      icon: 'inspect',
      group: GROUPS.inspect,
      keys: 'mod+shift+i',
      keywords: ['preview', 'check', 'proof', 'look'],
      run: (ctx) => deps.inspect({ ...ctx.base, target: aim(ctx) }, ctx.env)
    }
  ];
}

/** How many things are marked on the page right now, for a badge. */
export function markCount(doc: Document): { notes: number; redactions: number } {
  return {
    notes: annotations(doc).length,
    redactions: doc.querySelectorAll('[data-printcraft-redact]').length
  };
}
