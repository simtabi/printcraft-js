// The command line.
//
// Three commands, and help generated from the same schema that validates, so
// they cannot drift apart. Failures name the flag that caused them and suggest
// the flag that was probably meant.

import { bold, cyan, dim, green, grey, red } from './ansi';
import { nearest, parse, type CommandSpec, type Parsed } from './args';
import { doctor, doctorSpec, init, initSpec, print, printSpec, type Context } from './commands';

const COMMANDS: Record<
  string,
  { spec: CommandSpec; run: (ctx: Context, parsed: Parsed) => Promise<number> }
> = {
  print: { spec: printSpec, run: print },
  doctor: { spec: doctorSpec, run: doctor },
  init: { spec: initSpec, run: init }
};

function usage(ctx: Context, name?: string): void {
  const entry = name ? COMMANDS[name] : null;

  if (!entry) {
    ctx.out();
    ctx.out(bold('printcraft') + ' ' + grey(ctx.version));
    ctx.out(dim('Print exactly what you meant to print.'));
    ctx.out();
    ctx.out(bold('Usage'));
    ctx.out('  printcraft <command> [options]');
    ctx.out();
    ctx.out(bold('Commands'));
    for (const [key, value] of Object.entries(COMMANDS)) {
      ctx.out('  ' + cyan(key.padEnd(9)) + value.spec.describe);
    }
    ctx.out();
    ctx.out(bold('Options'));
    ctx.out('  ' + cyan('--help'.padEnd(11)) + 'This, or help for a command');
    ctx.out('  ' + cyan('--version'.padEnd(11)) + 'Print the version');
    ctx.out();
    ctx.out(grey('  printcraft <command> --help  for what each one takes'));
    ctx.out();
    return;
  }

  const { spec } = entry;
  const positional = (spec.positional || []).map(
    (p) => (p.required ? '<' : '[') + p.name + (p.required ? '>' : ']')
  );

  ctx.out();
  ctx.out(bold('printcraft ' + name) + '  ' + dim(spec.describe));
  ctx.out();
  ctx.out(bold('Usage'));
  ctx.out('  printcraft ' + name + ' ' + positional.join(' ') + ' [options]');
  ctx.out();

  if (spec.positional?.length) {
    ctx.out(bold('Arguments'));
    for (const p of spec.positional) ctx.out('  ' + cyan(p.name.padEnd(20)) + p.describe);
    ctx.out();
  }

  ctx.out(bold('Options'));
  const width = Math.max(
    ...Object.entries(spec.flags).map(
      ([k, f]) => k.length + (f.short ? 4 : 0) + (f.arg ? f.arg.length + 1 : 0) + 2
    )
  );
  for (const [key, flag] of Object.entries(spec.flags)) {
    const label =
      (flag.short ? '-' + flag.short + ', ' : '') + '--' + key + (flag.arg ? ' ' + flag.arg : '');
    const suffix = flag.default !== undefined ? grey('  (' + flag.default + ')') : '';
    ctx.out('  ' + cyan(label.padEnd(width + 2)) + flag.describe + suffix);
  }
  ctx.out();

  if (spec.examples?.length) {
    ctx.out(bold('Examples'));
    for (const example of spec.examples) ctx.out('  ' + dim(example));
    ctx.out();
  }
}

/**
 * Runs one invocation. Returns the exit code rather than calling `process.exit`,
 * so the whole thing is testable without spawning a process.
 */
export async function run(argv: string[], ctx: Context): Promise<number> {
  const [first, ...rest] = argv;

  if (!first || first === '--help' || first === '-h' || first === 'help') {
    usage(ctx, rest[0]);
    return 0;
  }
  if (first === '--version' || first === '-v') {
    ctx.out(ctx.version);
    return 0;
  }

  const entry = COMMANDS[first];
  if (!entry) {
    ctx.out();
    ctx.out(red('There is no "' + first + '" command.'));
    const guess = nearest(first, Object.keys(COMMANDS));
    if (guess) ctx.out(grey('Did you mean ') + cyan('printcraft ' + guess) + grey('?'));
    ctx.out();
    usage(ctx);
    return 1;
  }

  if (rest.includes('--help') || rest.includes('-h')) {
    usage(ctx, first);
    return 0;
  }

  const parsed = parse(rest, entry.spec);
  if (parsed.unknown.length) {
    ctx.out();
    for (const flag of parsed.unknown) {
      const guess = nearest(flag, Object.keys(entry.spec.flags));
      ctx.out(
        red('Unknown option ') +
          bold(flag) +
          (guess ? grey('. Did you mean ') + cyan('--' + guess) + grey('?') : '')
      );
    }
    ctx.out();
    ctx.out(grey('printcraft ' + first + ' --help  for the full list'));
    ctx.out();
    return 1;
  }

  try {
    return await entry.run(ctx, parsed);
  } catch (e) {
    const error = e as { message?: string; code?: string; hint?: string };
    ctx.out();
    ctx.out(red('✗ ') + (error.message || String(e)));
    if (error.hint) ctx.out(grey('  ' + error.hint));
    ctx.out();
    return 1;
  }
}

export { green, cyan };
