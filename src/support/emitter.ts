// the tiny pub/sub behind instance events and the global bus.

import { NS } from './constants';

type AnyListener = ((payload: never) => unknown) & { _orig?: unknown };

/**
 * `emit` collects listener return values rather than discarding them, so callers
 * can treat a `false` anywhere in the chain as "cancel".
 */
export class Emitter {
  private _ev: Record<string, AnyListener[]> = Object.create(null) as Record<string, AnyListener[]>;

  on(name: string, fn: unknown): this {
    if (typeof fn !== 'function') return this;
    (this._ev[name] || (this._ev[name] = [])).push(fn as AnyListener);
    return this;
  }

  /**
   * removes one listener, every listener for a name, or all of them. a listener
   * registered through `once` is matched by its original function too, so
   * `off(name, fn)` reliably undoes `once(name, fn)`.
   */
  off(name?: string, fn?: unknown): this {
    if (!name) {
      this._ev = Object.create(null) as Record<string, AnyListener[]>;
      return this;
    }
    const list = this._ev[name];
    if (!list) return this;
    if (!fn) {
      delete this._ev[name];
      return this;
    }
    for (let i = list.length - 1; i >= 0; i--) {
      const candidate = list[i]!;
      if (candidate === fn || candidate._orig === fn) list.splice(i, 1);
    }
    return this;
  }

  once(name: string, fn: unknown): this {
    if (typeof fn !== 'function') return this;
    const detach = this.off.bind(this);
    // a plain function, not an arrow: the wrapper forwards the caller's `this`
    // to the original listener rather than capturing its own
    const wrap = function (this: unknown, payload: never) {
      detach(name, wrap);
      return (fn as (p: never) => unknown).call(this, payload);
    } as AnyListener;
    wrap._orig = fn;
    return this.on(name, wrap);
  }

  emit(name: string, payload?: unknown): unknown[] {
    const list = (this._ev[name] || []).slice();
    const results: unknown[] = [];
    for (const fn of list) {
      try {
        results.push((fn as (p: unknown) => unknown)(payload));
      } catch (e) {
        // one bad listener must not take the rest of the chain down with it
        results.push(undefined);
        try {
          console.error('[' + NS + '] listener for "' + name + '" threw:', e);
        } catch {
          /* noop */
        }
      }
    }
    return results;
  }

  listenerCount(name: string): number {
    return (this._ev[name] || []).length;
  }
}
