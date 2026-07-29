// Parsing the command line.
//
// A schema rather than a switch, so `--help` is generated from the same thing
// that validates, and the two cannot drift apart. Small enough not to warrant a
// dependency, and strict enough to catch a typo instead of silently ignoring it.

export interface FlagSpec {
  type: 'string' | 'boolean' | 'number';
  short?: string;
  describe: string;
  /** shown in --help after the flag name, e.g. `--margin <length>` */
  arg?: string;
  default?: string | boolean | number;
}

export interface CommandSpec {
  describe: string;
  /** positional arguments, in order */
  positional?: Array<{ name: string; describe: string; required?: boolean }>;
  flags: Record<string, FlagSpec>;
  examples?: string[];
}

export interface Parsed {
  command: string | null;
  positional: string[];
  flags: Record<string, string | boolean | number>;
  /** flags that were not in the schema */
  unknown: string[];
}

/**
 * Reads argv against a command's schema.
 *
 * Unknown flags are collected rather than thrown, so the caller can print them
 * all at once with suggestions instead of failing on the first.
 */
export function parse(argv: string[], spec: CommandSpec | null): Parsed {
  const flags: Record<string, string | boolean | number> = {};
  const positional: string[] = [];
  const unknown: string[] = [];

  const byShort = new Map<string, string>();
  for (const [name, f] of Object.entries(spec?.flags || {})) {
    if (f.short) byShort.set(f.short, name);
    if (f.default !== undefined) flags[name] = f.default;
  }

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;

    if (token === '--') {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (token[0] !== '-') {
      positional.push(token);
      continue;
    }

    // --flag=value and -f value both reach the same place
    const long = token.startsWith('--');
    const body = token.slice(long ? 2 : 1);
    const eq = body.indexOf('=');
    const rawName = eq === -1 ? body : body.slice(0, eq);
    const inline = eq === -1 ? null : body.slice(eq + 1);

    const name = long ? rawName : byShort.get(rawName) || rawName;
    const definition = spec?.flags[name];

    if (!definition) {
      unknown.push(token);
      // an unknown flag's value must not be read as a positional argument
      if (inline === null && argv[i + 1] && argv[i + 1]![0] !== '-') i++;
      continue;
    }

    if (definition.type === 'boolean') {
      flags[name] = inline === null ? true : inline !== 'false' && inline !== '0';
      continue;
    }

    const value = inline === null ? argv[++i] : inline;
    if (value === undefined) {
      flags[name] = definition.type === 'number' ? NaN : '';
      continue;
    }
    flags[name] = definition.type === 'number' ? Number(value) : value;
  }

  return { command: null, positional, flags, unknown };
}

/** The closest known flag to a typo, for "did you mean". */
export function nearest(typo: string, known: string[]): string | null {
  const bare = typo.replace(/^--?/, '');
  let best: string | null = null;
  let bestScore = Infinity;

  for (const candidate of known) {
    const score = distance(bare, candidate);
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  // beyond a third of the word, a suggestion is noise rather than help
  return best && bestScore <= Math.max(2, Math.floor(bare.length / 3)) ? best : null;
}

function distance(a: string, b: string): number {
  const rows: number[][] = [];
  for (let i = 0; i <= a.length; i++) rows[i] = [i];
  for (let j = 0; j <= b.length; j++) rows[0]![j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      rows[i]![j] = Math.min(
        rows[i - 1]![j]! + 1,
        rows[i]![j - 1]! + 1,
        rows[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return rows[a.length]![b.length]!;
}
