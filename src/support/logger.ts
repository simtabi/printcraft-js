// the namespaced debug logger and the flag that decides whether it says anything.

import { NS } from './constants';
import type { Logger } from '../types';

export const debugState = { enabled: false, resolved: false };

/** resolves the debug flag once per page, from the url or from localStorage. */
export function detectDebug(win: Window | null | undefined): boolean {
  if (debugState.resolved) return debugState.enabled;
  debugState.resolved = true;
  try {
    if (win?.location && /[?&#]printcraft-debug\b/.test(win.location.href))
      debugState.enabled = true;
  } catch {
    /* noop */
  }
  try {
    if (win?.localStorage && win.localStorage.getItem('printcraft:debug') === '1')
      debugState.enabled = true;
  } catch {
    /* noop */
  }
  return debugState.enabled;
}

/** an inert logger when `active` is false: no formatting cost, no console noise. */
export function makeLogger(active: boolean, jobId?: number): Logger {
  const prefix = '[' + NS + (jobId ? '#' + jobId : '') + ']';

  const out = (method: 'log' | 'info' | 'warn' | 'error', args: unknown[]): void => {
    if (!active) return;
    try {
      (console[method] as (...a: unknown[]) => void).apply(console, [prefix, ...args]);
    } catch {
      /* noop */
    }
  };

  return {
    active,
    debug: (...args: unknown[]) => out('log', args),
    info: (...args: unknown[]) => out('info', args),
    warn: (...args: unknown[]) => out('warn', args),
    error: (...args: unknown[]) => out('error', args),
    group(label: string) {
      if (active) {
        try {
          console.groupCollapsed(prefix + ' ' + label);
        } catch {
          /* noop */
        }
      }
    },
    groupEnd() {
      if (active) {
        try {
          console.groupEnd();
        } catch {
          /* noop */
        }
      }
    },
    table(data: unknown) {
      if (active) {
        try {
          console.table(data);
        } catch {
          out('log', [data]);
        }
      }
    }
  };
}
