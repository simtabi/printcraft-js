// Every option, driven through the real print path, in a real browser.
//
// This exists because "the region tool prints a blank page" turned out to be one
// defect with a long shadow: the print frame was mounted 0×0, so the cloned
// document laid out at a zero-width viewport, every media query collapsed to its
// narrowest breakpoint, and the content reflowed into something nobody had seen.
// Drawn regions then landed on empty space.
//
// The inspector could never have caught it — its frame is visible and sized. So
// these run through `Printcraft.print()` and cancel at `beforePrint`, which is the
// last moment the assembled document exists and the only place the real frame can
// be measured.

import { expect, test } from '@playwright/test';

const DEMO = '/demo/index.html';

/** A4 at 96dpi. Anything else means the frame is not sized to the paper. */
const A4 = { width: 794, height: 1123 };

interface Probe {
  frameWidth: number;
  frameHeight: number;
  targetWidth: number;
  /** rendered text length, so css that hides things shortens it */
  targetText: number;
  /** raw dom text length, which hiding does not change */
  targetChars: number;
  bodyHeight: number;
  canvasPng: number;
  marks: number;
  notes: number;
  redacted: number;
  watermark: number;
  sheetTable: number;
  baseHref: string | null;
  pageCss: string;
}

/**
 * Runs one job for real and reports what the print document actually contained,
 * then cancels so no dialog opens.
 */
async function probe(
  page: import('@playwright/test').Page,
  options: Record<string, unknown>
): Promise<Probe> {
  return page.evaluate(async (opts) => {
    let seen = {} as Probe;
    const pc = (window as unknown as { Printcraft: { print(o: unknown): Promise<unknown> } })
      .Printcraft;

    await pc.print({
      assetTimeout: 2000,
      ...opts,
      hooks: {
        beforePrint(ctx: { window: Window; document: Document }) {
          const d = ctx.document;
          const target = d.querySelector('.pc-target');
          const styles = [...d.querySelectorAll('style')]
            .map((s) => s.textContent || '')
            .join('\n');
          seen = {
            frameWidth: ctx.window.innerWidth,
            frameHeight: ctx.window.innerHeight,
            targetWidth: target ? Math.round(target.getBoundingClientRect().width) : 0,
            targetText: (target ? (target as HTMLElement).innerText : '').trim().length,
            targetChars: (target?.textContent || '').replace(/\s+/g, ' ').trim().length,
            bodyHeight: Math.round(d.body.scrollHeight),
            canvasPng: d.querySelectorAll('img[src^="data:image/png"]').length,
            marks: d.querySelectorAll('.pc-mark').length,
            notes: d.querySelectorAll('.pc-note').length,
            redacted: d.querySelectorAll('.pc-redacted').length,
            watermark: d.querySelectorAll('.pc-watermark').length,
            sheetTable: d.querySelectorAll('table.pc-sheet').length,
            baseHref: d.querySelector('base')?.getAttribute('href') ?? null,
            pageCss: styles
          };
          return false; // cancel: we only wanted to look
        }
      }
    });
    return seen;
  }, options);
}

test.beforeEach(async ({ page }) => {
  await page.goto(DEMO);
  await expect(page.locator('#tickets .pc-ticket').first()).toBeVisible();
});

/* the defect this file was written for -------------------------------------- */

test('the print frame is laid out at the sheet width, not zero', async ({ page }) => {
  const r = await probe(page, { target: '#report' });

  expect(r.frameWidth, 'a 0-width frame reflows the whole clone').toBe(A4.width);
  expect(r.frameHeight).toBe(A4.height);
});

test('setPrintSize drives the frame size, including orientation', async ({ page }) => {
  const a5 = await probe(page, { target: '#report', setPrintSize: 'A5 landscape' });
  expect(a5.frameWidth, 'A5 landscape is 210mm wide').toBe(794);
  expect(a5.frameHeight, 'and 148mm tall').toBe(559);

  const letter = await probe(page, { target: '#report', setPrintSize: 'letter' });
  expect(letter.frameWidth).toBe(816);

  const explicit = await probe(page, { target: '#report', setPrintSize: '120mm 200mm' });
  expect(explicit.frameWidth).toBe(454);
});

test('the clone fills the sheet width instead of collapsing', async ({ page }) => {
  // the regression in numbers: at a zero-width viewport this clone measured
  // 5935px tall where the page itself is 4140px
  const r = await probe(page, { target: '#report', keepSourceCSS: true });

  expect(r.frameWidth).toBe(A4.width);
  // the target uses the paper it was given, give or take the body box
  expect(r.targetWidth).toBeGreaterThan(A4.width * 0.9);
  expect(r.targetWidth).toBeLessThanOrEqual(A4.width);
});

test('keepSourceCSS keeps the content and honours what the css hides', async ({ page }) => {
  const plain = await probe(page, { target: '#report' });
  const styled = await probe(page, { target: '#report', keepSourceCSS: true });

  // the dom carries the same content either way
  expect(styled.targetChars).toBe(plain.targetChars);

  // but the source css hides the display:none note, so less of it is *rendered*.
  // that difference is the feature working, not content being lost
  expect(styled.targetText).toBeLessThan(plain.targetText);
  expect(plain.targetText - styled.targetText, 'the hidden note, and only that').toBeLessThan(120);
});

test('a drawn region frames the content it was drawn over', async ({ page }) => {
  // The whole point, and the bug that started this file. A rectangle means
  // something only against the layout it was taken from, so the clip clone keeps
  // that layout instead of being re-flowed to paper width and landing elsewhere.
  const painted = await page.evaluate(async () => {
    const el = document.querySelector('#memo h2') as HTMLElement;
    const r = el.getBoundingClientRect();
    const rect = {
      x: Math.round(r.left + scrollX) - 8,
      y: Math.round(r.top + scrollY) - 8,
      width: 520,
      height: 220
    };

    let seen: { sourceWidth: number; texts: string[] } = { sourceWidth: 0, texts: [] };
    const pc = (window as unknown as { Printcraft: { print(o: unknown): Promise<unknown> } })
      .Printcraft;

    await pc.print({
      clipRect: rect,
      assetTimeout: 2000,
      hooks: {
        beforePrint(ctx: { window: Window; document: Document }) {
          const d = ctx.document;
          const vp = d.querySelector('.pc-clip-viewport') as HTMLElement;
          const box = vp.getBoundingClientRect();
          // innerText would report the whole clone: it ignores overflow clipping.
          // hit-testing reports what the window actually shows.
          const texts = new Set<string>();
          for (const fy of [0.1, 0.3, 0.5, 0.8]) {
            const hit = d.elementFromPoint(box.left + box.width * 0.5, box.top + box.height * fy);
            if (hit?.textContent) texts.add(hit.textContent.replace(/\s+/g, ' ').trim());
          }
          seen = { sourceWidth: ctx.window.innerWidth, texts: [...texts] };
          return false;
        }
      }
    });
    return seen;
  });

  expect(painted.sourceWidth, 'laid out at the width the region was drawn on').toBe(1280);

  const all = painted.texts.join(' | ');
  expect(all, 'the memo the rectangle covered').toContain('R. VELVET');
  expect(all, 'and not the masthead it used to show').not.toContain('ZERO DEPENDENCIES');
});

test('a region wider than the sheet is scaled down to fit it', async ({ page }) => {
  const style = await page.evaluate(async () => {
    let seen = '';
    const pc = (window as unknown as { Printcraft: { print(o: unknown): Promise<unknown> } })
      .Printcraft;
    await pc.print({
      clipRect: { x: 0, y: 0, width: 1200, height: 600 },
      assetTimeout: 2000,
      hooks: {
        beforePrint(ctx: { document: Document }) {
          const vp = ctx.document.querySelector('.pc-clip-viewport');
          const stage = ctx.document.querySelector('.pc-clip-stage');
          seen = (vp?.getAttribute('style') || '') + ' ~ ' + (stage?.getAttribute('style') || '');
          return false;
        }
      }
    });
    return seen;
  });

  // 794 / 1200 ≈ 0.66, so the printed box is ~794×397 and the stage carries the scale
  expect(style).toMatch(/width:79[0-9]px/);
  expect(style).toMatch(/transform:scale\(0\.66/);
});

/* the matrix ----------------------------------------------------------------- */

test('every option produces its artefact in the print document', async ({ page }) => {
  const results: Record<string, Probe> = {};
  const jobs: Record<string, Record<string, unknown>> = {
    plain: { target: '#report' },
    exposeLinks: { target: '#report', exposeLinkUrls: 'all' },
    exclude: { target: '#report', excludeSelectorList: ['.links', '.no-print'] },
    watermarkText: { target: '#report', watermarkText: 'DRAFT' },
    headerFooter: { target: '#report', headerText: 'H', footerText: 'F' },
    revealHidden: { target: '#report', revealHiddenElements: true },
    removeImages: { target: '#report', removeImages: true },
    printCanvas: { target: '#report', printCanvas: true },
    expandScroll: { target: '#report', extendScrollableAreas: true },
    injectStyle: { target: '#report', injectCustomStyle: 'h2{color:#e5007d}' },
    redact: { target: '#memo', redactSelectorList: ['.codename', '.routing'] },
    privacy: { target: '#memo', privacy: true },
    printerMarks: { target: '#report', printerMarks: true },
    annotations: { target: '#memo', annotations: [{ selector: '.codename', text: 'x' }] }
  };

  // sequential on purpose: each job mounts a frame in the same page, and running
  // them at once would have several print documents alive together
  // oxlint-disable-next-line no-await-in-loop
  for (const [name, opts] of Object.entries(jobs)) results[name] = await probe(page, opts);

  // nothing runs at a zero-width viewport, ever again
  for (const [name, r] of Object.entries(results)) {
    expect(r.frameWidth, `${name} frame width`).toBe(A4.width);
    expect(r.targetText, `${name} produced content`).toBeGreaterThan(0);
    expect(r.baseHref, `${name} carries a base href`).toBeTruthy();
  }

  expect(results['printerMarks']!.marks, 'four corner ticks').toBe(4);
  expect(results['plain']!.marks, 'and none without the option').toBe(0);

  expect(results['redact']!.redacted, 'two codenames and a routing line').toBe(3);
  expect(results['plain']!.redacted).toBe(0);

  expect(results['annotations']!.notes, 'two from options, one from the attribute').toBe(3);
  expect(results['watermarkText']!.watermark).toBe(1);
  expect(results['headerFooter']!.sheetTable, 'repeating header uses the table technique').toBe(1);
  expect(results['printCanvas']!.canvasPng, 'the live chart became a png').toBeGreaterThan(0);
  expect(results['removeImages']!.canvasPng, 'and is a placeholder when stripped').toBe(0);

  expect(results['exposeLinks']!.targetText).toBeGreaterThan(results['plain']!.targetText);
  expect(results['exclude']!.targetText).toBeLessThan(results['plain']!.targetText);
  expect(results['injectStyle']!.pageCss).toContain('#e5007d');

  const privacyText = results['privacy']!.targetText;
  expect(privacyText, 'the memo still prints, just blanked').toBeGreaterThan(0);
});

test('the inspector previews at true paper size, not panel size', async ({ page }) => {
  await page.evaluate(async () => {
    const pc = (window as unknown as { Printcraft: { inspect(o: unknown): Promise<unknown> } })
      .Printcraft;
    (window as unknown as { __ctl?: unknown }).__ctl = await pc.inspect({
      target: '#report',
      setPrintSize: 'A4',
      assetTimeout: 2000
    });
  });

  const frame = page.frames().find((f) => f.parentFrame() === page.mainFrame());
  const width = await frame!.evaluate(() => window.innerWidth);
  expect(width, 'the preview frame is the sheet').toBe(A4.width);

  await expect(page.locator('[data-pc-inspector]')).toContainText('A4');
  await page.evaluate(() => (window as unknown as { __ctl?: { close(): void } }).__ctl?.close());
});
