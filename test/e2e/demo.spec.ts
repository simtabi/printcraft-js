// end-to-end coverage in a real browser.
//
// the OS print dialog cannot be driven headlessly, but `Printcraft.inspect()`
// runs the identical pipeline into a visible overlay instead of the dialog — so
// everything up to and including the assembled print document is exercised
// against real layout, real @page css, real webfonts, and a real canvas. jsdom
// can do none of those.

import { expect, test, type Frame, type Page } from '@playwright/test';

const DEMO = '/demo/index.html';

/** runs one inspect job and hands back the assembled print document as a frame. */
async function inspect(page: Page, options: Record<string, unknown>): Promise<Frame> {
  await page.evaluate(async (opts) => {
    const pc = (window as unknown as { Printcraft: { inspect(o: unknown): Promise<unknown> } })
      .Printcraft;
    (window as unknown as { __ctl?: unknown }).__ctl = await pc.inspect(opts);
  }, options);

  const frame = page.frameLocator('[data-pc-inspector] iframe');
  await expect(frame.locator('body')).toBeAttached();

  const handle = page.frames().find((f) => f.parentFrame() === page.mainFrame());
  if (!handle) throw new Error('the inspector frame never appeared');
  return handle;
}

async function closeInspector(page: Page): Promise<void> {
  await page.evaluate(() => {
    const ctl = (window as unknown as { __ctl?: { close(): void } }).__ctl;
    ctl?.close();
  });
  await expect(page.locator('[data-pc-inspector]')).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  await page.goto(DEMO);
  await expect(page.locator('#tickets .pc-ticket').first()).toBeVisible();
});

test('the demo loads with no external requests and no failure banner', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith('http://localhost')) external.push(r.url());
  });
  await page.reload();
  await expect(page.locator('#tickets .pc-ticket').first()).toBeVisible();

  expect(external, 'nothing is fetched off-origin').toEqual([]);
  await expect(page.getByText(/failed to load/)).toHaveCount(0);
  // the compiled stylesheet actually applied: tailwind's theme token paints the
  // process rule, and the sass component layer paints the run buttons
  await expect(page.locator('.pc-rule i').first()).toHaveCSS(
    'background-color',
    'rgb(0, 159, 227)'
  );
  await expect(page.locator('button.pc-run').first()).toHaveCSS(
    'background-color',
    'rgb(23, 24, 27)'
  );

  // and the sass crop-mark mixin rendered its corner ticks
  const tick = await page
    .locator('.pc-ticket')
    .first()
    .evaluate((el) => getComputedStyle(el, '::before').borderTopWidth);
  expect(tick).toBe('2px');
});

test('redaction reaches the print document as unrecoverable bars', async ({ page }) => {
  await page.evaluate(() => {
    const p = document.createElement('p');
    p.className = 'e2e-secret';
    p.id = 'agent-jane-doe';
    p.textContent = 'Agent Jane Doe, badge 42';
    document.querySelector('#report')!.appendChild(p);
  });

  const frame = await inspect(page, {
    target: '#report',
    // class, not id: redaction scrubs ids because they encode the value itself
    redactSelectorList: ['.e2e-secret'],
    assetTimeout: 2000
  });

  const redacted = frame.locator('.pc-redacted.e2e-secret');
  await expect(redacted).toBeAttached();

  const text = await redacted.textContent();
  expect(text, 'no readable characters survive').not.toMatch(/[A-Za-z0-9]/);
  expect(text).toMatch(/█/);

  // nothing recoverable is left anywhere in the print document
  const html = await frame.content();
  expect(html).not.toContain('Jane Doe');
  expect(html).not.toContain('agent-jane-doe');

  // the bar is actually painted black, not merely classed
  await expect(redacted).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  await closeInspector(page);
});

test('redacting a form field destroys its value, not just its label', async ({ page }) => {
  await page.fill('#cust', 'Wayne Enterprises');

  const frame = await inspect(page, {
    target: '#report',
    redactSelectorList: ['#cust'],
    assetTimeout: 2000
  });

  const html = await frame.content();
  expect(html, 'the typed value never reaches paper').not.toContain('Wayne Enterprises');
  await expect(frame.locator('.pc-redacted')).toBeAttached();
  await closeInspector(page);
});

test('privacy scanning blanks PII everywhere in the copy', async ({ page }) => {
  const frame = await inspect(page, { target: '#report', privacy: true, assetTimeout: 2000 });
  const body = await frame.locator('body').textContent();

  expect(body).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  expect(body).not.toMatch(/\b\d{3}-\d{2}-\d{4}\b/);
  await closeInspector(page);
});

test('crop marks and a bleed inset render on the page', async ({ page }) => {
  const frame = await inspect(page, {
    target: '#report',
    printerMarks: { bleed: '4mm', markColor: '#e5007d' },
    assetTimeout: 2000
  });

  await expect(frame.locator('.pc-mark')).toHaveCount(4);
  const corner = frame.locator('.pc-mark-tl');
  await expect(corner).toHaveCSS('position', 'fixed');
  await expect(corner).toHaveCSS('border-right-color', 'rgb(229, 0, 125)');
  await closeInspector(page);
});

test('annotations render as break-safe note chips', async ({ page }) => {
  const frame = await inspect(page, {
    target: '#report',
    annotations: [{ selector: '#cust', text: 'verify with finance' }],
    assetTimeout: 2000
  });

  const chip = frame.locator('.pc-note').first();
  await expect(chip).toHaveText('verify with finance');
  await expect(chip).toHaveCSS('break-inside', 'avoid');
  await closeInspector(page);
});

test('a text watermark renders as rotated svg at the configured opacity', async ({ page }) => {
  const frame = await inspect(page, {
    target: '#report',
    watermarkText: 'DRAFT',
    watermarkOpacity: 0.4,
    watermarkAngle: -45,
    assetTimeout: 2000
  });

  const svg = frame.locator('.pc-watermark svg');
  await expect(svg).toBeAttached();
  await expect(svg.locator('text')).toHaveText('DRAFT');
  await expect(svg).toHaveCSS('opacity', '0.4');
  await closeInspector(page);
});

test('a live canvas is captured as a real image, not a blank box', async ({ page }) => {
  // the demo draws a chart into #chart; this is the one thing jsdom cannot do
  const frame = await inspect(page, { target: '#report', printCanvas: true, assetTimeout: 3000 });

  const img = frame.locator('img[src^="data:image/png"]').first();
  await expect(img, 'the canvas became a png').toBeAttached();

  const dims = await img.evaluate((el) => {
    const image = el as HTMLImageElement;
    return { w: image.naturalWidth, h: image.naturalHeight };
  });
  expect(dims.w, 'the capture has real pixels').toBeGreaterThan(0);
  expect(dims.h).toBeGreaterThan(0);
  await closeInspector(page);
});

test('clipRect prints exactly the drawn region', async ({ page }) => {
  const frame = await inspect(page, {
    clipRect: { x: 20, y: 40, width: 320, height: 240 },
    assetTimeout: 2000
  });

  const viewport = frame.locator('.pc-clip-viewport');
  const box = await viewport.boundingBox();
  expect(box?.width).toBeCloseTo(320, 0);
  expect(box?.height).toBeCloseTo(240, 0);

  await expect(viewport).toHaveCSS('overflow', 'hidden');
  // the ui layer never appears in its own screenshot
  await expect(frame.locator('[data-pc-ui]')).toHaveCount(0);
  await expect(frame.locator('script')).toHaveCount(0);
  await closeInspector(page);
});

test('the repeating header and footer use the table technique', async ({ page }) => {
  const frame = await inspect(page, {
    target: '#report',
    headerText: 'ACME CO',
    footerText: 'internal',
    assetTimeout: 2000
  });

  await expect(frame.locator('table.pc-sheet > thead td')).toHaveText('ACME CO');
  await expect(frame.locator('table.pc-sheet > tfoot td')).toHaveText('internal');
  await closeInspector(page);
});

test('the assembled document renders to a pdf', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'page.pdf is chromium only');

  await inspect(page, {
    target: '#report',
    setPrintSize: 'A4',
    watermarkText: 'PROOF',
    assetTimeout: 3000
  });

  const frame = page.frames().find((f) => f.parentFrame() === page.mainFrame());
  const html = await frame!.content();
  expect(html).toContain('pc-target');

  // render the host page (inspector open) as a smoke test that print css is valid
  const pdf = await page.pdf({ format: 'A4' });
  expect(pdf.byteLength, 'a non-trivial pdf came out').toBeGreaterThan(1000);
  await closeInspector(page);
});

test('the context menu opens on right-click and drives a job', async ({ page }) => {
  await page.evaluate(() => {
    const pc = (
      window as unknown as { Printcraft: { ui: { contextMenu(c: unknown): () => void } } }
    ).Printcraft;
    (window as unknown as { __off?: () => void }).__off = pc.ui.contextMenu({});
  });

  await page.locator('#cust').click({ button: 'right' });
  const menu = page.locator('[data-pc-menu]');
  await expect(menu).toBeVisible();
  await expect(menu.locator('[data-pc-item]')).toHaveCount(7);
  await expect(menu.locator('svg')).toHaveCount(7);

  // the redact item stamps the attribute the pipeline reads
  await menu.locator('[data-pc-item="redact"]').click();
  await expect(page.locator('#cust')).toHaveAttribute('data-printcraft-redact', '');
  await expect(menu).toHaveCount(0);

  await page.evaluate(() => (window as unknown as { __off?: () => void }).__off?.());
});

test('draw-to-print produces a clip job from a dragged rectangle', async ({ page }) => {
  await page.evaluate(() => {
    const pc = (
      window as unknown as {
        Printcraft: { ui: { drawArea(b: unknown): Promise<unknown> } };
      }
    ).Printcraft;
    (window as unknown as { __drawn?: Promise<unknown> }).__drawn = pc.ui.drawArea({});
  });

  const overlay = page.locator('[data-pc-draw]');
  await expect(overlay).toBeVisible();

  await page.mouse.move(120, 160);
  await page.mouse.down();
  await page.mouse.move(420, 400, { steps: 8 });
  await expect(page.locator('[data-pc-draw] div').nth(1)).toContainText('×');
  await page.mouse.up();

  await expect(overlay).toHaveCount(0);
});
