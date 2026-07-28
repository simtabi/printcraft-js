// the data-driven layer: emitter, data attributes, json config, hooks, per-job
// listeners, devtools records, and the inspector.

import { test } from 'vitest';
import { Printcraft, I, dom, stubPrint } from './harness';
import {
  expect_eq,
  expect_deep,
  expect_match,
  expect_ok,
  expect_throws,
  expect_no_throw,
  expect_rejects
} from './assertions';

/* emitter */

test('emitter: on/emit/off/once and cancel signalling', () => {
  const em = new I.Emitter();
  const seen = [];
  const a = (p) => {
    seen.push('a:' + p.x);
  };
  em.on('e', a);
  em.once('e', (p) => seen.push('once:' + p.x));
  em.emit('e', { x: 1 });
  em.emit('e', { x: 2 });
  expect_deep(seen, ['a:1', 'once:1', 'a:2']);
  em.off('e', a);
  em.emit('e', { x: 3 });
  expect_eq(seen.length, 3);
  // return values are collected so callers can detect a false (= cancel)
  em.on('c', () => false);
  em.on('c', () => 'ok');
  expect_deep(em.emit('c'), [false, 'ok']);
});

test('emitter: a throwing listener does not break the chain', () => {
  const em = new I.Emitter();
  const seen = [];
  const origError = console.error;
  console.error = () => {};
  try {
    em.on('e', () => {
      throw new Error('boom');
    });
    em.on('e', () => seen.push('survived'));
    em.emit('e');
  } finally {
    console.error = origError;
  }
  expect_deep(seen, ['survived']);
});

/* data attribute parsing */

test('coerceValue: booleans, numbers, null, json, selector lists, strings', () => {
  expect_eq(I.coerceValue('x', ''), true);
  expect_eq(I.coerceValue('x', 'true'), true);
  expect_eq(I.coerceValue('x', 'false'), false);
  expect_eq(I.coerceValue('x', 'null'), null);
  expect_eq(I.coerceValue('x', '42'), 42);
  expect_eq(I.coerceValue('x', '0.25'), 0.25);
  expect_deep(I.coerceValue('x', '["a","b"]'), ['a', 'b']);
  expect_deep(I.coerceValue('excludeSelectorList', '.a, .b'), ['.a', '.b']);
  expect_eq(I.coerceValue('headerText', 'plain, text stays'), 'plain, text stays');
  expect_eq(I.coerceValue('setPrintSize', 'A4 landscape'), 'A4 landscape');
});

test('parseDataOptions: kebab->camel, options blob merged under individual attrs', () => {
  const d = dom(`<button id="b"
    data-printcraft="#report"
    data-printcraft-options='{"footerText":"from blob","watermarkText":"blob wm"}'
    data-printcraft-header-text="Top line"
    data-printcraft-watermark-text="DRAFT"
    data-printcraft-watermark-opacity="0.1"
    data-printcraft-exclude-selector-list=".no-print, .ads"
    data-printcraft-reveal-hidden-elements
  >go</button>`);
  const o = I.parseDataOptions(d.window.document.getElementById('b'));
  expect_eq(o.target, '#report');
  expect_eq(o.footerText, 'from blob');
  expect_eq(o.headerText, 'Top line');
  expect_eq(o.watermarkText, 'DRAFT'); // attr wins over blob
  expect_eq(o.watermarkOpacity, 0.1);
  expect_deep(o.excludeSelectorList, ['.no-print', '.ads']);
  expect_eq(o.revealHiddenElements, true);
});

test('parseDataOptions: invalid options json raises a clear error', () => {
  const d = dom(`<button id="b" data-printcraft-options='{bad json}'>go</button>`);
  expect_throws(() => I.parseDataOptions(d.window.document.getElementById('b')), /not valid json/);
});

test('initDeclarative: delegated click runs a job with parsed options', async () => {
  const d = dom(
    `<button data-printcraft="#r" data-printcraft-job-name="declarative">go</button><div id="r">x</div>`
  );
  const calls = [];
  const origPrint = Printcraft.print;
  Printcraft.print = (opts) => {
    calls.push(opts);
    return Promise.resolve({});
  };
  try {
    const teardown = Printcraft.initDeclarative({ document: d.window.document, window: d.window });
    d.window.document
      .querySelector('button')
      .dispatchEvent(new d.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    expect_eq(calls.length, 1);
    expect_eq(calls[0].target, '#r');
    expect_eq(calls[0].jobName, 'declarative');
    teardown();
    d.window.document
      .querySelector('button')
      .dispatchEvent(new d.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    expect_eq(calls.length, 1);
  } finally {
    Printcraft.print = origPrint;
  }
});

/* json config */

test('applyConfig merges into defaults and emits config:loaded', () => {
  const events = [];
  const onCfg = (p) => events.push(p.source);
  Printcraft.on('config:loaded', onCfg);
  try {
    Printcraft.applyConfig({ footerText: 'cfg footer', pageMargin: '12mm' });
    const o = I.normalizeOptions({ target: '#x' });
    expect_eq(o.footerText, 'cfg footer');
    expect_eq(o.pageMargin, '12mm');
    expect_deep(events, ['object']);
  } finally {
    Printcraft.off('config:loaded', onCfg);
    Printcraft.defaults = {};
  }
});

test('readInlineConfig picks up an application/json script block', () => {
  const d = dom(`<script type="application/json" data-printcraft-config>
    { "headerText": "inline cfg", "watermarkOpacity": 0.4 }
  </script><div id="r">x</div>`);
  try {
    const json = Printcraft.readInlineConfig(d.window.document);
    expect_eq(json.headerText, 'inline cfg');
    const o = I.normalizeOptions({ target: '#r' });
    expect_eq(o.headerText, 'inline cfg');
    expect_eq(o.watermarkOpacity, 0.4);
  } finally {
    Printcraft.defaults = {};
  }
});

test('loadConfig fetches json and rejects on bad status', async () => {
  const okFetch = () =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({ footerText: 'net cfg' }) });
  const badFetch = () => Promise.resolve({ ok: false, status: 404 });
  try {
    await Printcraft.loadConfig('/printcraft.config.json', okFetch);
    expect_eq(Printcraft.defaults.footerText, 'net cfg');
    await expect_rejects(() => Printcraft.loadConfig('/missing.json', badFetch), /404/);
  } finally {
    Printcraft.defaults = {};
  }
});

/* content annotations */

test('data-printcraft-exclude is always removed from the print copy', () => {
  const d = dom('<div id="r"><p>keep</p><p data-printcraft-exclude>drop</p></div>');
  const clone = d.window.document.getElementById('r').cloneNode(true);
  I.applyExclusions(clone, I.normalizeOptions({ target: '#r' }));
  expect_eq(clone.querySelectorAll('p').length, 1);
  expect_eq(clone.textContent.trim(), 'keep');
});

test('annotation css rules ship in every print document', () => {
  const css = I.buildPageCss(I.normalizeOptions({ target: '#x' }));
  expect_match(css, /\[data-printcraft-break-before\] \{ break-before: page/);
  expect_match(css, /\[data-printcraft-break-after\] \{ break-after: page/);
  expect_match(css, /\[data-printcraft-avoid-break\] \{ break-inside: avoid/);
  expect_match(css, /\[data-printcraft-reveal\] \{ display: revert !important/);
});

/* events, hooks, per-job listeners */

test('job pipeline emits lifecycle events in order on the static bus', async () => {
  const d = dom('<div id="r"><p>x</p></div>');
  const unstub = stubPrint(d);
  const order = [];
  const names = [
    'job:start',
    'job:clone',
    'job:transform',
    'job:mount',
    'job:assets',
    'job:beforeprint',
    'job:afterprint',
    'job:done'
  ];
  const handlers = names.map((n) => {
    const h = () => order.push(n);
    Printcraft.on(n, h);
    return [n, h];
  });
  try {
    const job = await Printcraft.print(
      { target: '#r', assetTimeout: 100, afterPrintTimeout: 300 },
      { document: d.window.document, window: d.window }
    );
    expect_eq(job.status, 'done');
    expect_deep(order, names);
    expect_ok(job.duration >= 0);
    expect_eq(job.targetCount, 1);
  } finally {
    unstub();
    handlers.forEach(([n, h]) => Printcraft.off(n, h));
  }
});

test('a job:beforeprint listener returning false cancels the job cleanly', async () => {
  const d = dom('<div id="r">x</div>');
  const events = [];
  const unstub = stubPrint(d, events);
  const cancel = () => false;
  Printcraft.on('job:beforeprint', cancel);
  try {
    const job = await Printcraft.print(
      { target: '#r', assetTimeout: 100 },
      { document: d.window.document, window: d.window }
    );
    expect_eq(job.status, 'cancelled');
    expect_eq(job.cancelled, true);
    expect_deep(events, []); // print never called
    expect_eq(d.window.document.querySelectorAll('iframe').length, 0);
  } finally {
    unstub();
    Printcraft.off('job:beforeprint', cancel);
  }
});

test('hooks: transformClone can swap the clone, beforePrint false cancels', async () => {
  const d = dom('<div id="r">original</div>');
  const unstub = stubPrint(d);
  try {
    const job = await Printcraft.print(
      {
        target: '#r',
        assetTimeout: 100,
        hooks: {
          transformClone: (clone) => {
            const repl = clone.ownerDocument.createElement('article');
            repl.textContent = 'swapped';
            return repl;
          },
          beforePrint: (ctx) => {
            expect_eq(ctx.document.querySelector('.pc-target article').textContent, 'swapped');
            return false; // and cancel so no dialog is needed
          }
        }
      },
      { document: d.window.document, window: d.window }
    );
    expect_eq(job.status, 'cancelled');
  } finally {
    unstub();
  }
});

test('per-job listeners via options.on fire and detach afterwards', async () => {
  const d = dom('<div id="r">x</div>');
  const unstub = stubPrint(d);
  let doneCount = 0;
  try {
    await Printcraft.print(
      {
        target: '#r',
        assetTimeout: 100,
        afterPrintTimeout: 300,
        on: {
          'job:done': () => {
            doneCount++;
          }
        }
      },
      { document: d.window.document, window: d.window }
    );
    expect_eq(doneCount, 1);
    expect_eq(Printcraft._bus.listenerCount('job:done'), 0);
  } finally {
    unstub();
  }
});

test('legacy beforePrintCb/afterPrintCb still fire alongside events', async () => {
  const d = dom('<div id="r">x</div>');
  const unstub = stubPrint(d);
  const order = [];
  try {
    const job = await Printcraft.print(
      {
        target: '#r',
        assetTimeout: 100,
        afterPrintTimeout: 300,
        beforePrintCb: () => order.push('beforeCb'),
        afterPrintCb: () => order.push('afterCb')
      },
      { document: d.window.document, window: d.window }
    );
    expect_eq(job.status, 'done');
    expect_deep(order, ['beforeCb', 'afterCb']);
  } finally {
    unstub();
  }
});

/* devtools */

test('devtools records jobs with status, timings, and report() rows', async () => {
  const d = dom('<div id="r">x</div>');
  const unstub = stubPrint(d);
  Printcraft.devtools.clear();
  try {
    const job = await Printcraft.print(
      { target: '#r', jobName: 'devtest', assetTimeout: 100, afterPrintTimeout: 300 },
      { document: d.window.document, window: d.window }
    );
    expect_eq(Printcraft.devtools.last().id, job.id);
    expect_eq(Printcraft.devtools.last().name, 'devtest');
    expect_eq(Printcraft.devtools.last().status, 'done');
    expect_ok('clone' in job.timings && 'assemble' in job.timings);
    const origTable = console.table;
    console.table = () => {};
    try {
      const rows = Printcraft.devtools.report();
      expect_eq(rows[rows.length - 1].name, 'devtest');
    } finally {
      console.table = origTable;
    }
  } finally {
    unstub();
    Printcraft.devtools.clear();
  }
});

test('devtools ring buffer caps recorded jobs', () => {
  Printcraft.devtools.clear();
  const cap = Printcraft.devtools.maxJobs;
  for (let i = 0; i < cap + 5; i++) Printcraft.devtools.record({ id: i });
  expect_eq(Printcraft.devtools.jobs.length, cap);
  expect_eq(Printcraft.devtools.jobs[0].id, 5);
  Printcraft.devtools.clear();
});

test('debug flag: option beats global, logger stays silent when off', () => {
  expect_eq(Printcraft.debug(), false);
  Printcraft.debug(true);
  expect_eq(Printcraft.debug(), true);
  Printcraft.debug(false);
  const silent = I.makeLogger(false, 1);
  const origLog = console.log;
  let called = 0;
  console.log = () => {
    called++;
  };
  try {
    silent.debug('hidden');
  } finally {
    console.log = origLog;
  }
  expect_eq(called, 0);
});

/* inspector */

test('inspect mounts a visible overlay and resolves a controller', async () => {
  const d = dom('<div id="r"><p>preview me</p></div>');
  Printcraft.devtools.clear();
  const ctl = await Printcraft.inspect(
    { target: '#r', assetTimeout: 100, footerText: 'inspected' },
    { document: d.window.document, window: d.window }
  );
  const overlay = d.window.document.querySelector('[data-pc-inspector]');
  expect_ok(overlay, 'overlay is in the dom');
  expect_ok(overlay.querySelector('iframe'));
  expect_eq(ctl.job.status, 'inspected');
  expect_ok(ctl.document.querySelector('.pc-target #r'));
  expect_eq(ctl.document.querySelector('tfoot td').textContent, 'inspected');
  expect_ok(ctl.job.documentHTML.indexOf('preview me') !== -1);
  ctl.close();
  expect_eq(d.window.document.querySelector('[data-pc-inspector]'), null);
  Printcraft.devtools.clear();
});

/* boot */

test('_boot is a safe no-op without a document', () => {
  expect_no_throw(() => Printcraft._boot(null, null));
});
