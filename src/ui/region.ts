// The selection that is open right now.
//
// A drawn rectangle is an *activity*, not an element: while it is up, a handful
// of actions mean something they never mean otherwise — print this area, capture
// it, redact inside it, start the rectangle again. Those want to be registered
// actions like everything else, so they appear in the palette, can carry a
// keybinding, and can be removed or replaced by a host.
//
// Registered actions live in a catalogue built once at boot, and the controls
// they need are closures inside whichever region tool happens to be running. So
// the tool publishes itself here for as long as it is open, and the actions ask.
// One at a time, because two selections at once is not a thing.
//
// Redacting inside the rectangle is deliberately not here. The region tool turns
// a rectangle into `redactRuns`, which is an option on the job it is about to
// start rather than a mark on the page — so a "redact this area" that ran before
// the job existed would have nowhere to put its answer. `redactArea` is the tool
// that owns that flow.

import type { ClipRect } from '../types';

export interface RegionSession {
  /** the selection in page coordinates */
  rect(): ClipRect;
  /** the same in viewport coordinates, which is what a menu anchors to */
  viewportBox(): { x: number; y: number; w: number; h: number };
  /** go on to the confirm step, exactly as the toolbar's button does */
  confirm(): void;
  /** throw the rectangle away and start again, keeping the tool open */
  reset(): void;
  /** put everything back and print nothing */
  cancel(): void;
  /**
   * Takes our own furniture off the page, and puts it back.
   *
   * A capture of the region would otherwise contain the dimming shades, the
   * frame and eight white handles. The actions that photograph the page call
   * this around themselves rather than each knowing what the overlay is made of.
   */
  hide(): void;
  show(): void;
}

let active: RegionSession | null = null;

/** The open selection, or null. */
export function activeRegion(): RegionSession | null {
  return active;
}

/** Publishes a session. Returns the function that takes it down again. */
export function holdRegion(session: RegionSession): () => void {
  active = session;
  return () => {
    if (active === session) active = null;
  };
}

/** Whether an action that needs a live selection has one. */
export function hasRegion(): boolean {
  return !!active;
}
