// Coded errors, and the logger.
//
// A stack trace says where something threw. For a library sitting between
// somebody's markup and their printer, "what to change" is the part that
// matters, and the person who hits it is usually not the person who wrote the
// call. Hence a stable code, a hint, and a buffer that survives the failure.

import { test, expect, vi } from 'vitest';
import { Printcraft, dom, env, stubPrint, I } from './harness';

const { CODES, PrintcraftError, isPrintcraftError, logger } = Printcraft;

/* the error type ---------------------------------------------------------- */

test('a coded error is still an ordinary Error', () => {
  const e = new PrintcraftError('PC_TARGET_NOT_FOUND', 'nothing matched', { target: '#gone' });

  // existing catch blocks and error reporters have to keep working
  expect(e).toBeInstanceOf(Error);
  expect(e).toBeInstanceOf(PrintcraftError);
  expect(e.name).toBe('PrintcraftError');
  expect(e.message).toBe('Printcraft: nothing matched');
});

test('every code carries a hint that says what to do', () => {
  for (const code of Object.keys(CODES)) {
    const e = new PrintcraftError(code as keyof typeof CODES, 'x');
    expect(e.hint, code + ' has no hint').toBeTruthy();
    expect(e.hint.length, code + ' hint is too short to help').toBeGreaterThan(20);
  }
});

test('context and cause travel with the error', () => {
  const cause = new Error('the underlying thing');
  const e = new PrintcraftError('PC_RASTERIZE_FAILED', 'could not draw', { width: 0 }, cause);

  expect(e.context).toEqual({ width: 0 });
  expect((e as { cause?: unknown }).cause).toBe(cause);
  expect(e.detail).toContain('could not draw');
  expect(e.detail, 'and the hint, for a log line or a dialog').toContain('renderer');
});

test('it serialises, so a reporter can ship it', () => {
  const json = new PrintcraftError('PC_POPUP_BLOCKED', 'blocked', { url: '/x' }).toJSON();
  expect(json).toMatchObject({ name: 'PrintcraftError', code: 'PC_POPUP_BLOCKED' });
  expect(JSON.stringify(json)).toContain('PC_POPUP_BLOCKED');
});

test('isPrintcraftError narrows, optionally by code', () => {
  const e = new PrintcraftError('PC_CLIP_INVALID', 'x');
  expect(isPrintcraftError(e)).toBe(true);
  expect(isPrintcraftError(e, 'PC_CLIP_INVALID')).toBe(true);
  expect(isPrintcraftError(e, 'PC_POPUP_BLOCKED')).toBe(false);
  expect(isPrintcraftError(new Error('plain'))).toBe(false);
  expect(isPrintcraftError(null)).toBe(false);
});

/* the real failures ------------------------------------------------------- */

const cases: Array<[string, () => unknown, string]> = [
  [
    'a missing target',
    () => Printcraft.print({ target: '#nothing-here' }, env(dom('<p>x</p>'))),
    'PC_TARGET_NOT_FOUND'
  ],
  ['no target at all', () => I.normalizeOptions({}), 'PC_OPTIONS_INVALID'],
  [
    'a clip rect missing numbers',
    () => I.normalizeOptions({ clipRect: { x: 1, y: 2 } }),
    'PC_CLIP_INVALID'
  ],
  [
    'a selector that would break out of a css rule',
    () => I.normalizeOptions({ target: 'body', avoidBreakSelectors: ['tr}{'] }),
    'PC_SELECTOR_UNSAFE'
  ],
  [
    'an invalid redaction selector',
    () => I.applyRedaction(dom('<p>x</p>').window.document.body, ['::: oops'], '█', 'printcraft'),
    'PC_SELECTOR_INVALID'
  ],
  [
    'config that is not an object',
    () => Printcraft.applyConfig('nope' as unknown as Record<string, unknown>),
    'PC_CONFIG_INVALID'
  ]
];

for (const [name, run, code] of cases) {
  test(name + ' fails with ' + code, async () => {
    let error: { code?: string } | null = null;
    try {
      await run();
    } catch (e) {
      error = e as typeof error;
    }
    expect(error, 'did not throw at all').toBeTruthy();
    expect(error!.code).toBe(code);
  });
}

/* the logger -------------------------------------------------------------- */

test('the buffer fills even when the console is silent', async () => {
  logger.clear();
  logger.level('silent');

  const d = dom('<div id="r">x</div>');
  const restore = stubPrint(d);
  await Printcraft.print({ target: '#r', assetTimeout: 50, debug: false }, env(d));
  restore();

  const records = logger.export();
  expect(records.length, 'a silent job still leaves a trail').toBeGreaterThan(0);
  expect(records.some((r) => r.msg.includes('job'))).toBe(true);
});

test('records are structured rather than formatted', () => {
  logger.clear();
  const log = I.makeLogger(false, 42, 'printcraft');
  log.warn('something odd', { detail: 1 }, 'and more');

  const [record] = logger.export();
  expect(record).toMatchObject({
    level: 'warn',
    ns: 'printcraft',
    jobId: 42,
    msg: 'something odd'
  });
  expect(record.data).toEqual([{ detail: 1 }, 'and more']);
  expect(typeof record.ts, 'and stamped, so an order can be reconstructed').toBe('number');
});

test('a sink sees every record and can be detached', () => {
  logger.clear();
  const seen: unknown[] = [];
  const detach = logger.sink((r) => seen.push(r.msg));

  const log = I.makeLogger(false, 1);
  log.info('first');
  log.error('second');
  detach();
  log.info('third');

  expect(seen).toEqual(['first', 'second']);
});

test('a sink that throws does not take the job down with it', () => {
  logger.clear();
  const detach = logger.sink(() => {
    throw new Error('the sink is broken');
  });

  const log = I.makeLogger(false, 1);
  expect(() => log.warn('still fine')).not.toThrow();
  detach();
  expect(logger.export().at(-1)!.msg).toBe('still fine');
});

test('the level gates the console, not the buffer', () => {
  logger.clear();
  const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

  logger.level('warn');
  const log = I.makeLogger(false, 1);
  log.warn('shown');
  log.info('not shown');

  expect(spy).toHaveBeenCalledOnce();
  expect(info, 'below the level').not.toHaveBeenCalled();
  expect(
    logger.export().map((r) => r.msg),
    'but both are buffered'
  ).toEqual(['shown', 'not shown']);

  spy.mockRestore();
  info.mockRestore();
  logger.level('silent');
});

test('a per-job debug flag speaks regardless of the global level', () => {
  logger.clear();
  logger.level('silent');
  const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

  I.makeLogger(true, 7).debug('this job is being debugged');
  expect(spy).toHaveBeenCalledOnce();
  expect(String(spy.mock.calls[0][0])).toContain('#7');

  spy.mockRestore();
});

test('the buffer is a ring, so a long session cannot grow without bound', () => {
  logger.clear();
  const log = I.makeLogger(false);
  for (let i = 0; i < 600; i++) log.debug('line ' + i);

  const records = logger.export();
  expect(records.length).toBe(500);
  expect(records[0]!.msg, 'the oldest fell off the front').toBe('line 100');
});

test('export is a copy, and toText is pasteable', () => {
  logger.clear();
  I.makeLogger(false, 3).error('it broke', { code: 'PC_X' });

  const copy = logger.export();
  copy.length = 0;
  expect(logger.export(), 'the caller got a copy').toHaveLength(1);

  const text = logger.toText();
  expect(text).toMatch(/^\d+ms ERROR \[printcraft#3\] it broke \{"code":"PC_X"\}$/);
});

test('an unserialisable payload does not break the log', () => {
  logger.clear();
  const circular: Record<string, unknown> = {};
  circular['self'] = circular;

  expect(() => I.makeLogger(false).info('cycle', circular)).not.toThrow();
  expect(logger.toText()).toContain('cycle');
});
