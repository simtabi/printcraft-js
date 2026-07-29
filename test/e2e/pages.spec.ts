// Real pages, and the dialog that configures them.
//
// Browsers do not implement the Paged Media margin boxes that `counter(page)`
// would need, and neither the fixed-position nor the thead/tfoot technique can
// count pages. "Page 3 of 12" only exists if we measure the content and split it
// into sheets, which is what these check.

import { expect, test, type Page } from '@playwright/test';

const DEMO = '/demo/index.html';
const A4 = { width: 794, height: 1123 };

interface Paginated {
  pages: number;
  numbers: string[];
  headers: string[];
  overflowing: number;
  text: number;
  sheetWidth: number;
  sheetHeight: number;
  borderWidth: string;
  padding: string;
  css: string;
}

async function paginate(page: Page, options: Record<string, unknown>): Promise<Paginated> {
  return page.evaluate(async (opts) => {
    let seen = {} as Paginated;
    const pc = (window as unknown as { Printcraft: { print(o: unknown): Promise<unknown> } })
      .Printcraft;

    await pc.print({
      target: 'body',
      assetTimeout: 5000,
      ...opts,
      hooks: {
        beforePrint(ctx: { document: Document }) {
          const d = ctx.document;
          const sheets = [...d.querySelectorAll<HTMLElement>('.pc-page-sheet')];
          const first = sheets[0];
          const inner = first?.querySelector('.pc-page-inner');

          seen = {
            pages: sheets.length,
            numbers: [...d.querySelectorAll('[data-pc-page-number]')].map(
              (n) => n.textContent || ''
            ),
            headers: [...d.querySelectorAll('[data-pc-band="header"]')].map(
              (n) => n.textContent || ''
            ),
            overflowing: sheets.filter((s) => {
              const c = s.querySelector('.pc-page-content')!;
              return c.scrollHeight > c.clientHeight + 4;
            }).length,
            text: (d.querySelector('.pc-pages') as HTMLElement)?.innerText.length ?? 0,
            sheetWidth: first ? Math.round(first.getBoundingClientRect().width) : 0,
            sheetHeight: first ? Math.round(first.getBoundingClientRect().height) : 0,
            borderWidth: inner ? getComputedStyle(inner).borderTopWidth : '',
            padding: inner ? getComputedStyle(inner).paddingTop : '',
            css: [...d.querySelectorAll('style')].map((s) => s.textContent).join('\n')
          };
          return false;
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

/* pagination ------------------------------------------------------------ */

test('a long document becomes numbered sheets with nothing left over', async ({ page }) => {
  const onScreen = await page.evaluate(() => document.body.innerText.length);
  const r = await paginate(page, { paginate: true, pageNumbers: true, pageMargin: '10mm' });

  expect(r.pages, 'the demo is several pages long').toBeGreaterThan(2);
  expect(r.numbers[0]).toBe('Page 1 of ' + r.pages);
  expect(r.numbers[r.numbers.length - 1]).toBe(`Page ${r.pages} of ${r.pages}`);
  expect(r.numbers, 'every sheet is numbered').toHaveLength(r.pages);

  // the split has to be honest: no sheet may overflow, and no text may vanish
  expect(r.overflowing, 'no sheet spills past its content box').toBe(0);
  expect(r.text, 'all the text survived the split').toBeGreaterThan(onScreen * 0.85);
});

test('the sheet is the paper, with the border and padding asked for', async ({ page }) => {
  const r = await paginate(page, {
    paginate: true,
    pageMargin: '8mm',
    pagePadding: '14mm',
    pageBorder: { width: '2px', style: 'dashed', color: '#e5007d' }
  });

  expect(r.sheetWidth).toBe(A4.width);
  expect(r.sheetHeight).toBeGreaterThanOrEqual(A4.height);
  expect(r.borderWidth).toBe('2px');
  // 14mm at 96dpi
  expect(Math.round(parseFloat(r.padding))).toBe(53);
  expect(r.css).toContain('#e5007d');
});

test('pagination takes the page margin so the browser cannot print into it', async ({ page }) => {
  // the date, title, URL and page count the browser draws live in the @page
  // margin box. leaving no margin leaves nowhere to draw them.
  const r = await paginate(page, { paginate: true, pageMargin: '12mm' });
  expect(r.css).toMatch(/@page \{[^}]*margin: 0/);
});

test('hideBrowserHeaderFooter works without pagination too', async ({ page }) => {
  const r = await paginate(page, {
    target: '#report',
    hideBrowserHeaderFooter: true,
    pageMargin: '18mm'
  });

  expect(r.css).toMatch(/@page \{[^}]*margin: 0/);
  // the margin has to go somewhere, or the layout changes as well as the chrome
  expect(r.css).toMatch(/body \{ padding: 18mm/);
});

test('page numbers can be formatted, positioned and started anywhere', async ({ page }) => {
  const r = await paginate(page, {
    paginate: true,
    documentTitle: 'Quarterly report',
    pageNumbers: {
      template: '{title} — {page}/{pages}',
      position: 'top-right',
      startAt: 4
    }
  });

  expect(r.numbers[0]).toBe(`Quarterly report — 4/${r.pages}`);
  expect(r.headers[0], 'top-* positions put the number in the header band').toContain('4/');
});

test('hideOnFirst leaves the cover page unnumbered', async ({ page }) => {
  const r = await paginate(page, {
    paginate: true,
    pageNumbers: { hideOnFirst: true }
  });

  expect(r.numbers).toHaveLength(r.pages - 1);
  expect(r.numbers[0]).toBe('Page 2 of ' + r.pages);
});

test('a running header repeats on every sheet', async ({ page }) => {
  const r = await paginate(page, { paginate: true, pageHeader: 'ACME · {page}' });

  expect(r.headers).toHaveLength(r.pages);
  expect(r.headers[0]).toBe('ACME · 1');
  expect(r.headers[1]).toBe('ACME · 2');
});

test('an explicit break starts a new sheet', async ({ page }) => {
  await page.evaluate(() => {
    document.querySelector('#memo')!.setAttribute('data-printcraft-break-before', '');
  });
  const r = await paginate(page, { paginate: true, pageNumbers: true });

  const memoPage = await page.evaluate(async () => {
    let at = -1;
    const pc = (window as unknown as { Printcraft: { print(o: unknown): Promise<unknown> } })
      .Printcraft;
    await pc.print({
      target: 'body',
      paginate: true,
      assetTimeout: 5000,
      hooks: {
        beforePrint(ctx: { document: Document }) {
          const sheets = [...ctx.document.querySelectorAll('.pc-page-sheet')];
          at = sheets.findIndex((s) => s.querySelector('#memo'));
          const content = sheets[at]?.querySelector('.pc-page-content');
          // the memo has to be the first thing on its sheet
          at = content?.firstElementChild?.querySelector('#memo') ? at : -1;
          return false;
        }
      }
    });
    return at;
  });

  expect(r.pages).toBeGreaterThan(1);
  expect(memoPage, 'the marked section opens a sheet').toBeGreaterThan(-1);
});

/* the settings dialog ---------------------------------------------------- */

async function openDialog(page: Page): Promise<void> {
  await page.evaluate(() => {
    const pc = (
      window as unknown as {
        Printcraft: { ui: { printDialog(o: unknown): Promise<unknown> } };
      }
    ).Printcraft;
    (window as unknown as { __dlg?: unknown }).__dlg = pc.ui.printDialog({ target: '#report' });
  });
  await expect(page.locator('[data-pc-modal]')).toBeVisible();
}

test('the dialog offers paper, margins, pages, content and privacy', async ({ page }) => {
  await openDialog(page);
  const modal = page.locator('[data-pc-modal]');

  await expect(modal.locator('.pc-k-title')).toHaveText('Print settings');
  await expect(modal.locator('#pc-f-paper')).toBeVisible();
  await expect(modal.locator('#pc-f-margin')).toBeVisible();
  await expect(modal.locator('#pc-f-paginate')).toBeVisible();
  await expect(modal.locator('#pc-f-privacy')).toBeVisible();
  await expect(modal.locator('#pc-f-hideBrowserChrome')).toBeChecked();

  // page furniture stays out of the way until pagination is switched on
  await expect(modal.locator('#pc-f-numberTemplate')).toBeHidden();
  await modal.locator('#pc-f-paginate').check();
  await modal.locator('#pc-f-pageNumbers').check();
  await expect(modal.locator('#pc-f-numberTemplate')).toBeVisible();
  await expect(modal.locator('#pc-f-numberPosition')).toBeVisible();
});

test('preview renders the settings without touching the printer', async ({ page }) => {
  await openDialog(page);
  const modal = page.locator('[data-pc-modal]');

  await modal.locator('#pc-f-title').fill('Quarterly report');
  await modal.locator('#pc-f-paginate').check();
  await modal.locator('#pc-f-pageNumbers').check();
  await modal.locator('#pc-f-numberTemplate').fill('Sheet {page}/{pages} — {title}');
  await modal.locator('#pc-f-border').check();
  await modal.locator('[data-pc-action="preview"]').click();

  await expect(page.locator('[data-pc-inspector]')).toBeVisible();
  const frame = page.frames().find((f) => f.parentFrame() === page.mainFrame())!;

  await expect(frame.locator('.pc-page-sheet').first()).toBeAttached();
  const label = await frame.locator('[data-pc-page-number]').first().textContent();
  expect(label).toMatch(/^Sheet 1\/\d+ — Quarterly report$/);
  await expect(frame.locator('.pc-page-inner').first()).toHaveCSS('border-top-style', 'solid');
});

test('an invalid length is rejected before anything prints', async ({ page }) => {
  await openDialog(page);
  const modal = page.locator('[data-pc-modal]');

  await modal.locator('#pc-f-margin').fill('quite a lot');
  await modal.locator('[data-pc-action="print"]').click();

  await expect(modal, 'still open').toBeVisible();
  // the error belongs to the field that has it, not to whichever slot is first
  await expect(modal.locator('.pc-k-field:has(#pc-f-margin) .pc-k-error')).toContainText(
    'css length'
  );
  await expect(modal.locator('#pc-f-margin')).toHaveAttribute('aria-invalid', 'true');
});

test('cancel changes nothing', async ({ page }) => {
  await openDialog(page);
  await page.locator('[data-pc-action="cancel"]').click();

  await expect(page.locator('[data-pc-modal]')).toHaveCount(0);
  const result = await page.evaluate(
    () => (window as unknown as { __dlg: Promise<{ action: string }> }).__dlg
  );
  expect(result).toMatchObject({ action: 'cancel' });
});

/* watermarks ------------------------------------------------------------- */
//
// The old watermark was one `position: fixed` element on the body: measured at
// 794×1123 in a 5089px document, so it marked page one and stopped, and under
// pagination it sat outside the sheets entirely — six sheets, one mark.
//
// It is now built into each sheet as a real `<svg>` or `<img>`. That matters
// beyond neatness: a mark drawn as a CSS background depends on
// `print-color-adjust: exact` being honoured, and disappears where it is not.
// Rendered to PDF and back, a background mark vanishes under
// `print-color-adjust: economy` while this one still prints.

interface Marks {
  sheets: number;
  layers: number;
  marks: number;
  perSheet: number[];
  tagName: string;
  position: string;
  opacity: string;
  markWidth: number;
  backgroundImage: string;
}

async function watermarked(page: Page, options: Record<string, unknown>): Promise<Marks> {
  return page.evaluate(async (opts) => {
    let seen = {} as Marks;
    const pc = (window as unknown as { Printcraft: { print(o: unknown): Promise<unknown> } })
      .Printcraft;

    await pc.print({
      target: 'body',
      assetTimeout: 5000,
      ...opts,
      hooks: {
        beforePrint(ctx: { document: Document }) {
          const d = ctx.document;
          const sheets = [...d.querySelectorAll('.pc-page-sheet')];
          const layers = [...d.querySelectorAll<HTMLElement>('.pc-watermark')];
          const mark = d.querySelector<HTMLElement>('.pc-watermark svg, .pc-watermark img');

          seen = {
            sheets: sheets.length,
            layers: layers.length,
            marks: d.querySelectorAll('.pc-watermark svg, .pc-watermark img').length,
            perSheet: sheets.map(
              (s) => s.querySelectorAll('.pc-watermark svg, .pc-watermark img').length
            ),
            tagName: mark?.tagName.toLowerCase() ?? '',
            position: layers[0] ? getComputedStyle(layers[0]).position : '',
            opacity: layers[0] ? getComputedStyle(layers[0]).opacity : '',
            markWidth: mark ? Math.round(mark.getBoundingClientRect().width) : 0,
            backgroundImage: layers[0] ? getComputedStyle(layers[0]).backgroundImage : ''
          };
          return false;
        }
      }
    });
    return seen;
  }, options);
}

test('a repeating watermark marks every sheet, not just the first', async ({ page }) => {
  const r = await watermarked(page, {
    watermark: { text: 'CONFIDENTIAL', repeat: 'every-page' }
  });

  expect(r.sheets, 'asking to repeat laid the content out as sheets').toBeGreaterThan(2);
  expect(r.layers, 'one layer per sheet').toBe(r.sheets);
  expect(
    r.perSheet.every((n) => n === 1),
    `marks per sheet: ${r.perSheet}`
  ).toBe(true);
  expect(r.position, 'positioned against its sheet, not the page box').toBe('absolute');
});

test('the mark is an element, so it does not depend on background printing', async ({ page }) => {
  const r = await watermarked(page, { watermark: { text: 'DRAFT', repeat: 'every-page' } });

  // this is the property that makes it survive "Background graphics" being off
  // and `print-color-adjust` being ignored: it is content, not decoration
  expect(r.tagName).toBe('svg');
  expect(r.backgroundImage, 'nothing is drawn as a background').toBe('none');
});

test('a first-page watermark stays fixed and leaves the layout alone', async ({ page }) => {
  const r = await watermarked(page, { watermark: 'DRAFT' });

  expect(r.sheets, 'no pagination was asked for and none happened').toBe(0);
  expect(r.layers).toBe(1);
  expect(r.position).toBe('fixed');
});

test('tiling covers each sheet', async ({ page }) => {
  const r = await watermarked(page, {
    watermark: { text: 'COPY', repeat: 'tile', size: '20%' }
  });

  expect(r.sheets).toBeGreaterThan(2);
  expect(
    r.perSheet.every((n) => n > 20),
    `marks per sheet: ${r.perSheet}`
  ).toBe(true);
  // every sheet gets the same grid, so a page is never half covered
  expect(new Set(r.perSheet).size).toBe(1);
});

test('size, opacity and position are honoured', async ({ page }) => {
  const r = await watermarked(page, {
    watermark: {
      text: 'VOID',
      repeat: 'every-page',
      size: '25%',
      rotate: 0,
      opacity: 0.6,
      position: 'bottom-right'
    }
  });

  // 25% of the 794px A4 sheet, unrotated so the box is the mark
  expect(r.markWidth).toBe(199);
  expect(r.opacity).toBe('0.6');
});

test('the old flat options still print', async ({ page }) => {
  const r = await watermarked(page, { watermarkText: 'LEGACY', watermarkOpacity: 0.4 });

  expect(r.layers).toBe(1);
  expect(r.tagName).toBe('svg');
  expect(r.opacity).toBe('0.4');
});
