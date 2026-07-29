// Selecting an area of the page, and getting exactly that area on paper.
//
// The framing test is the one that matters. A region is chosen against the
// layout on screen, but at pagination time the browser re-evaluates media
// queries against the page box, so live markup is re-laid-out and the rectangle
// stops framing what it framed. Measured: a `min-width: 1000px` rule that makes a
// block 3000px tall yields one A4 page, not four.
//
// So capture mode rasterises the region at the layout it was selected against.
// These tests check the pixels, because pixels are the only honest evidence that
// what you picked is what prints.

import { expect, test, type Page } from '@playwright/test';

const DEMO = '/demo/index.html';

/** the four process inks across the top of the demo, left to right */
const INKS = [
  { at: 0.12, rgb: [0, 159, 227], name: 'cyan' },
  { at: 0.37, rgb: [229, 0, 125], name: 'magenta' },
  { at: 0.62, rgb: [255, 213, 0], name: 'yellow' },
  { at: 0.87, rgb: [23, 24, 27], name: 'key' }
];

async function captureSrc(page: Page, rect: Record<string, number>): Promise<string> {
  return page.evaluate(async (r) => {
    let src: string | null = null;
    const pc = (window as unknown as { Printcraft: { print(o: unknown): Promise<unknown> } })
      .Printcraft;
    await pc.print({
      clipRect: r,
      assetTimeout: 5000,
      hooks: {
        beforePrint(ctx: { document: Document }) {
          src = ctx.document.querySelector<HTMLImageElement>('img.pc-capture')?.src ?? null;
          return false;
        }
      }
    });
    if (!src) throw new Error('no capture was produced');
    return src;
  }, rect);
}

/** samples one pixel from a data URL, at a fraction across and down */
async function pixelAt(page: Page, src: string, fx: number, fy = 0.5): Promise<number[]> {
  return page.evaluate(
    async ({ src: url, fx: atX, fy: atY }) => {
      const img = new Image();
      img.src = url;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(
        Math.min(canvas.width - 1, Math.round(canvas.width * atX)),
        Math.min(canvas.height - 1, Math.round(canvas.height * atY)),
        1,
        1
      ).data;
      return [d[0]!, d[1]!, d[2]!];
    },
    { src, fx, fy }
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto(DEMO);
  await expect(page.locator('#tickets .pc-ticket').first()).toBeVisible();
});

/* what actually prints -------------------------------------------------- */

test('a captured region contains the pixels that were selected', async ({ page }) => {
  const rect = await page.evaluate(() => {
    const r = document.querySelector('.pc-rule')!.getBoundingClientRect();
    return {
      x: Math.round(r.left + scrollX),
      y: Math.round(r.top + scrollY),
      width: Math.round(r.width),
      height: Math.round(r.height)
    };
  });

  const src = await captureSrc(page, rect);

  // the four inks have to land where they were, in order. an earlier version
  // scaled the clone to fit the sheet and then scaled it again on capture, so
  // they were squeezed into the left 62% with white beside them
  for (const ink of INKS) {
    // oxlint-disable-next-line no-await-in-loop
    const [r, g, b] = await pixelAt(page, src, ink.at);
    const distance =
      Math.abs(r! - ink.rgb[0]!) + Math.abs(g! - ink.rgb[1]!) + Math.abs(b! - ink.rgb[2]!);
    expect(distance, `${ink.name} at ${ink.at * 100}%: got ${r},${g},${b}`).toBeLessThan(24);
  }
});

test('the capture is oversampled so text is not soft on paper', async ({ page }) => {
  const rect = { x: 0, y: 0, width: 400, height: 200 };
  const src = await captureSrc(page, rect);

  const size = await page.evaluate(async (s) => {
    const img = new Image();
    img.src = s;
    await img.decode();
    return { w: img.naturalWidth, h: img.naturalHeight };
  }, src);

  expect(size.w, '2x the selection').toBeGreaterThanOrEqual(800);
  expect(size.h).toBeGreaterThanOrEqual(400);
});

test('the print document never grows wider than the sheet', async ({ page }) => {
  const wide = await page.evaluate(async () => {
    let seen = { frameW: 0, scrollW: 0 };
    const pc = (window as unknown as { Printcraft: { print(o: unknown): Promise<unknown> } })
      .Printcraft;
    await pc.print({
      clipRect: { x: 0, y: 0, width: 1200, height: 500 },
      assetTimeout: 5000,
      hooks: {
        beforePrint(ctx: { window: Window; document: Document }) {
          seen = {
            frameW: ctx.window.innerWidth,
            scrollW: ctx.document.documentElement.scrollWidth
          };
          return false;
        }
      }
    });
    return seen;
  });

  // a document wider than the paper is what cropped the left edge off a print
  expect(wide.frameW).toBe(794);
  expect(wide.scrollW, 'a 1200px selection still fits A4').toBeLessThanOrEqual(794);
});

test('redaction is applied before the capture is taken', async ({ page }) => {
  // the raster must come off the transformed clone. photographing the live page
  // would put back everything redaction was asked to destroy.
  const src = await page.evaluate(async () => {
    const box = document.querySelector('#memo')!.getBoundingClientRect();
    let out: string | null = null;
    const pc = (window as unknown as { Printcraft: { print(o: unknown): Promise<unknown> } })
      .Printcraft;
    await pc.print({
      clipRect: {
        x: Math.round(box.left + scrollX),
        y: Math.round(box.top + scrollY),
        width: Math.round(box.width),
        height: 200
      },
      redactSelectorList: ['.codename', '.routing'],
      assetTimeout: 5000,
      hooks: {
        beforePrint(ctx: { document: Document }) {
          out = ctx.document.querySelector<HTMLImageElement>('img.pc-capture')?.src ?? null;
          return false;
        }
      }
    });
    return out;
  });

  expect(src).toBeTruthy();

  // a redacted run is painted solid black, so the image has to contain black
  const darkFraction = await page.evaluate(async (s) => {
    const img = new Image();
    img.src = s!;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let dark = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i]! < 40 && data[i + 1]! < 40 && data[i + 2]! < 40) dark++;
    }
    return dark / (canvas.width * canvas.height);
  }, src);

  expect(darkFraction, 'redaction bars are in the image').toBeGreaterThan(0.01);
});

/* the selection overlay -------------------------------------------------- */

async function openDraw(page: Page): Promise<void> {
  await page.evaluate(() => {
    const pc = (
      window as unknown as { Printcraft: { ui: { drawArea(o: unknown): Promise<unknown> } } }
    ).Printcraft;
    (window as unknown as { __drawn?: unknown }).__drawn = pc.ui.drawArea({});
  });
  await expect(page.locator('[data-pc-draw]')).toBeVisible();
}

async function dragBox(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down();
  await page.mouse.move(to[0], to[1], { steps: 6 });
  await page.mouse.up();
}

test('drawing gives a box with eight handles and live dimensions', async ({ page }) => {
  await openDraw(page);
  await dragBox(page, [200, 200], [600, 450]);

  await expect(page.locator('[data-pc-region]')).toBeVisible();
  await expect(page.locator('[data-pc-handle]')).toHaveCount(8);
  await expect(page.locator('[data-pc-dims]')).toContainText('400 × 250 px');
  await expect(page.locator('[data-pc-dims]'), 'and in millimetres').toContainText('mm');

  // releasing the mouse must not print anything: the selection is still editable
  await expect(page.locator('[data-pc-modal]')).toHaveCount(0);
  await expect(page.locator('[data-pc-draw]')).toBeVisible();
});

test('the box can be moved and resized after it is drawn', async ({ page }) => {
  await openDraw(page);
  await dragBox(page, [200, 200], [500, 400]);

  const boxOf = async (): Promise<{ x: number; y: number; w: number; h: number }> =>
    page.evaluate(() => {
      const r = document.querySelector('[data-pc-region]')!.getBoundingClientRect();
      return {
        x: Math.round(r.left),
        y: Math.round(r.top),
        w: Math.round(r.width),
        h: Math.round(r.height)
      };
    });

  const drawn = await boxOf();
  expect(drawn).toMatchObject({ x: 200, y: 200, w: 300, h: 200 });

  // drag from the middle to move it
  await dragBox(page, [350, 300], [400, 350]);
  const moved = await boxOf();
  expect(moved.x, 'moved right').toBe(250);
  expect(moved.y, 'moved down').toBe(250);
  expect(moved.w, 'and kept its size').toBe(300);

  // drag the south-east handle to resize
  const se = page.locator('[data-pc-handle="se"]');
  const grip = (await se.boundingBox())!;
  await dragBox(page, [grip.x + 6, grip.y + 6], [grip.x + 106, grip.y + 56]);
  const resized = await boxOf();
  expect(resized.w).toBe(400);
  expect(resized.h).toBe(250);
  expect(resized.x, 'the opposite corner stayed put').toBe(250);
});

test('arrow keys nudge, and alt+arrows resize', async ({ page }) => {
  await openDraw(page);
  await dragBox(page, [200, 200], [400, 350]);

  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  let box = await page.evaluate(() =>
    Math.round(document.querySelector('[data-pc-region]')!.getBoundingClientRect().left)
  );
  expect(box, 'one pixel per press').toBe(202);

  await page.keyboard.press('Shift+ArrowRight');
  box = await page.evaluate(() =>
    Math.round(document.querySelector('[data-pc-region]')!.getBoundingClientRect().left)
  );
  expect(box, 'ten with shift').toBe(212);

  await page.keyboard.press('Alt+ArrowDown');
  const height = await page.evaluate(() =>
    Math.round(document.querySelector('[data-pc-region]')!.getBoundingClientRect().height)
  );
  expect(height, 'alt grows instead of moving').toBe(151);
});

test('confirming asks for an optional title and description first', async ({ page }) => {
  await openDraw(page);
  await dragBox(page, [150, 250], [650, 550]);
  await page.locator('[data-pc-act="print"]').click();

  const modal = page.locator('[data-pc-modal]');
  await expect(modal).toBeVisible();
  await expect(modal.locator('.pc-k-title')).toHaveText('Print this area?');
  await expect(modal.locator('.pc-k-sub'), 'the size, in both units').toContainText('500 × 300 px');
  await expect(modal.locator('#pc-f-title')).toBeVisible();
  await expect(modal.locator('#pc-f-description')).toBeVisible();
  // `toBeVisible` is too weak on its own: the broken preview was a real element
  // at 77×54 with the content pushed outside it, and passed. The preview tests
  // below check the pixels.
  await expect(modal.locator('img'), 'a preview of what will print').toBeVisible();

  // both captions are optional, so the primary action works with them empty
  await expect(modal.locator('[data-pc-action="print"]')).toBeEnabled();
});

test('keep adjusting returns to the selection with the box intact', async ({ page }) => {
  await openDraw(page);
  await dragBox(page, [200, 200], [500, 400]);
  await page.locator('[data-pc-act="print"]').click();
  await page.locator('[data-pc-action="back"]').click();

  await expect(page.locator('[data-pc-modal]')).toHaveCount(0);
  await expect(page.locator('[data-pc-draw]')).toBeVisible();
  const box = await page.evaluate(() => {
    const r = document.querySelector('[data-pc-region]')!.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });
  expect(box, 'still the box that was drawn').toMatchObject({ w: 300, h: 200 });
});

test('escape and cancel both leave the page untouched', async ({ page }) => {
  await openDraw(page);
  await dragBox(page, [200, 200], [400, 300]);
  await page.keyboard.press('Escape');

  await expect(page.locator('[data-pc-draw]')).toHaveCount(0);
  await expect(page.locator('[data-pc-toolbar]')).toHaveCount(0);
  const result = await page.evaluate(
    () => (window as unknown as { __drawn: Promise<{ action: string }> }).__drawn
  );
  expect(result).toMatchObject({ action: 'cancel' });

  await openDraw(page);
  await page.locator('[data-pc-act="cancel"]').click();
  await expect(page.locator('[data-pc-draw]')).toHaveCount(0);
});

test('a selection too small to be useful cannot be confirmed', async ({ page }) => {
  await openDraw(page);
  await dragBox(page, [300, 300], [308, 306]);

  await expect(page.locator('[data-pc-act="print"]')).toBeDisabled();
  await expect(page.locator('[data-pc-toolbar]')).toContainText('Too small');
});

/* the preview ----------------------------------------------------------- */
//
// The preview used to render nothing. The raster was fine, a 1280×900 PNG with
// no errors, but the `<img>` showing it laid out at 77×54, because the demo's
// `img { max-width: 100% }` sized it to its container before the transform that
// was supposed to position it, and the negative offsets then put what was left
// outside the box. It is now a crop, so there is no arithmetic to invalidate,
// and the kit re-states the styles it depends on so a host reset cannot reach in.

interface Preview {
  natural: [number, number];
  rendered: [number, number];
  /** distinct colours across a sampled grid: 1 means the image is flat */
  colours: number;
  notice: boolean;
}

async function readPreview(page: Page): Promise<Preview> {
  return page.evaluate(() => {
    const modal = document.querySelector('[data-pc-modal]')!;
    const img = modal.querySelector<HTMLImageElement>('.pc-k-body img')!;
    const box = img.getBoundingClientRect();

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);

    const seen = new Set<string>();
    for (let y = 0; y < canvas.height; y += 8) {
      for (let x = 0; x < canvas.width; x += 8) {
        const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
        seen.add(`${r},${g},${b}`);
      }
    }

    return {
      natural: [img.naturalWidth, img.naturalHeight] as [number, number],
      rendered: [Math.round(box.width), Math.round(box.height)] as [number, number],
      colours: seen.size,
      notice: /looks empty/.test(modal.textContent || '')
    };
  });
}

test('the preview is the region itself, at a size you can see', async ({ page }) => {
  await openDraw(page);
  await dragBox(page, [180, 200], [780, 620]);
  await page.locator('[data-pc-act="print"]').click();
  await expect(page.locator('[data-pc-modal]')).toBeVisible();

  const preview = await readPreview(page);

  // the image *is* the selection, not the viewport with a window over it
  expect(preview.natural).toEqual([600, 420]);
  // and it is laid out at a size a person can read, which is what was broken
  expect(preview.rendered[0]).toBeGreaterThan(100);
  expect(preview.rendered[1]).toBeGreaterThan(40);
  // aspect ratio survives the fit
  expect(preview.rendered[0] / preview.rendered[1]).toBeCloseTo(600 / 420, 1);
  // and it has content, rather than being a flat grey box
  expect(preview.colours, 'the preview drew something').toBeGreaterThan(5);
  expect(preview.notice).toBe(false);
});

test('a host stylesheet that resets images cannot break the preview', async ({ page }) => {
  // Tailwind preflight, Bootstrap reboot and normalize all rewrite these. The
  // kit renders into the host document, so they reach it.
  await page.addStyleTag({
    content: `
      img, svg, canvas, video { max-width: 100%; height: auto; display: block; }
      img { width: 100%; }
      button, input, select, textarea { font: inherit; margin: 0; }
      input[type="checkbox"] { position: absolute; opacity: 0; width: 1px; height: 1px; }
      p, h1, h2, h3 { margin: 0; font-size: inherit; }
    `
  });

  await openDraw(page);
  await dragBox(page, [180, 200], [780, 620]);
  await page.locator('[data-pc-act="print"]').click();
  await expect(page.locator('[data-pc-modal]')).toBeVisible();

  const preview = await readPreview(page);
  expect(preview.natural).toEqual([600, 420]);
  expect(preview.rendered[0]).toBeGreaterThan(100);
  expect(preview.colours).toBeGreaterThan(5);

  // the form controls the host tried to hide are still operable
  const modal = page.locator('[data-pc-modal]');
  await modal.locator('#pc-f-title').fill('Survived');
  await expect(modal.locator('#pc-f-title')).toHaveValue('Survived');
  await expect(modal.locator('[data-pc-action="print"]')).toBeEnabled();
});

test('a selection with nothing in it says so instead of printing blank', async ({ page }) => {
  await page.evaluate(() => {
    const gap = document.createElement('div');
    gap.id = 'blank-gap';
    gap.style.cssText = 'height:600px;background:#fff;';
    document.body.prepend(gap);
    window.scrollTo(0, 0);
  });

  await openDraw(page);
  await dragBox(page, [200, 120], [700, 480]);
  await page.locator('[data-pc-act="print"]').click();
  await expect(page.locator('[data-pc-modal]')).toBeVisible();

  const preview = await readPreview(page);
  expect(preview.colours, 'nothing but background').toBe(1);
  expect(preview.notice, 'and the dialog says so').toBe(true);

  // the way out is offered rather than the job silently producing a blank page
  await expect(page.locator('[data-pc-action="back"]')).toBeVisible();
});
