// Redaction, and the check that it happened.
//
// Every other stage here is best-effort: a missed exclusion prints an extra
// paragraph and someone notices. A missed redaction prints a name, and the
// person who asked for it hidden has no way to find out. So the assembled
// document is re-read for everything redaction destroyed, and by default a leak
// stops the job.

import { test, expect } from 'vitest';
import { Printcraft, dom, env, stubPrint, BLOCK, I } from './harness';

const { verifyRedaction, applyRuns, secretsOf, normalizeOptions } = I;

const SECRETS = {
  name: 'Jane Marie Doe',
  account: '4111111111111111',
  email: 'jane.doe@example.com',
  codename: 'BLUEBIRD'
};

function fixture(): string {
  return `
    <article id="file">
      <h2>Personnel file</h2>
      <p class="name">Officer: ${SECRETS.name}</p>
      <p class="codename" data-original="${SECRETS.codename}">Codename: ${SECRETS.codename}</p>
      <p>Contact ${SECRETS.email} or card ${SECRETS.account}.</p>
      <p class="caption" title="${SECRETS.name}">A caption carrying it in an attribute.</p>
    </article>`;
}

/* the verifier ----------------------------------------------------------- */

test('the verifier finds what is still there and ignores what is not', () => {
  const d = dom('<p>the quick brown fox</p><span title="hidden treasure">x</span>');
  const doc = d.window.document;

  const report = verifyRedaction(doc, ['quick brown', 'hidden treasure', 'nowhere at all']);

  expect(report.checked).toBe(3);
  // oxlint-disable-next-line no-array-sort
  expect([...report.leaked].sort()).toEqual(['hidden treasure', 'quick brown']);
  expect(report.where['quick brown']).toContain('text');
  expect(report.where['hidden treasure'], 'attributes leak silently').toContain('span[title]');
});

test('strings too short or too generic are not searched for', () => {
  // redacting "of" would otherwise match half the document and abort every job
  const d = dom('<p>a study of things</p>');
  const report = verifyRedaction(d.window.document, ['of', 'a', '  ', '...', 'study']);

  expect(report.checked, 'only "study" is worth checking').toBe(1);
  expect(report.leaked).toEqual(['study']);
});

test('a clean document reports nothing', () => {
  const d = dom('<p>' + BLOCK.repeat(14) + '</p>');
  expect(verifyRedaction(d.window.document, [SECRETS.name]).leaked).toEqual([]);
});

/* the policy ------------------------------------------------------------- */

test('a leak introduced before assembly aborts with PC_REDACTION_LEAK', async () => {
  const d = dom(fixture());
  const restore = stubPrint(d);

  let error: { code?: string; report?: { leaked: string[] } } | null = null;
  try {
    await Printcraft.print(
      {
        target: '#file',
        redactSelectorList: ['.name'],
        assetTimeout: 50,
        // a transform that re-reads the live page is exactly how content comes
        // back after redaction ran
        transforms: [
          {
            selector: 'h2',
            fn: (el: Element) => {
              el.textContent = 'Officer: ' + SECRETS.name;
              return el;
            }
          }
        ]
      },
      env(d)
    );
  } catch (e) {
    error = e as typeof error;
  }
  restore();

  expect(error, 'the job did not print').toBeTruthy();
  expect(error!.code).toBe('PC_REDACTION_LEAK');
  expect(error!.report!.leaked).toContain('Officer: ' + SECRETS.name);
});

test('warn prints anyway and says so', async () => {
  const d = dom(fixture());
  const restore = stubPrint(d);

  const record = await Printcraft.print(
    {
      target: '#file',
      redactSelectorList: ['.name'],
      redactionPolicy: 'warn',
      assetTimeout: 50,
      transforms: [
        {
          selector: 'h2',
          fn: (el: Element) => {
            el.textContent = 'Officer: ' + SECRETS.name;
            return el;
          }
        }
      ]
    },
    env(d)
  );
  restore();

  expect(record.status).toBe('done');
});

test('off skips the check entirely', async () => {
  const d = dom(fixture());
  const restore = stubPrint(d);

  const events: unknown[] = [];
  const listener = (): void => void events.push(1);
  Printcraft.on('redact:verify', listener);

  await Printcraft.print(
    { target: '#file', redactSelectorList: ['.name'], redactionPolicy: 'off', assetTimeout: 50 },
    env(d)
  );
  Printcraft.off('redact:verify', listener);
  restore();

  expect(events).toEqual([]);
});

test('a job with no redaction pays nothing for the check', async () => {
  const d = dom(fixture());
  const restore = stubPrint(d);

  const record = await Printcraft.print({ target: '#file', assetTimeout: 50 }, env(d));
  restore();

  expect(record.timings['verify'], 'the stage never ran').toBeUndefined();
});

/* the leak test that matters --------------------------------------------- */

test('nothing redacted by any route survives into the print document', async () => {
  const d = dom(fixture());
  let printed = '';

  await Printcraft.print(
    {
      target: '#file',
      // every route at once: selector, attribute scrub, pattern scan
      redactSelectorList: ['.name', '.codename', '.caption'],
      privacy: true,
      assetTimeout: 50,
      hooks: {
        beforePrint(ctx: { document: Document }) {
          printed = ctx.document.documentElement.outerHTML;
          return false;
        }
      }
    },
    env(d)
  );

  expect(printed).toBeTruthy();
  for (const [label, secret] of Object.entries(SECRETS)) {
    expect(printed, label + ' reached the page').not.toContain(secret);
  }
  // and the data-* attribute carrying the codename went with it
  expect(printed).not.toContain('data-original');
  expect(printed, 'what is left is the bar').toContain(BLOCK);

  // the live page is untouched, as always
  expect(d.window.document.querySelector('.name')!.textContent).toContain(SECRETS.name);
});

/* character-accurate runs ------------------------------------------------- */

test('a run destroys exactly its own characters', () => {
  const d = dom('<p id="p">Officer: Jane Marie Doe, badge 42</p>');
  const p = d.window.document.querySelector('#p')!;

  // "Jane Marie Doe" is characters 9 to 23
  const applied = applyRuns(p, [{ path: [0], start: 9, end: 23, text: 'Jane Marie Doe' }], BLOCK);

  expect(applied).toBe(1);
  expect(p.textContent).toBe('Officer: ' + BLOCK.repeat(14) + ', badge 42');
  expect(p.classList.contains('prjs-redacted-run')).toBe(true);
});

test('overlapping runs in one node all land', () => {
  const d = dom('<p id="p">alpha beta gamma</p>');
  const p = d.window.document.querySelector('#p')!;

  applyRuns(
    p,
    [
      { path: [0], start: 0, end: 5, text: 'alpha' },
      { path: [0], start: 11, end: 16, text: 'gamma' }
    ],
    BLOCK
  );

  expect(p.textContent).toBe(BLOCK.repeat(5) + ' beta ' + BLOCK.repeat(5));
});

test('a run past the end of the text is clamped rather than throwing', () => {
  const d = dom('<p id="p">short</p>');
  const p = d.window.document.querySelector('#p')!;

  applyRuns(p, [{ path: [0], start: 2, end: 900, text: 'ort' }], BLOCK);
  expect(p.textContent).toBe('sh' + BLOCK.repeat(3));
});

test('a path that leads nowhere is skipped, not fatal', () => {
  const d = dom('<p id="p">text</p>');
  const p = d.window.document.querySelector('#p')!;

  expect(() => applyRuns(p, [{ path: [4, 9], start: 0, end: 2, text: 'te' }], BLOCK)).not.toThrow();
  expect(p.textContent).toBe('text');
});

test('secretsOf keeps what is worth verifying', () => {
  expect(
    secretsOf([
      { path: [0], start: 0, end: 3, text: '  Jane Doe ' },
      { path: [0], start: 0, end: 1, text: 'a' },
      { path: [0], start: 0, end: 3, text: '   ' },
      { path: [0], start: 0, end: 3, text: 'Jane Doe' }
    ])
  ).toEqual(['Jane Doe']);
});

test('runs print, and the verifier confirms they did', async () => {
  const d = dom('<p id="p">Officer: Jane Marie Doe, badge 42</p>');
  let printed = '';

  await Printcraft.print(
    {
      target: '#p',
      redactRuns: [{ path: [0], start: 9, end: 23, text: 'Jane Marie Doe' }],
      assetTimeout: 50,
      hooks: {
        beforePrint(ctx: { document: Document }) {
          printed = ctx.document.body.textContent || '';
          return false;
        }
      }
    },
    env(d)
  );

  expect(printed).toContain('Officer: ' + BLOCK.repeat(14));
  expect(printed).not.toContain('Jane Marie Doe');
  expect(printed, 'the rest of the line survived').toContain('badge 42');
});

test('redactRuns count towards the job record', async () => {
  const d = dom('<p id="p">Officer: Jane Marie Doe</p>');
  const restore = stubPrint(d);

  const record = await Printcraft.print(
    {
      target: '#p',
      redactRuns: [{ path: [0], start: 9, end: 23, text: 'Jane Marie Doe' }],
      assetTimeout: 50
    },
    env(d)
  );
  restore();

  expect(record.redactions).toBe(1);
  expect(record.status).toBe('done');
});

test('normalizeOptions defaults the policy to strict', () => {
  expect(normalizeOptions({ target: 'body' }).redactionPolicy).toBe('strict');
  expect(normalizeOptions({ target: 'body', redactionPolicy: 'warn' }).redactionPolicy).toBe(
    'warn'
  );
});

/* what the verifier does not claim ---------------------------------------- */
//
// Worth pinning down, because the gap between what a check does and what people
// assume it does is where trust goes wrong.

test('the verifier checks the strings destroyed, not everything they contain', () => {
  // redacting `<p>Officer: Jane Marie Doe</p>` records the whole text node. If
  // something later reintroduces only part of it, that part is not one of the
  // strings being searched for, so it is not found.
  const d = dom('<p>Jane Marie Doe</p>');
  const report = verifyRedaction(d.window.document, ['Officer: Jane Marie Doe']);

  expect(report.leaked, 'a partial return is not detected').toEqual([]);

  // asking for the fragment directly does find it
  expect(verifyRedaction(d.window.document, ['Jane Marie Doe']).leaked).toEqual(['Jane Marie Doe']);
});

test('selector redaction does not reach a copy in another element', async () => {
  // `.name` is destroyed; the caption's title attribute holds the same string on
  // a different element that was never named. Redaction is scoped to what you
  // ask for. `privacy` patterns are the tool for finding a value anywhere.
  const d = dom(fixture());
  let printed = '';

  await Printcraft.print(
    {
      target: '#file',
      redactSelectorList: ['.name'],
      redactionPolicy: 'off',
      assetTimeout: 50,
      hooks: {
        beforePrint(ctx: { document: Document }) {
          printed = ctx.document.documentElement.outerHTML;
          return false;
        }
      }
    },
    env(d)
  );

  expect(printed, 'the named element is gone').not.toContain('Officer: ' + SECRETS.name);
  expect(printed, 'the unnamed one is not').toContain('title="' + SECRETS.name + '"');
});
