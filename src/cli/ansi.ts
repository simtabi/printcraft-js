// Colour, without a dependency.
//
// picocolors is 6 kB and does this well, but the CLI is the one place in this
// repo where keeping the zero-dependency rule costs nothing: it is fifteen
// escape sequences and one capability check.

const ESC = '[';

const NO_COLOR = !!process.env['NO_COLOR'];
const FORCE = process.env['FORCE_COLOR'] === '1' || process.env['FORCE_COLOR'] === 'true';

/**
 * Whether to emit escapes at all.
 *
 * A pipe or a CI log is not a terminal, and colouring one leaves escape codes in
 * whatever reads the output next.
 */
export const supported: boolean =
  FORCE || (!NO_COLOR && !!process.stdout.isTTY && process.env['TERM'] !== 'dumb');

function wrap(open: number, close: number): (s: string) => string {
  const prefix = ESC + open + 'm';
  const suffix = ESC + close + 'm';
  return (s: string) => (supported ? prefix + s + suffix : s);
}

export const bold = wrap(1, 22);
export const dim = wrap(2, 22);
export const red = wrap(31, 39);
export const green = wrap(32, 39);
export const yellow = wrap(33, 39);
export const blue = wrap(34, 39);
export const magenta = wrap(35, 39);
export const cyan = wrap(36, 39);
export const grey = wrap(90, 39);

const ESCAPES = new RegExp(ESC.replace('[', '\\[') + '\\d+m', 'g');

/** Visible width, so padding lines up whether or not colour is on. */
export function width(s: string): number {
  return s.replace(ESCAPES, '').length;
}

export function pad(s: string, to: number): string {
  return s + ' '.repeat(Math.max(0, to - width(s)));
}

/** A table with aligned columns and a rule under the head. */
export function table(head: string[], rows: string[][]): string {
  const all = [head, ...rows];
  const widths = head.map((_, i) => Math.max(...all.map((r) => width(r[i] || ''))));
  const line = (cells: string[]): string =>
    cells
      .map((c, i) => pad(c, widths[i]!))
      .join('  ')
      .trimEnd();

  return [
    bold(line(head)),
    grey(widths.map((w) => '─'.repeat(w)).join('  ')),
    ...rows.map(line)
  ].join('\n');
}

/** `1.2s` reads better than `1234ms` past a second. */
export function duration(ms: number): string {
  return ms >= 1000 ? (ms / 1000).toFixed(1) + 's' : Math.round(ms) + 'ms';
}
