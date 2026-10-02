// Where remembered things go.
//
// One interface, several backings. The library never touches `localStorage`
// directly, because the interesting deployments do not want it there: an app
// with its own user record wants marks in a database, a kiosk wants them
// nowhere, and a companion service wants them alongside the print queue.
//
// Every method is async even where the backing is not. `localStorage` is
// synchronous and `fetch` is not, and a caller that has to know which it got
// would have to be written twice.

import { PrintcraftError } from '../support/errors';

export interface Store {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  /** every key this store holds, already stripped of the prefix */
  keys(): Promise<string[]>;
  /** removes everything this store owns, and nothing it does not */
  clear(): Promise<void>;
  /** shown in logs and errors */
  readonly name: string;
}

export interface WebStoreOptions {
  /** namespaces the keys, so two apps on one origin do not collide */
  prefix?: string;
  /** milliseconds after which a record is treated as absent */
  ttl?: number;
  /** how many records to keep. the oldest go first. */
  limit?: number;
}

interface Envelope<T> {
  /** the schema version, so a later release can migrate rather than throw */
  v: number;
  /** when it was written, for ttl and for eviction order */
  t: number;
  d: T;
}

export const SCHEMA_VERSION = 1;

const DEFAULT_PREFIX = 'printcraft:';

/* memory ------------------------------------------------------------------ */

/**
 * Remembers nothing past the page.
 *
 * The default, deliberately. Writing a user's redactions to their browser
 * without being asked is not a thing to do by accident.
 */
export function memoryStore(): Store {
  const map = new Map<string, unknown>();
  return {
    name: 'memory',
    get: <T>(k: string) => Promise.resolve((map.get(k) as T) ?? null),
    set: <T>(k: string, v: T) => {
      map.set(k, v);
      return Promise.resolve();
    },
    remove: (k: string) => {
      map.delete(k);
      return Promise.resolve();
    },
    keys: () => Promise.resolve([...map.keys()]),
    clear: () => {
      map.clear();
      return Promise.resolve();
    }
  };
}

/* the browser's own ------------------------------------------------------- */

/**
 * Wraps a `Storage` object, which is what `localStorage` and `sessionStorage`
 * both are.
 *
 * Quota is the thing worth handling. A page that has filled its origin's
 * allowance throws on the next write, and a print tool should not be the reason
 * an app falls over. So a failed write evicts the oldest records this store owns
 * and tries once more; if it still will not fit, the caller is told, because
 * silently not saving is worse than saying so.
 */
function fromStorage(backing: Storage, label: string, options: WebStoreOptions = {}): Store {
  const prefix = options.prefix ?? DEFAULT_PREFIX;
  const full = (k: string): string => prefix + k;

  const own = (): string[] => {
    const out: string[] = [];
    for (let i = 0; i < backing.length; i++) {
      const k = backing.key(i);
      if (k && k.startsWith(prefix)) out.push(k);
    }
    return out;
  };

  const readAt = <T>(fullKey: string): Envelope<T> | null => {
    const raw = backing.getItem(fullKey);
    if (raw == null) return null;
    try {
      const env = JSON.parse(raw) as Envelope<T>;
      if (!env || typeof env !== 'object' || !('d' in env)) return null;
      // written by a newer build in a shape this one does not know. absent to
      // us, but left in place: that build still owns it
      if (typeof env.v === 'number' && env.v > SCHEMA_VERSION) return null;
      if (options.ttl && Date.now() - env.t > options.ttl) {
        backing.removeItem(fullKey);
        return null;
      }
      return env;
    } catch {
      // a record we cannot read is a record we cannot honour. drop it rather
      // than failing every later read on the same key.
      backing.removeItem(fullKey);
      return null;
    }
  };

  /** Drops the oldest records this store owns, or only those in one group. */
  const evict = (count: number, keys = own()): number => {
    const aged = keys.map((k) => ({ k, t: readAt<unknown>(k)?.t ?? 0 }));
    // sorted in place: `aged` is built here and used here
    // oxlint-disable-next-line no-array-sort
    aged.sort((a, b) => a.t - b.t);
    const going = aged.slice(0, count);
    for (const { k } of going) backing.removeItem(k);
    return going.length;
  };

  return {
    name: label,

    get: <T>(k: string) => Promise.resolve(readAt<T>(full(k))?.d ?? null),

    set: <T>(k: string, v: T) => {
      const payload = JSON.stringify({ v: SCHEMA_VERSION, t: Date.now(), d: v } as Envelope<T>);
      try {
        backing.setItem(full(k), payload);
      } catch {
        // out of room, or storage is disabled entirely
        if (!evict(Math.max(1, Math.ceil(own().length / 4)))) {
          return Promise.reject(
            new PrintcraftError('PC_STORE_FULL', label + ' will not accept any more', {
              hint: 'the origin is out of storage. clear it, or pass a different store.',
              context: { key: k, bytes: payload.length }
            })
          );
        }
        try {
          backing.setItem(full(k), payload);
        } catch (cause) {
          return Promise.reject(
            new PrintcraftError('PC_STORE_FULL', label + ' will not accept any more', {
              hint: 'the origin is out of storage. clear it, or pass a different store.',
              context: { key: k, bytes: payload.length },
              cause
            })
          );
        }
      }

      // per page: a key up to its last `|` is the page it belongs to, and the
      // limit is about that page's records, not every page on the origin
      if (options.limit) {
        const group = full(k).slice(0, full(k).lastIndexOf('|') + 1) || prefix;
        const mine = own().filter((o) => o.startsWith(group));
        const over = mine.length - options.limit;
        if (over > 0) evict(over, mine);
      }
      return Promise.resolve();
    },

    remove: (k: string) => {
      backing.removeItem(full(k));
      return Promise.resolve();
    },

    keys: () => Promise.resolve(own().map((k) => k.slice(prefix.length))),

    clear: () => {
      // only ours. clearing the whole origin would take the host app's data too.
      for (const k of own()) backing.removeItem(k);
      return Promise.resolve();
    }
  };
}

/** Reaches a `Storage` object, or explains why it cannot. */
function storageOn(win: Window | undefined, which: 'localStorage' | 'sessionStorage'): Storage {
  const scope = win ?? (typeof window === 'undefined' ? undefined : window);
  const backing = scope?.[which];
  if (!backing) {
    throw new PrintcraftError('PC_NO_STORAGE', which + ' is not available here', {
      hint: 'private mode, a sandboxed frame or a blocked origin. use memoryStore() instead.'
    });
  }
  // present but throwing is the private-browsing case, and it throws on write
  try {
    const probe = '__printcraft_probe__';
    backing.setItem(probe, '1');
    backing.removeItem(probe);
  } catch (cause) {
    throw new PrintcraftError('PC_NO_STORAGE', which + ' is present but refuses writes', {
      hint: 'usually private browsing or a storage-blocking setting.',
      cause
    });
  }
  return backing;
}

/** Survives a reload, and a browser restart. Scoped to the origin. */
export function localStore(options: WebStoreOptions & { window?: Window } = {}): Store {
  return fromStorage(storageOn(options.window, 'localStorage'), 'local', options);
}

/** Survives a reload, and nothing else. Scoped to the tab. */
export function sessionStore(options: WebStoreOptions & { window?: Window } = {}): Store {
  return fromStorage(storageOn(options.window, 'sessionStorage'), 'session', options);
}

/* a backend --------------------------------------------------------------- */

export interface HttpStoreOptions {
  /** the collection. keys are appended: `/state/marks` */
  url: string;
  headers?: Record<string, string>;
  /** swapped in tests, and by hosts that wrap fetch for auth */
  fetch?: typeof fetch;
  /** sent with every request. `include` is what a cookie session needs. */
  credentials?: RequestCredentials;
  /**
   * Namespaces the keys, so `keys()` and `clear()` cover only what this store
   * wrote. Without one, `clear()` refuses unless told `{ all: true }`: the
   * collection is usually every page's state for a user.
   */
  prefix?: string;
}

/**
 * Keeps state on a server.
 *
 * `GET` reads, `PUT` writes, `DELETE` removes, and `GET` on the collection
 * itself lists. That is deliberately the plainest REST that could work: the
 * point is that a host can implement it in an afternoon in any language, not
 * that it is clever.
 *
 * Composes with `PrintBackend` rather than duplicating it. A companion service
 * can serve this and accept jobs over the same connection.
 */
export function httpStore(options: HttpStoreOptions): Store {
  const base = options.url.replace(/\/+$/, '');
  const prefix = options.prefix ?? '';
  const at = (k: string): string => '/' + encodeURIComponent(prefix + k);
  const call = options.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));

  const request = async (path: string, init?: RequestInit): Promise<Response> => {
    const res = await call(base + path, {
      ...init,
      credentials: options.credentials,
      headers: { 'content-type': 'application/json', ...options.headers, ...init?.headers }
    });
    // 404 is "nothing stored" for a read or a removal; for a write it means the
    // url is wrong, and treating that as success would lose every save silently
    const method = init?.method || 'GET';
    if (!res.ok && (res.status !== 404 || method === 'PUT')) {
      throw new PrintcraftError('PC_STORE_FAILED', 'the state service answered ' + res.status, {
        hint: 'check the url, the method it allows, and its cors headers.',
        context: { url: base + path, status: res.status }
      });
    }
    return res;
  };

  return {
    name: 'http',

    async get<T>(k: string): Promise<T | null> {
      const res = await request(at(k));
      if (res.status === 404) return null;
      try {
        return (await res.json()) as T;
      } catch {
        return null;
      }
    },

    async set<T>(k: string, v: T): Promise<void> {
      await request(at(k), { method: 'PUT', body: JSON.stringify(v) });
    },

    async remove(k: string): Promise<void> {
      await request(at(k), { method: 'DELETE' });
    },

    async keys(): Promise<string[]> {
      const res = await request('');
      if (res.status === 404) return [];
      try {
        const body = (await res.json()) as unknown;
        return Array.isArray(body)
          ? body
              .map(String)
              .filter((k) => k.startsWith(prefix))
              .map((k) => k.slice(prefix.length))
          : [];
      } catch {
        return [];
      }
    },

    /**
     * Removes this store's keys, one at a time. Emptying the collection itself
     * takes `{ all: true }`, because it is usually more than this store wrote.
     */
    async clear(opts?: { all?: boolean }): Promise<void> {
      if (opts?.all) return void (await request('', { method: 'DELETE' }));
      if (!prefix) {
        throw new PrintcraftError('PC_STORE_FAILED', 'refusing to empty the whole collection', {
          hint: 'give httpStore a prefix, or call clear({ all: true }) if that is what you mean.'
        });
      }
      for (const k of await this.keys()) await this.remove(k);
    }
  };
}

/* anything else ----------------------------------------------------------- */

export interface CustomStoreSpec {
  name?: string;
  get(key: string): unknown | Promise<unknown>;
  set(key: string, value: unknown): void | Promise<void>;
  remove?(key: string): void | Promise<void>;
  keys?(): string[] | Promise<string[]>;
  clear?(): void | Promise<void>;
}

/**
 * Turns two functions into a store.
 *
 * The escape hatch: IndexedDB, a Vuex module, a React context, an Electron
 * main-process bridge. Only `get` and `set` are required, because the rest can
 * be reasonably absent and the panel that lists everything degrades to saying
 * so rather than breaking.
 */
export function customStore(spec: CustomStoreSpec): Store {
  return {
    name: spec.name || 'custom',
    get: async <T>(k: string) => ((await spec.get(k)) as T) ?? null,
    set: async <T>(k: string, v: T) => void (await spec.set(k, v)),
    remove: async (k: string) => void (await spec.remove?.(k)),
    keys: async () => (await spec.keys?.()) ?? [],
    clear: async () => void (await spec.clear?.())
  };
}

/** What `persist: true` means: the browser's own, under our prefix. */
export function defaultStore(win?: Window): Store {
  try {
    return localStore({ window: win });
  } catch {
    // private mode, a sandboxed frame, or storage switched off. remembering
    // nothing is the right answer there, and it is not worth an exception.
    return memoryStore();
  }
}
