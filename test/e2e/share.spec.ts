// Screenshots, clipboard and email, against a real browser.
//
// The rasteriser needs a canvas and the clipboard needs permissions, so neither
// exists under jsdom. The assertion that matters here is a pixel one: a redacted
// region has to be black in the png, because an image has no text to search.

import { expect, test } from '@playwright/test';

const DEMO = '/demo/index.html';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

test.beforeEach(async ({ page }) => {
  await page.goto(DEMO);
  await expect(page.locator('#tickets .prjs-ticket').first()).toBeVisible();

  await page.evaluate(() => {
    const p = document.createElement('p');
    p.id = 'classified';
    p.className = 'secret';
    p.style.cssText = 'font:20px monospace;background:#fff;padding:16px;margin:0;';
    p.textContent = 'AGENT JANE MARIE DOE';
    document.body.prepend(p);
    window.scrollTo(0, 0);
  });
});

/* screenshots ------------------------------------------------------------- */

test('a screenshot is a real image of the print copy', async ({ page }) => {
  const shot = await page.evaluate(async () => {
    const pc = (window as unknown as { Printcraft: Record<string, any> }).Printcraft;
    const s = await pc.share.screenshot({ target: '#report', assetTimeout: 4000 });
    return { width: s.width, height: s.height, bytes: s.blob.size, type: s.blob.type };
  });

  expect(shot.width).toBeGreaterThan(100);
  expect(shot.height).toBeGreaterThan(100);
  expect(shot.bytes, 'a real png, not an empty one').toBeGreaterThan(2000);
  expect(shot.type).toBe('image/png');
});

test('the redacted region is black in the png, where there is no text to search', async ({
  page
}) => {
  // an image cannot be grepped, so this samples pixels instead. it is the only
  // honest way to know a screenshot did not leak. the comparison is against the
  // same shot unredacted, rather than a threshold picked out of the air.
  const ink = await page.evaluate(async () => {
    const pc = (window as unknown as { Printcraft: Record<string, any> }).Printcraft;

    async function darkFraction(options: Record<string, unknown>): Promise<number> {
      const shot = await pc.share.screenshot({ target: '#classified', ...options });
      const img = new Image();
      img.src = shot.dataUrl;
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
    }

    return {
      plain: await darkFraction({ assetTimeout: 4000 }),
      redacted: await darkFraction({ redactSelectorList: ['.secret'], assetTimeout: 4000 })
    };
  });

  // text is thin strokes; a solid bar over the same line is far more ink
  expect(ink.redacted, `plain ${ink.plain}, redacted ${ink.redacted}`).toBeGreaterThan(
    ink.plain * 3
  );
  expect(ink.redacted, 'and there is a real bar, not a tint').toBeGreaterThan(0.02);
});

test('the screenshot never contains what redaction destroyed', async ({ page }) => {
  const markup = await page.evaluate(() => {
    const pc = (window as unknown as { Printcraft: Record<string, any> }).Printcraft;
    const { element } = pc.render({ target: '#classified', redactSelectorList: ['.secret'] });
    return element.outerHTML;
  });

  expect(markup).not.toContain('JANE MARIE DOE');
  expect(markup).toContain('█');
});

test('a download saves under a name derived from the title', async ({ page }) => {
  const wait = page.waitForEvent('download');
  await page.evaluate(async () => {
    const pc = (window as unknown as { Printcraft: Record<string, any> }).Printcraft;
    await pc.share.screenshot({
      target: '#classified',
      documentTitle: 'Q3 Production Report',
      download: true,
      assetTimeout: 4000
    });
  });

  const download = await wait;
  expect(download.suggestedFilename()).toBe('q3-production-report.png');
});

/* clipboard --------------------------------------------------------------- */

test('an image reaches the clipboard and reads back as a png', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const pc = (window as unknown as { Printcraft: Record<string, any> }).Printcraft;
    const r = await pc.share.copyImage({ target: '#classified', assetTimeout: 4000 });

    const items = await navigator.clipboard.read();
    const types = items.flatMap((i) => i.types);
    const blob = await items[0]!.getType('image/png');
    return { via: r.via, types, bytes: blob.size };
  });

  expect(result.via).toBe('clipboard-api');
  expect(result.types).toContain('image/png');
  expect(result.bytes).toBeGreaterThan(1000);
});

test('copied text is the print copy, redaction and all', async ({ page }) => {
  const text = await page.evaluate(async () => {
    const pc = (window as unknown as { Printcraft: Record<string, any> }).Printcraft;
    await pc.share.copyText({ target: '#classified', redactSelectorList: ['.secret'] });
    return navigator.clipboard.readText();
  });

  expect(text).not.toContain('JANE MARIE DOE');
  expect(text).toContain('█');
});

/* email ------------------------------------------------------------------- */

test('the compose window validates before it sends', async ({ page }) => {
  await page.evaluate(() => {
    const pc = (window as unknown as { Printcraft: Record<string, any> }).Printcraft;
    (window as unknown as { __sent?: unknown[] }).__sent = [];
    (window as unknown as { __c?: unknown }).__c = pc.share.email({
      target: '#classified',
      subject: 'Q3',
      assetTimeout: 4000,
      transport: async (m: unknown) => {
        (window as unknown as { __sent: unknown[] }).__sent.push(m);
        return { status: 'sent', via: 'test' };
      }
    });
  });

  const modal = page.locator('[data-prjs-modal]');
  await expect(modal).toBeVisible();
  await expect(modal.locator('.prjs-title')).toHaveText('Send this');
  // the attachment is named and sized before anyone commits to sending it
  await expect(modal).toContainText('.png');

  await modal.locator('#prjs-f-to').fill('not an address');
  await modal.locator('[data-prjs-action="send"]').click();
  await expect(modal, 'still open').toBeVisible();
  await expect(modal.locator('.prjs-field:has(#prjs-f-to) .prjs-error')).toContainText(
    'Not an email address'
  );

  await modal.locator('#prjs-f-to').fill('ops@example.com');
  await modal.locator('[data-prjs-action="send"]').click();

  await expect(page.locator('[data-prjs-modal]')).toHaveCount(0);
  const sent = await page.evaluate(
    () => (window as unknown as { __sent: Array<Record<string, unknown>> }).__sent
  );
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({ to: ['ops@example.com'], subject: 'Q3' });
});

test('cancelling the compose window sends nothing', async ({ page }) => {
  const transportCalls = await page.evaluate(async () => {
    const pc = (window as unknown as { Printcraft: Record<string, any> }).Printcraft;
    let calls = 0;
    const pending = pc.share.email({
      target: '#classified',
      assetTimeout: 4000,
      transport: async () => {
        calls++;
        return { status: 'sent', via: 'test' };
      }
    });
    await new Promise((r) => setTimeout(r, 800));
    document.querySelector<HTMLElement>('[data-prjs-action="cancel"]')!.click();
    const result = await pending;
    return { calls, status: result.status };
  });

  expect(transportCalls.status).toBe('cancelled');
  expect(transportCalls.calls).toBe(0);
});
