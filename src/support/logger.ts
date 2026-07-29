// Logging, with levels, a buffer, and somewhere to send it.
//
// The old logger was a console wrapper behind one boolean. That is fine while
// you are the only person debugging it, and useless the moment a print fails on
// somebody else's machine — nobody can reproduce a printer.
//
// So records are structured rather than formatted, kept in a ring buffer whether
// or not anything is listening, and handed to whatever sinks are attached. When
// a support ticket says "it printed blank", `Printcraft.logger.export()` is the
// answer, and it works without the user having had debug on beforehand.

import { NS } from './constants';
import { now } from './lang';
import type { Logger } from '../types';

export const LEVELS = ['silent', 'error', 'warn', 'info', 'debug', 'trace'] as const;
export type LogLevel = (typeof LEVELS)[number];

const RANK: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  trace: 5
};

export interface LogRecord {
  /** milliseconds since the library loaded */
  ts: number;
  level: Exclude<LogLevel, 'silent'>;
  /** which part of the library spoke */
  ns: string;
  jobId?: number;
  msg: string;
  data?: unknown[];
}

export type LogSink = (record: LogRecord) => void;

export const debugState = { enabled: false, resolved: false };

/** resolves the debug flag once per page, from the url or from localStorage. */
export function detectDebug(win: Window | null | undefined): boolean {
  if (debugState.resolved) return debugState.enabled;
  debugState.resolved = true;
  try {
    if (win?.location && /[?&#]printcraft-debug\b/.test(win.location.href)) {
      debugState.enabled = true;
    }
  } catch {
    /* a cross-origin location is not worth failing over */
  }
  try {
    if (win?.localStorage && win.localStorage.getItem('printcraft:debug') === '1') {
      debugState.enabled = true;
    }
  } catch {
    /* storage can be disabled outright */
  }
  return debugState.enabled;
}

/* the shared state ------------------------------------------------------- */

const BUFFER_SIZE = 500;

const state: {
  level: LogLevel;
  buffer: LogRecord[];
  sinks: LogSink[];
} = {
  level: 'silent',
  buffer: [],
  sinks: []
};

const started = now();

/** Best-effort stringify: a circular payload must not break the log. */
function safeJoin(data: unknown[]): string {
  return data
    .map((d) => {
      if (typeof d === 'string') return d;
      try {
        return JSON.stringify(d);
      } catch {
        return String(d);
      }
    })
    .join(' ');
}

function write(
  level: Exclude<LogLevel, 'silent'>,
  ns: string,
  jobId: number | undefined,
  args: unknown[],
  toConsole: boolean
): void {
  const [first, ...rest] = args;
  const entry: LogRecord = {
    ts: Math.round(now() - started),
    level,
    ns,
    msg: typeof first === 'string' ? first : safeJoin([first]),
    ...(jobId === undefined ? {} : { jobId }),
    ...(rest.length ? { data: rest } : {})
  };

  // the buffer fills whatever the level is, so a failure that happened before
  // anybody turned logging up is still there to look at afterwards
  state.buffer.push(entry);
  if (state.buffer.length > BUFFER_SIZE) state.buffer.shift();

  for (const sink of state.sinks) {
    try {
      sink(entry);
    } catch {
      // a broken sink must not take the job down with it
    }
  }

  if (!toConsole && RANK[level] > RANK[state.level]) return;
  const method = level === 'trace' || level === 'debug' ? 'log' : level;
  try {
    (console[method] as (...a: unknown[]) => void).apply(console, [
      '[' + ns + (jobId ? '#' + jobId : '') + ']',
      ...args
    ]);
  } catch {
    /* a console that refuses is not a reason to fail a print */
  }
}

/** The public controls, exposed as `Printcraft.logger`. */
export const logger = {
  /**
   * Nothing below this reaches the console. The buffer keeps everything either
   * way, which is what makes `export()` useful after the fact.
   */
  level(next?: LogLevel): LogLevel {
    if (next && LEVELS.indexOf(next) !== -1) state.level = next;
    return state.level;
  },

  /** Send every record somewhere as well. Returns a function that detaches it. */
  sink(fn: LogSink): () => void {
    state.sinks.push(fn);
    return function detach(): void {
      const at = state.sinks.indexOf(fn);
      if (at !== -1) state.sinks.splice(at, 1);
    };
  },

  /** Everything buffered, oldest first. Copied, so a caller cannot corrupt it. */
  export(): LogRecord[] {
    return state.buffer.slice();
  },

  /** The buffer as text, for pasting into an issue. */
  toText(): string {
    return state.buffer
      .map((r) => {
        const where = r.ns + (r.jobId ? '#' + r.jobId : '');
        const extra = r.data?.length ? ' ' + safeJoin(r.data) : '';
        return r.ts + 'ms ' + r.level.toUpperCase().padEnd(5) + ' [' + where + '] ' + r.msg + extra;
      })
      .join('\n');
  },

  clear(): void {
    state.buffer.length = 0;
  }
};

/**
 * A logger for one namespace, and optionally one job.
 *
 * `active` keeps the per-job debug flag working: it puts that job's records on
 * the console whatever the global level is. Everything is buffered regardless.
 */
export function makeLogger(active: boolean, jobId?: number, ns: string = NS): Logger {
  const speak =
    (level: Exclude<LogLevel, 'silent'>) =>
    (...args: unknown[]): void =>
      write(level, ns, jobId, args, active);

  const shows = (level: Exclude<LogLevel, 'silent'>): boolean =>
    active || RANK[state.level] >= RANK[level];

  return {
    active,
    trace: speak('trace'),
    debug: speak('debug'),
    info: speak('info'),
    warn: speak('warn'),
    error: speak('error'),

    group(label: string) {
      // buffered whatever the level: this is where the job summary lives, and
      // an exported log without it is missing the line that says what ran
      write('debug', ns, jobId, [label], false);
      if (!shows('debug')) return;
      try {
        console.groupCollapsed('[' + ns + (jobId ? '#' + jobId : '') + '] ' + label);
      } catch {
        /* noop */
      }
    },
    groupEnd() {
      if (!shows('debug')) return;
      try {
        console.groupEnd();
      } catch {
        /* noop */
      }
    },
    table(data: unknown) {
      write('debug', ns, jobId, ['timings', data], false);
      if (!shows('debug')) return;
      try {
        console.table(data);
      } catch {
        /* noop */
      }
    }
  };
}
