// The three commands.
//
// `print` renders a page the way the library would and writes the result out.
// `init` writes a config file. `doctor` says what would print, what would leak,
// and what failed to load: the three questions that come up when a print is
// wrong and nobody can see why.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { bold, cyan, dim, duration, green, grey, red, yellow } from './ansi';
import { open, toUrl } from './browser';
import type { CommandSpec, Parsed } from './args';

export interface Context {
  /** the built bundle to inject into the page */
  bundle: string;
  version: string;
  out: (line?: string) => void;
}

/* shared ------------------------------------------------------------------ */

/** Turns the flags every command shares into printcraft options. */
function optionsFrom(flags: Record<string, string | boolean | number>): Record<string, unknown> {
  // the whole page unless told otherwise: from a command line there is no
  // right-click to aim with, and "print this file" is what the words mean
  const options: Record<string, unknown> = { assetTimeout: 8000, target: 'body' };

  if (flags['target']) options['target'] = flags['target'];
  if (flags['page-size']) options['setPrintSize'] = flags['page-size'];
  if (flags['margin']) options['pageMargin'] = flags['margin'];
  if (flags['paginate']) options['paginate'] = true;
  if (flags['page-numbers']) options['pageNumbers'] = true;
  if (flags['watermark']) options['watermark'] = { text: flags['watermark'], repeat: 'every-page' };
  if (flags['privacy']) options['privacy'] = true;
  if (flags['redact']) {
    options['redactSelectorList'] = String(flags['redact'])
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (flags['exclude']) {
    options['excludeSelectorList'] = String(flags['exclude'])
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return options;
}

/** One aligned stage line, so a run reads as a sequence rather than a wall. */
function stage(ctx: Context, label: string, ms: number, note?: string): void {
  ctx.out(
    '  ' +
      green('✓') +
      ' ' +
      label.padEnd(14) +
      grey(duration(ms).padStart(7)) +
      (note ? '  ' + dim(note) : '')
  );
}

const SHARED_FLAGS: CommandSpec['flags'] = {
  target: { type: 'string', short: 't', describe: 'What to print', arg: '<selector>' },
  'page-size': { type: 'string', describe: 'A4, Letter, or a size', arg: '<size>' },
  margin: { type: 'string', short: 'm', describe: 'Page margin', arg: '<length>' },
  paginate: { type: 'boolean', describe: 'Lay the content out as real sheets' },
  'page-numbers': { type: 'boolean', describe: 'Number the pages; implies --paginate' },
  watermark: { type: 'string', short: 'w', describe: 'Mark every page', arg: '<text>' },
  redact: { type: 'string', short: 'r', describe: 'Destroy these', arg: '<selectors>' },
  exclude: { type: 'string', short: 'x', describe: 'Leave these out', arg: '<selectors>' },
  privacy: { type: 'boolean', describe: 'Blank emails, phones, SSNs and card numbers' },
  config: { type: 'string', short: 'c', describe: 'Read defaults from', arg: '<file>' },
  viewport: {
    type: 'string',
    describe: 'Layout width for the page',
    arg: '<w>x<h>',
    default: '1280x900'
  }
};

function viewportOf(flags: Record<string, unknown>): { width: number; height: number } {
  const [w, h] = String(flags['viewport'] || '1280x900').split('x');
  return { width: Number(w) || 1280, height: Number(h) || 900 };
}

/* print ------------------------------------------------------------------- */

export const printSpec: CommandSpec = {
  describe: 'Render a page the way printcraft would, and write it out',
  positional: [{ name: 'url|file', describe: 'A url, or a path to an html file', required: true }],
  flags: {
    ...SHARED_FLAGS,
    pdf: { type: 'string', describe: 'Write a pdf here', arg: '<file>' },
    png: { type: 'string', describe: 'Write a png here', arg: '<file>' },
    html: { type: 'string', describe: 'Write the assembled document here', arg: '<file>' }
  },
  examples: [
    'printcraft print invoice.html --pdf invoice.pdf',
    'printcraft print https://example.com/report --target "#report" --paginate --page-numbers --pdf out.pdf',
    'printcraft print report.html --redact ".ssn,.account" --privacy --png redacted.png'
  ]
};

export async function print(ctx: Context, parsed: Parsed): Promise<number> {
  const [target] = parsed.positional;
  if (!target) {
    ctx.out(red('Nothing to print.') + ' Pass a url or a path to an html file.');
    return 1;
  }

  const outputs = ['pdf', 'png', 'html'].filter((k) => parsed.flags[k]);
  if (!outputs.length) {
    ctx.out(red('Nowhere to put it.') + ' Pass at least one of --pdf, --png or --html.');
    return 1;
  }

  const url = toUrl(target);
  const options = optionsFrom(parsed.flags);
  if (parsed.flags['page-numbers']) options['paginate'] = true;

  ctx.out();
  ctx.out(bold('printcraft print') + '  ' + dim(url));
  ctx.out();

  let mark = Date.now();
  const since = (): number => {
    const ms = Date.now() - mark;
    mark = Date.now();
    return ms;
  };

  const session = await open(url, { bundle: ctx.bundle, viewport: viewportOf(parsed.flags) });
  stage(ctx, 'load', since());

  try {
    if (parsed.flags['config']) {
      const file = resolve(process.cwd(), String(parsed.flags['config']));
      const json = JSON.parse(await (await import('node:fs/promises')).readFile(file, 'utf8'));
      Object.assign(options, json);
      stage(ctx, 'config', since(), String(parsed.flags['config']));
    }

    // the assembled document is produced in the page, by the same pipeline a
    // browser user gets. nothing here re-implements any of it.
    const assembled = await session.page.evaluate(async (opts: Record<string, unknown>) => {
      const pc = (window as unknown as { Printcraft: Record<string, never> }).Printcraft;
      let html = '';
      let pages: number | null = null;
      const warnings: string[] = [];

      (
        pc as unknown as { logger: { sink(f: (r: { level: string; msg: string }) => void): void } }
      ).logger.sink((r) => {
        if (r.level === 'warn' || r.level === 'error') warnings.push(r.msg);
      });

      const record = await (
        pc as unknown as {
          print(o: unknown): Promise<{ pages?: number; redactions: number }>;
        }
      ).print({
        ...opts,
        hooks: {
          beforePrint(context: { document: Document }) {
            html = context.document.documentElement.outerHTML;
            pages = context.document.querySelectorAll('.prjs-page-sheet').length || null;
            return false;
          }
        }
      });

      return { html, pages, redactions: record.redactions, warnings };
    }, options as never);
    stage(
      ctx,
      'render',
      since(),
      (assembled.pages ? assembled.pages + ' sheets' : 'browser-flowed') +
        (assembled.redactions ? ', ' + assembled.redactions + ' redactions' : '')
    );

    // the assembled markup becomes its own page, so what is measured for the
    // pdf is exactly what the pipeline produced
    await session.page.evaluate((markup: string) => {
      document.open();
      document.write(markup);
      document.close();
    }, assembled.html as never);

    const written: Array<[string, number]> = [];

    if (parsed.flags['pdf']) {
      const file = resolve(process.cwd(), String(parsed.flags['pdf']));
      const bytes = await session.page.pdf({
        printBackground: true,
        preferCSSPageSize: true,
        ...(options['pageMargin'] && !options['paginate']
          ? {}
          : { margin: { top: 0, right: 0, bottom: 0, left: 0 } })
      });
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, bytes);
      written.push([file, bytes.length]);
    }

    if (parsed.flags['png']) {
      const file = resolve(process.cwd(), String(parsed.flags['png']));
      const bytes = await session.page.screenshot({ fullPage: true });
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, bytes);
      written.push([file, bytes.length]);
    }

    if (parsed.flags['html']) {
      const file = resolve(process.cwd(), String(parsed.flags['html']));
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, assembled.html);
      written.push([file, Buffer.byteLength(assembled.html)]);
    }

    stage(ctx, 'write', since(), written.length + (written.length === 1 ? ' file' : ' files'));

    if (assembled.warnings.length) {
      ctx.out();
      for (const w of assembled.warnings.slice(0, 5)) ctx.out('  ' + yellow('!') + ' ' + w);
    }

    ctx.out();
    for (const [file, size] of written) {
      ctx.out('  ' + cyan(file) + '  ' + grey(Math.round(size / 1024) + ' kB'));
    }
    ctx.out();
    return 0;
  } finally {
    await session.close();
  }
}

/* doctor ------------------------------------------------------------------ */

export const doctorSpec: CommandSpec = {
  describe: 'Say what would print, what would leak, and what failed to load',
  positional: [{ name: 'url|file', describe: 'A url, or a path to an html file', required: true }],
  flags: SHARED_FLAGS,
  examples: [
    'printcraft doctor invoice.html',
    'printcraft doctor report.html --target "#report" --redact ".ssn" --privacy'
  ]
};

export async function doctor(ctx: Context, parsed: Parsed): Promise<number> {
  const [target] = parsed.positional;
  if (!target) {
    ctx.out(red('Nothing to check.') + ' Pass a url or a path to an html file.');
    return 1;
  }

  const url = toUrl(target);
  const options = optionsFrom(parsed.flags);

  ctx.out();
  ctx.out(bold('printcraft doctor') + '  ' + dim(url));
  ctx.out();

  const session = await open(url, { bundle: ctx.bundle, viewport: viewportOf(parsed.flags) });

  try {
    const report = await session.page.evaluate(async (opts: Record<string, unknown>) => {
      const pc = (window as unknown as { Printcraft: Record<string, never> }).Printcraft;
      const warnings: string[] = [];
      (
        pc as unknown as { logger: { sink(f: (r: { level: string; msg: string }) => void): void } }
      ).logger.sink((r) => {
        if (r.level === 'warn' || r.level === 'error') warnings.push(r.msg);
      });

      let doc: Document | null = null;
      const record = await (
        pc as unknown as { print(o: unknown): Promise<{ redactions: number; timings: object }> }
      ).print({
        ...opts,
        // the check has to see the leak rather than being stopped by it
        redactionPolicy: 'warn',
        hooks: {
          beforePrint(context: { document: Document }) {
            doc = context.document;
            return false;
          }
        }
      });

      const d = doc as unknown as Document;
      const text = d.body.textContent || '';
      const html = d.documentElement.outerHTML;

      // the patterns the privacy scan uses, applied to the finished document:
      // anything still matching would go on paper
      const leaks: Array<[string, number]> = [];
      const patterns: Array<[string, RegExp]> = [
        ['email address', /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g],
        ['phone number', /\+?\d[\d\s().-]{7,}\d/g],
        ['social security number', /\b\d{3}-\d{2}-\d{4}\b/g],
        ['card number', /\b(?:\d[ -]?){13,16}\b/g]
      ];
      for (const [label, rx] of patterns) {
        const hits = text.match(rx);
        if (hits) leaks.push([label, hits.length]);
      }

      return {
        sheets: d.querySelectorAll('.prjs-page-sheet').length,
        elements: d.querySelectorAll('*').length,
        characters: text.trim().length,
        images: d.querySelectorAll('img').length,
        brokenImages: [...d.querySelectorAll('img')].filter(
          (i) => !i.getAttribute('src') || i.getAttribute('src') === ''
        ).length,
        redactions: record.redactions,
        bars: (text.match(/█/g) || []).length,
        scripts: d.querySelectorAll('script').length,
        externals: [...d.querySelectorAll('img,link,script')]
          .map((n) => n.getAttribute('src') || n.getAttribute('href') || '')
          .filter((u) => /^https?:/i.test(u)).length,
        leaks,
        warnings,
        bytes: html.length
      };
    }, options as never);

    ctx.out(bold('  What would print'));
    for (const [label, value] of [
      ['sheets', report.sheets ? String(report.sheets) : grey('browser-flowed')],
      ['elements', String(report.elements)],
      ['characters', String(report.characters)],
      ['images', String(report.images)],
      ['size', Math.round(report.bytes / 1024) + ' kB']
    ] as Array<[string, string]>) {
      ctx.out('    ' + grey(label.padEnd(12)) + value);
    }
    ctx.out();

    ctx.out(bold('  What would leak'));
    if (!report.leaks.length) {
      ctx.out('  ' + green('✓') + ' nothing matching the privacy patterns');
    } else {
      for (const [label, count] of report.leaks) {
        ctx.out('  ' + red('✗') + ' ' + count + ' ' + label + (count === 1 ? '' : 's'));
      }
      ctx.out();
      ctx.out(grey('    Add --privacy, or name them with --redact.'));
    }
    if (report.redactions) {
      ctx.out(
        '  ' +
          green('✓') +
          ' ' +
          report.redactions +
          ' redactions applied, ' +
          report.bars +
          ' bars'
      );
    }
    ctx.out();

    ctx.out(bold('  What did not load'));
    const problems: string[] = [];
    if (report.brokenImages) problems.push(report.brokenImages + ' images with no source');
    if (report.externals) problems.push(report.externals + ' assets still pointing off-origin');
    if (report.scripts) problems.push(report.scripts + ' scripts survived the sanitiser');
    for (const w of report.warnings.slice(0, 5)) problems.push(w);

    if (!problems.length) ctx.out('  ' + green('✓') + ' everything resolved');
    else for (const p of problems) ctx.out('  ' + yellow('!') + ' ' + p);
    ctx.out();

    return report.leaks.length ? 2 : 0;
  } finally {
    await session.close();
  }
}

/* init -------------------------------------------------------------------- */

export const initSpec: CommandSpec = {
  describe: 'Write a printcraft.config.json to start from',
  flags: {
    force: { type: 'boolean', short: 'f', describe: 'Overwrite an existing file' },
    out: {
      type: 'string',
      short: 'o',
      describe: 'Where to write it',
      arg: '<file>',
      default: 'printcraft.config.json'
    }
  },
  examples: ['printcraft init', 'printcraft init --out config/print.json']
};

const TEMPLATE = {
  setPrintSize: 'A4',
  pageMargin: '18mm',
  hideBrowserHeaderFooter: true,
  excludeSelectorList: ['nav', 'footer', '.no-print'],
  redactSelectorList: [],
  privacy: false,
  paginate: false,
  pageNumbers: { template: 'Page {page} of {pages}', position: 'bottom-center' },
  watermark: null
};

export async function init(ctx: Context, parsed: Parsed): Promise<number> {
  const file = resolve(process.cwd(), String(parsed.flags['out']));
  const { existsSync } = await import('node:fs');

  if (existsSync(file) && !parsed.flags['force']) {
    ctx.out(red(file + ' already exists.') + ' Pass --force to overwrite it.');
    return 1;
  }

  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(TEMPLATE, null, 2) + '\n');

  ctx.out();
  ctx.out('  ' + green('✓') + ' wrote ' + cyan(file));
  ctx.out();
  ctx.out(grey('  Load it in a page:'));
  ctx.out('    ' + dim('Printcraft.loadConfig(') + "'/printcraft.config.json'" + dim(')'));
  ctx.out(grey('  Or from the cli:'));
  ctx.out('    ' + dim('printcraft print page.html --config ') + parsed.flags['out']);
  ctx.out();
  return 0;
}
