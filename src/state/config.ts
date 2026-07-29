// Where configuration comes from, and which layer won.
//
// A page can be configured five ways, and until now the only answer to "why is
// this margin 18mm" was to read all five. So the layers are named, the order is
// fixed, and `explain()` will tell you which one set each value.
//
// The order runs from least to most specific, and the reasoning is that the
// further from the code a setting lives, the more deliberate it is: shipped
// defaults are a guess, a server knows the deployment, and options passed at the
// call site are about this one job.

import { PrintcraftError } from '../support/errors';
import type { Store } from './store';

/** Named in the order they are applied. Later wins. */
export const LAYERS = ['defaults', 'backend', 'file', 'attribute', 'session', 'call'] as const;

export type Layer = (typeof LAYERS)[number];

export type ConfigValues = Record<string, unknown>;

/** Which layer set each key. */
export type Provenance = Record<string, Layer>;

export interface ResolvedConfig {
  values: ConfigValues;
  from: Provenance;
  /** what each layer contributed, for a devtools panel */
  layers: Partial<Record<Layer, ConfigValues>>;
}

/**
 * Anything that can supply configuration.
 *
 * A plain object, a url to fetch, a function to call, or a store to read. The
 * function form is the one that matters for an app with its own settings screen:
 * it can hand over whatever it already has without writing it anywhere first.
 */
export type ConfigSource =
  | ConfigValues
  | string
  | (() => ConfigValues | Promise<ConfigValues>)
  | { store: Store; key?: string };

function isPlainObject(value: unknown): value is ConfigValues {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Reads one source, whatever shape it is. */
export async function readSource(
  source: ConfigSource,
  fetchImpl?: typeof fetch
): Promise<ConfigValues> {
  if (typeof source === 'string') {
    const call = fetchImpl ?? (typeof fetch === 'function' ? fetch : null);
    if (!call) {
      throw new PrintcraftError('PC_CONFIG_UNREACHABLE', 'no fetch to read ' + source + ' with', {
        context: { url: source }
      });
    }

    let res: Response;
    try {
      res = await call(source);
    } catch (cause) {
      throw new PrintcraftError('PC_CONFIG_UNREACHABLE', 'could not reach ' + source, {
        context: { url: source },
        cause
      });
    }
    if (!res.ok) {
      throw new PrintcraftError('PC_CONFIG_UNREACHABLE', source + ' answered ' + res.status, {
        context: { url: source, status: res.status }
      });
    }

    const body: unknown = await res.json();
    if (!isPlainObject(body)) {
      throw new PrintcraftError('PC_CONFIG_INVALID', source + ' is not a json object', {
        context: { url: source }
      });
    }
    return body;
  }

  if (typeof source === 'function') {
    const value = await source();
    if (!isPlainObject(value)) {
      throw new PrintcraftError('PC_CONFIG_INVALID', 'the config function returned no object');
    }
    return value;
  }

  if (isPlainObject(source) && 'store' in source && source['store']) {
    const spec = source as { store: Store; key?: string };
    const value = await spec.store.get<ConfigValues>(spec.key || 'config');
    return isPlainObject(value) ? value : {};
  }

  if (!isPlainObject(source)) {
    throw new PrintcraftError('PC_CONFIG_INVALID', 'a config source has to be an object');
  }
  return source;
}

/**
 * Flattens the layers into one set of values, remembering where each came from.
 *
 * A layer that throws does not take the resolution down with it. A config server
 * being unreachable should degrade to the shipped defaults and say so in the
 * log, not stop the page printing.
 */
export async function resolveConfig(
  sources: Partial<Record<Layer, ConfigSource | undefined>>,
  options: { fetch?: typeof fetch; onError?: (layer: Layer, error: unknown) => void } = {}
): Promise<ResolvedConfig> {
  const out: ResolvedConfig = { values: {}, from: {}, layers: {} };

  for (const layer of LAYERS) {
    const source = sources[layer];
    if (source === undefined) continue;

    let values: ConfigValues;
    try {
      // sequential on purpose: a later layer overwrites an earlier one, so the
      // order they resolve in is the whole meaning of the result
      // oxlint-disable-next-line no-await-in-loop
      values = await readSource(source, options.fetch);
    } catch (error) {
      options.onError?.(layer, error);
      continue;
    }

    out.layers[layer] = values;
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) continue;
      out.values[key] = value;
      out.from[key] = layer;
    }
  }
  return out;
}

/** A line per setting, saying what it is and who set it. Meant to be read. */
export function explain(config: ResolvedConfig): string[] {
  const keys = Object.keys(config.values);
  // sorted in place: a fresh array from Object.keys, alphabetical so the list
  // reads the same way twice
  // oxlint-disable-next-line no-array-sort
  keys.sort();

  return keys.map((key) => {
    const value = config.values[key];
    const shown = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return key + ' = ' + shown + '  (' + (config.from[key] || 'defaults') + ')';
  });
}
