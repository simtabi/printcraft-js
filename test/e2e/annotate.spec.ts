// Drawing, remembering, and staying out of the host page's way.
//
// These three need a real browser for what they actually assert: pointer events
// that become shapes, localStorage surviving a reload, and a host stylesheet
// fighting the kit for the same class names.

import { expect, test, type Page } from '@playwright/test';

const DEMO = '/demo/index.html';

test.beforeEach(async ({ page }) => {
  await page.goto(DEMO);
  await expect(page.locator('#report')).toBeVisible();
});

/**
 * Opens the studio and drags across an element.
 *
 * The `draw` action loads the studio on demand, so its promise has to be awaited
 * before the pointer moves; without that the drag happens before anything is
 * listening for it.
 */
async function drawOn(page: Page, selector: string, tool = 'pen'): Promise<void> {
  await page.evaluate(async (t) => {
    const pc = (window as unknown as { Printcraft: Record<string, any> }).Printcraft;
    const studio = await pc.ui.run('annotate');
    studio.use(t);
    (window as unknown as { __studio: unknown }).__studio = studio;
  }, tool);

  // boundingBox is viewport-relative, so an element below the fold reports a
  // position the mouse cannot reach and the drag lands on the page background
  await page.locator(selector).scrollIntoViewIfNeeded();
  const box = (await page.locator(selector).boundingBox())!;
  await page.mouse.move(box.x + 12, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + 30, { steps: 8 });
  await page.mouse.move(box.x + 120, box.y + 20, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(80);
}

/** The demo ships with a redaction of its own; these tests want a blank slate. */
async function unmark(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.clear();
    for (const attr of ['note', 'redact', 'drawing']) {
      for (const el of document.querySelectorAll('[data-printcraft-' + attr + ']')) {
        el.removeAttribute('data-printcraft-' + attr);
      }
    }
  });
}

/* drawing ----------------------------------------------------------------- */

test('a drag becomes a vector overlay on the element it started on', async ({ page }) => {
  await unmark(page);
  await drawOn(page, '#report h2');

  const drawn = await page.evaluate(() => {
    const el = document.querySelector('[data-printcraft-drawing]');
    if (!el) return null;
    const svg = el.querySelector('svg.prjs-drawing');
    return {
      on: el.tagName.toLowerCase(),
      shapes: JSON.parse(el.getAttribute('data-printcraft-drawing')!).shapes.length,
      hasSvg: !!svg,
      viewBox: svg?.getAttribute('viewBox'),
      paths: svg?.querySelectorAll('path').length,
      // the overlay's own contents; the host may legitimately hold a chart
      canvasesInOverlay: svg?.querySelectorAll('canvas').length ?? 0,
      host: el.tagName.toLowerCase()
    };
  });

  expect(drawn, 'nothing was drawn').not.toBeNull();
  expect(drawn!.shapes).toBeGreaterThan(0);
  expect(drawn!.hasSvg).toBe(true);
  expect(drawn!.viewBox, 'coordinates are fractions of the element').toBe('0 0 100 100');
  expect(drawn!.paths).toBeGreaterThan(0);
  expect(drawn!.canvasesInOverlay, 'a canvas would print at screen resolution').toBe(0);
  expect(drawn!.host, 'a drawing on <html> could never print').not.toBe('html');
});

test('a drawing survives being resized, because it is stored as fractions', async ({ page }) => {
  await unmark(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await drawOn(page, '#report h2');

  const before = await page.evaluate(() =>
    document.querySelector('[data-printcraft-drawing]')!.getAttribute('data-printcraft-drawing')!
  );

  await page.setViewportSize({ width: 760, height: 800 });
  await page.waitForTimeout(120);

  const after = await page.evaluate(() => {
    const el = document.querySelector('[data-printcraft-drawing]')!;
    const svg = el.querySelector('svg.prjs-drawing')!;
    const box = svg.getBoundingClientRect();
    const host = el.getBoundingClientRect();
    return {
      data: el.getAttribute('data-printcraft-drawing')!,
      // the overlay still covers its host exactly
      fits: Math.abs(box.width - host.width) < 2 && Math.abs(box.height - host.height) < 2
    };
  });

  expect(after.data, 'the shapes do not change; the box they scale into does').toBe(before);
  expect(after.fits, 'the overlay came adrift from its element').toBe(true);
});

test('a drawing reaches the print copy, and only once', async ({ page }) => {
  await unmark(page);
  await drawOn(page, '#report h2');

  const printed = await page.evaluate(async () => {
    let html = '';
    const pc = (window as unknown as { Printcraft: Record<string, any> }).Printcraft;
    await pc.print({
      target: '#report',
      assetTimeout: 3000,
      hooks: {
        beforePrint(ctx: { document: Document }) {
          html = ctx.document.body.innerHTML;
          return false;
        }
      }
    });
    return html;
  });

  const overlays = printed.match(/class="prjs-drawing"/g) || [];
  expect(overlays.length, 'the drawing did not print').toBe(1);
  expect(printed, 'the printed copy must not be tagged as interface').not.toMatch(
    /class="prjs-drawing"[^>]*data-prjs-ui/
  );
});

test('a drawing is listed in the notes panel like any other mark', async ({ page }) => {
  await unmark(page);
  await drawOn(page, '#report h2');
  await page.evaluate(() => {
    void (window as unknown as { Printcraft: Record<string, any> }).Printcraft.ui.notes();
  });

  const panel = page.locator('[data-prjs-modal]');
  await expect(panel).toBeVisible();
  await expect(panel.locator('[data-prjs-mark-kind="drawing"]')).toHaveCount(1);
  await expect(panel.locator('.prjs-badge')).toContainText('drawing');
});

/* persistence ------------------------------------------------------------- */

test('marks are remembered across a reload when persistence is on', async ({ page }) => {
  await unmark(page);
  await page.evaluate(() => {
    const pc = (window as unknown as { Printcraft: Record<string, any> }).Printcraft;
    (window as any).__iface = pc.ui.create({ persist: true, contextMenu: false });
    document.querySelector('#report h2')!.setAttribute('data-printcraft-note', 'check the figures');
    document.querySelector('#report p')!.setAttribute('data-printcraft-redact', '');
  });
  // the observer coalesces writes, so give it its 250ms
  await page.waitForTimeout(600);

  await page.reload();
  await expect(page.locator('#report')).toBeVisible();

  const restored = await page.evaluate(async () => {
    // the demo ships one redaction in its own markup; drop it so the count is
    // the two this test made and nothing else
    for (const el of document.querySelectorAll('[data-printcraft-redact]')) {
      el.removeAttribute('data-printcraft-redact');
    }
    const pc = (window as unknown as { Printcraft: Record<string, any> }).Printcraft;
    const iface = pc.ui.create({ persist: true, contextMenu: false });
    const report = await iface.restored();
    return {
      restored: report.restored.length,
      lost: report.lost.length,
      note: document.querySelector('#report h2')?.getAttribute('data-printcraft-note'),
      redacted: !!document.querySelector('#report p[data-printcraft-redact]')
    };
  });

  expect(restored.restored).toBe(2);
  expect(restored.lost).toBe(0);
  expect(restored.note).toBe('check the figures');
  expect(restored.redacted).toBe(true);

  await page.evaluate(() => localStorage.clear());
});

test('nothing is written to storage unless persistence was asked for', async ({ page }) => {
  const keys = await page.evaluate(() => {
    localStorage.clear();
    const pc = (window as unknown as { Printcraft: Record<string, any> }).Printcraft;
    pc.ui.create({ contextMenu: false });
    document.querySelector('#report h2')!.setAttribute('data-printcraft-note', 'private');
    return Object.keys(localStorage).filter((k) => k.startsWith('printcraft:'));
  });
  await page.waitForTimeout(500);

  expect(keys, 'a redaction is exactly what somebody is trying to control').toEqual([]);
});

/* the host page ----------------------------------------------------------- */

test('a host page styling .btn, .modal and .card does not reach the kit', async ({ page }) => {
  // the reason the library mirrors daisyUI's tokens instead of shipping daisyUI:
  // these class names are global, and a host may already own them
  await page.addStyleTag({
    content: `
      .btn, .modal, .card, .input, .menu {
        all: unset !important;
        display: block !important;
        background: rebeccapurple !important;
        color: rebeccapurple !important;
        font-size: 40px !important;
      }
      img { max-width: 100% !important }
      button { border-radius: 0 !important; padding: 0 !important }
    `
  });

  await page.locator('h1').click({ button: 'right' });
  const menu = page.locator('[data-prjs-menu]');
  await expect(menu).toBeVisible();

  const seen = await page.evaluate(() => {
    const menuEl = document.querySelector('[data-prjs-menu]')!;
    const row = menuEl.querySelector('[data-prjs-item]')!;
    const cs = getComputedStyle(row);
    return {
      // ours are prefixed, so the host's rules cannot select them
      rowClasses: row.className,
      colour: cs.color,
      size: cs.fontSize,
      // and the host's own daisyUI button is untouched by us
      hostButton: getComputedStyle(document.querySelector('.btn')!).backgroundColor
    };
  });

  expect(seen.rowClasses, 'a kit row must not carry a global class name').not.toMatch(
    /\b(btn|modal|card|input|menu)\b/
  );
  expect(seen.colour, 'the host rule reached our menu row').not.toBe('rgb(102, 51, 153)');
  expect(seen.size).not.toBe('40px');
  expect(seen.hostButton, "and we did not restyle the host's").toBe('rgb(102, 51, 153)');
});

test('the kit and a host daisyUI theme keep their own tokens', async ({ page }) => {
  const tokens = await page.evaluate(() => {
    const host = document.createElement('div');
    host.className = 'prjs';
    document.body.appendChild(host);
    return {
      // the demo's own daisyUI theme
      page: getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim(),
      // the library's mirror of the same vocabulary
      kit: getComputedStyle(host).getPropertyValue('--prjs-color-primary').trim()
    };
  });

  expect(tokens.page, 'the demo theme did not load').toBeTruthy();
  expect(tokens.kit, 'the kit theme did not load').toBeTruthy();
  expect(tokens.kit, 'same names, separate namespaces').not.toBe(tokens.page);
});

/* the sheets -------------------------------------------------------------- */

test('a cover sheet and a notes sheet print around the content', async ({ page }) => {
  const printed = await page.evaluate(async () => {
    const pc = (window as unknown as { Printcraft: Record<string, any> }).Printcraft;
    document.querySelector('#report h2')!.setAttribute('data-printcraft-note', 'provisional');

    let html = '';
    await pc.print({
      target: '#report',
      assetTimeout: 3000,
      documentTitle: 'Quarterly production report',
      documentDescription: 'Prepared for the board.',
      coverPage: true,
      notesPage: true,
      printHeading: false,
      paginate: true,
      hooks: {
        beforePrint(ctx: { document: Document }) {
          html = ctx.document.body.innerHTML;
          return false;
        }
      }
    });
    return html;
  });

  expect(printed).toContain('prjs-cover');
  expect(printed).toContain('Quarterly production report');
  expect(printed).toContain('prjs-notes-page');
  expect(printed).toContain('provisional');
  expect(printed.indexOf('prjs-cover')).toBeLessThan(printed.indexOf('prjs-notes-page'));
});
