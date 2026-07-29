// Redacting by dragging a box over the page.
//
// Selectors need the markup; a person reading a document has a phrase. So a
// rectangle resolves to the characters it actually covers, which needs real
// layout, and `Range.getClientRects` is the whole mechanism, which jsdom has none of
// it. These are the tests that can only run in a browser.

import { expect, test, type Page } from '@playwright/test';

const DEMO = '/demo/index.html';
const BLOCK = '█';

test.beforeEach(async ({ page }) => {
  await page.goto(DEMO);
  await expect(page.locator('#tickets .prjs-ticket').first()).toBeVisible();

  // a known paragraph with known text, so the character maths is checkable
  await page.evaluate(() => {
    const p = document.createElement('p');
    p.id = 'subject';
    p.style.cssText = 'font:16px/1.6 monospace;padding:20px;margin:0;white-space:nowrap;';
    p.textContent = 'PUBLIC-START Jane Marie Doe PUBLIC-END';
    document.body.prepend(p);
    window.scrollTo(0, 0);
  });
});

/** the client rect of a character range inside #subject */
async function rangeBox(
  page: Page,
  from: number,
  to: number
): Promise<{ x: number; y: number; width: number; height: number }> {
  return page.evaluate(
    ({ from: a, to: b }) => {
      const node = document.querySelector('#subject')!.firstChild!;
      const range = document.createRange();
      range.setStart(node, a);
      range.setEnd(node, b);
      const r = range.getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height };
    },
    { from, to }
  );
}

async function openRedact(page: Page): Promise<void> {
  await page.evaluate(() => {
    const pc = (
      window as unknown as { Printcraft: { ui: { redactArea(o: unknown): Promise<unknown> } } }
    ).Printcraft;
    (window as unknown as { __r?: unknown }).__r = pc.ui.redactArea({
      scope: '#subject',
      target: '#subject'
    });
  });
  await expect(page.locator('[data-prjs-redact-layer]')).toBeVisible();
}

async function dragOver(
  page: Page,
  box: { x: number; y: number; width: number; height: number }
): Promise<void> {
  await page.mouse.move(box.x, box.y - 4);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width, box.y + box.height + 4, { steps: 8 });
  await page.mouse.up();
}

/* marking ---------------------------------------------------------------- */

test('a box over part of a line marks exactly that part', async ({ page }) => {
  // "Jane Marie Doe" is characters 13 to 27
  const box = await rangeBox(page, 13, 27);
  await openRedact(page);
  await dragOver(page, box);

  await expect(page.locator('[data-prjs-mark]')).toHaveCount(1);
  await expect(page.locator('[data-prjs-toolbar]')).toContainText('1 mark');
  // 14 characters of name, plus whatever spaces the box also covered
  await expect(page.locator('[data-prjs-toolbar]')).toContainText(/1[4-6] characters/);
});

test('the review step shows what will be destroyed', async ({ page }) => {
  const box = await rangeBox(page, 13, 27);
  await openRedact(page);
  await dragOver(page, box);
  await page.locator('[data-prjs-act="review"]').click();

  const modal = page.locator('[data-prjs-modal]');
  await expect(modal).toBeVisible();
  await expect(modal.locator('.prjs-title')).toHaveText('Destroy this text?');
  await expect(modal, 'the exact text, before anything happens').toContainText('Jane Marie Doe');
  await expect(page.locator('[data-prjs-action="back"]')).toBeVisible();
});

test('half a paragraph redacts as half a paragraph', async ({ page }) => {
  const box = await rangeBox(page, 13, 27);
  await openRedact(page);
  await dragOver(page, box);

  const printed = await page.evaluate(async () => {
    let text = '';
    const runs = (window as unknown as { __marks?: unknown }).__marks;
    void runs;
    // pull the marks straight off the overlay and run the job with them
    const pc = (
      window as unknown as {
        Printcraft: { print(o: unknown): Promise<unknown>; _internals: Record<string, unknown> };
      }
    ).Printcraft;
    const runsInRect = pc._internals['runsInRect'] as (
      root: Element,
      rect: unknown,
      win: Window
    ) => unknown[];

    const node = document.querySelector('#subject')!.firstChild!;
    const range = document.createRange();
    range.setStart(node, 13);
    range.setEnd(node, 27);
    const r = range.getBoundingClientRect();

    const layer = document.querySelector<HTMLElement>('[data-prjs-redact-layer]');
    if (layer) layer.style.display = 'none';
    const found = runsInRect(
      document.querySelector('#subject')!,
      {
        x: r.left + scrollX,
        y: r.top + scrollY,
        width: r.width,
        height: r.height
      },
      window
    );
    if (layer) layer.style.display = 'block';

    await pc.print({
      target: '#subject',
      redactRuns: found,
      assetTimeout: 3000,
      hooks: {
        beforePrint(ctx: { document: Document }) {
          text = ctx.document.body.textContent || '';
          return false;
        }
      }
    });
    return text;
  });

  expect(printed, 'the marked span is gone').not.toContain('Jane Marie Doe');
  expect(printed, 'and replaced character for character').toContain(BLOCK.repeat(14));
  expect(printed, 'what was outside the box survived').toContain('PUBLIC-START');
  expect(printed).toContain('PUBLIC-END');
});

test('a box over nothing says so rather than marking an empty run', async ({ page }) => {
  await openRedact(page);
  // well below the paragraph, over blank page
  await page.mouse.move(200, 700);
  await page.mouse.down();
  await page.mouse.move(400, 800, { steps: 5 });
  await page.mouse.up();

  await expect(page.locator('[data-prjs-mark]')).toHaveCount(0);
  await expect(page.locator('[data-prjs-toast]')).toContainText('nothing to destroy');
});

test('marks can be undone, and the review button follows', async ({ page }) => {
  const box = await rangeBox(page, 13, 27);
  await openRedact(page);

  await expect(page.locator('[data-prjs-act="review"]')).toBeDisabled();
  await dragOver(page, box);
  await expect(page.locator('[data-prjs-act="review"]')).toBeEnabled();

  await page.locator('[data-prjs-act="undo"]').click();
  await expect(page.locator('[data-prjs-mark]')).toHaveCount(0);
  await expect(page.locator('[data-prjs-act="review"]')).toBeDisabled();
});

test('cancelling leaves the page exactly as it was', async ({ page }) => {
  const before = await page.locator('#subject').textContent();
  const box = await rangeBox(page, 13, 27);

  await openRedact(page);
  await dragOver(page, box);
  await page.locator('[data-prjs-act="cancel"]').click();

  // marks exist, so it asks first
  await expect(page.locator('[data-prjs-modal]')).toContainText('Discard');
  await page.locator('[data-prjs-action="yes"]').click();

  await expect(page.locator('[data-prjs-redact-layer]')).toHaveCount(0);
  expect(await page.locator('#subject').textContent()).toBe(before);
  expect(before).toContain('Jane Marie Doe');
});
