// language-level helpers. nothing here touches the dom.

export function assign<T extends object>(out: T, ...rest: (object | null | undefined)[]): T {
  for (const src of rest) {
    if (!src) continue;
    for (const k in src) {
      if (Object.prototype.hasOwnProperty.call(src, k)) {
        (out as Record<string, unknown>)[k] = (src as Record<string, unknown>)[k];
      }
    }
  }
  return out;
}

/** clamps to a range, falling back to `lo` for anything non-numeric. */
export function clamp(n: unknown, lo: number, hi: number): number {
  const v = Number(n);
  if (isNaN(v)) return lo;
  return Math.min(hi, Math.max(lo, v));
}

/** every error printcraft throws is prefixed, so its origin is never in doubt. */
export function raise(msg: string): never {
  throw new Error('Printcraft: ' + msg);
}

/** high-resolution when available, wall clock otherwise. */
export function now(): number {
  try {
    if (typeof performance !== 'undefined' && performance.now) return performance.now();
  } catch {
    /* fall through */
  }
  return Date.now();
}

export function camelize(kebab: string): string {
  return kebab.replace(/-([a-z0-9])/g, (_m, c: string) => c.toUpperCase());
}
