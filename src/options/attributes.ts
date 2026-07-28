// the declarative surface: turning `data-printcraft-*` attributes into options.

import { camelize, NS, raise, assign } from '../support';
import type { PrintcraftOptions } from '../types';

/** keys whose value is a list, so a comma in the attribute means "split me". */
const LIST_KEY = /(List|Selectors)$/;

/** turns one attribute string into a boolean, number, null, json value, list, or string. */
export function coerceValue(key: string, raw: string): unknown {
  if (raw === '' || raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);

  const first = raw.charAt(0);
  if (first === '{' || first === '[') {
    try {
      return JSON.parse(raw);
    } catch {
      /* fall through as a string */
    }
  }
  if (LIST_KEY.test(key) && raw.indexOf(',') !== -1) {
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return raw;
}

/**
 * reads options off a trigger element: an optional `data-printcraft-options` json
 * blob first, then individual kebab-cased attributes, which win over the blob.
 */
export function parseDataOptions(el: Element): PrintcraftOptions {
  const opts: Record<string, unknown> = {};
  const attrs = el.attributes;
  const prefix = 'data-' + NS + '-';

  const blob = el.getAttribute('data-' + NS + '-options');
  if (blob) {
    try {
      assign(opts, JSON.parse(blob) as object);
    } catch {
      raise('data-' + NS + '-options is not valid json on <' + el.tagName.toLowerCase() + '>');
    }
  }

  for (let i = 0; i < attrs.length; i++) {
    const name = attrs[i]!.name;
    if (name.indexOf(prefix) !== 0) continue;
    const key = camelize(name.slice(prefix.length));
    if (key === 'options' || key === 'config') continue;
    opts[key] = coerceValue(key, attrs[i]!.value);
  }

  const trig = el.getAttribute('data-' + NS);
  if (trig && !opts['target']) opts['target'] = trig;
  return opts as PrintcraftOptions;
}
