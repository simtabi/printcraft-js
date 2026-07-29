// The proof sheet, the toolbar stack, and the region menu.
//
// Each of these is a screenshot you sent, turned into an assertion. The proof
// tests matter most: the claim is that what the sheet shows is the document
// itself rather than a rendering of it, and a claim like that is worth pinning.

import { expect, test, type Page } from '@playwright/test';

const DEMO = '/demo/index.html';

test.beforeEach(async ({ page }) => {
  await page.goto(DEMO);
  await expect(page.locator('#report')).toBeVisible();
});

/* toolbars ---------------------------------------------------------------- */

test('two toolbars open at once do not land on top of each other', async ({ page }) => {
  // both used to be `position: fixed; bottom: 22px`, so drawing a region while
  // the annotation tools were out gave one unreadable pile of buttons
  await page.evaluate(async () => {
    await (window as unknown as { Printcraft: Record<string, any> }).Printcraft.ui.run('annotate');
  });
  await expect(page.locator('.prjs-toolbar')).toHaveCount(1);

  await page.evaluate(() => {
    void (window as unknown as { Printcraft: Record<string, any> }).Printcraft.ui.run('draw');
  });
  await expect(page.locator('.prjs-toolbar')).toHaveCount(2);

  const boxes = await page.locator('.prjs-toolbar').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom };
    })
  );
  const [a, b] = boxes as Array<{ top: number; bottom: number }>;
  const overlap = a!.bottom > b!.top && a!.top < b!.bottom;
  expect(overlap, 'the two bars occupy the same band').toBe(false);
});

test('the toolbar moves off the selection it is describing', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.evaluate(() => {
    void (window as unknown as { Printcraft: Record<string, any> }).Printcraft.ui.run('draw');
  });
  await expect(page.locator('[data-prjs-draw]')).toBeVisible();

  const lane = page.locator('.prjs-toolbar-stack[data-dock="bottom"]');
  await expect(lane).toHaveAttribute('data-shifted', 'false');

  // a selection across the bottom of the screen, where the bar sits
  await page.mouse.move(300, 600);
  await page.mouse.down();
  await page.mouse.move(900, 780, { steps: 10 });
  await page.mouse.up();

  await expect(lane, 'the bar sat over the very box it describes').toHaveAttribute(
    'data-shifted',
    'true'
  );
});

/* the region menu --------------------------------------------------------- */

test('right-clicking a drawn region offers region actions and nothing else', async ({ page }) => {
  await page.evaluate(() => {
    void (window as unknown as { Printcraft: Record<string, any> }).Printcraft.ui.run('draw');
  });
  await expect(page.locator('[data-prjs-draw]')).toBeVisible();

  await page.mouse.move(300, 300);
  await page.mouse.down();
  await page.mouse.move(700, 560, { steps: 10 });
  await page.mouse.up();

  await page.mouse.click(500, 430, { button: 'right' });
  const menu = page.locator('[data-prjs-menu]');
  await expect(menu).toBeVisible();

  await expect(menu.locator('.prjs-menu-title')).toHaveText('This area');
  await expect(menu.locator('.prjs-menu-desc'), 'it says how big it is').toContainText('×');

  const ids = await menu
    .locator('[data-prjs-item]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-prjs-item')));
  expect(ids.length).toBeGreaterThan(0);
  expect(ids.every((id) => id!.startsWith('region-'))).toBe(true);
});

test('the page menu does not offer region actions', async ({ page }) => {
  await page.locator('h1').click({ button: 'right' });
  const ids = await page
    .locator('[data-prjs-menu] [data-prjs-item]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-prjs-item')));

  expect(ids.length, 'the page menu is not empty').toBeGreaterThan(5);
  expect(ids.some((id) => id!.startsWith('region-'))).toBe(false);
});

/* the proof sheet --------------------------------------------------------- */

/** Opens the proof over the demo's report and waits for the frame to fill. */
async function openProof(page: Page, options: Record<string, unknown> = {}): Promise<void> {
  await page.evaluate((o) => {
    (window as unknown as { __rec: unknown }).__rec = (
      window as unknown as { Printcraft: Record<string, any> }
    ).Printcraft.proof({ target: '#report', assetTimeout: 3000, ...o });
  }, options);
  await expect(page.locator('[data-prjs-proof]')).toBeVisible({ timeout: 15000 });
  await page.waitForFunction(
    () => {
      const frame = document.querySelector<HTMLIFrameElement>('[data-prjs-proof] iframe');
      return (frame?.contentDocument?.body?.textContent || '').length > 50;
    },
    undefined,
    { timeout: 15000 }
  );
}

test('the proof shows the assembled document, not a picture of it', async ({ page }) => {
  await openProof(page, { paginate: true, documentTitle: 'Quarterly report' });

  const seen = await page.evaluate(() => {
    const proof = document.querySelector('[data-prjs-proof]')!;
    const doc = proof.querySelector<HTMLIFrameElement>('iframe')!.contentDocument!;
    return {
      title: proof.querySelector('.prjs-proof-title')?.textContent,
      meta: proof.querySelector('.prjs-proof-meta')?.textContent,
      sheets: doc.querySelectorAll('.prjs-page-sheet').length,
      rail: proof.querySelectorAll('[data-prjs-page]').length,
      // the real thing: live elements, not an image of them
      images: doc.querySelectorAll('body > img').length
    };
  });

  expect(seen.title).toBe('Quarterly report');
  expect(seen.sheets, 'real paginated sheets').toBeGreaterThan(0);
  expect(seen.rail, 'one rail tab per sheet').toBe(seen.sheets);
  expect(seen.meta).toContain('sheet');
  expect(seen.images, 'a rasterised preview would be one image').toBe(0);
});

test('cancelling the proof prints nothing and cancels the job', async ({ page }) => {
  await openProof(page);
  await page.locator('[data-prjs-proof] [data-prjs-act="cancel"]').click();

  await expect(page.locator('[data-prjs-proof]')).toHaveCount(0);
  const record = await page.evaluate(async () => {
    const r = (await (window as unknown as { __rec: Promise<any> }).__rec) as {
      cancelled: boolean;
      status: string;
    };
    return { cancelled: r.cancelled, status: r.status };
  });
  expect(record.cancelled).toBe(true);
  expect(record.status).toBe('cancelled');
});

test('printing from the proof continues the same job', async ({ page }) => {
  await openProof(page, { paginate: true });

  // the browser backend calls print() on the mounted window, which is the
  // proof's own frame
  await page.evaluate(() => {
    const frame = document.querySelector<HTMLIFrameElement>('[data-prjs-proof] iframe')!;
    (frame.contentWindow as unknown as { print: () => void }).print = () => {};
  });

  await page.locator('[data-prjs-proof] [data-prjs-act="print"]').click();

  const record = await page.evaluate(async () => {
    const r = (await (window as unknown as { __rec: Promise<any> }).__rec) as {
      cancelled: boolean;
      status: string;
      pages: number | null;
    };
    return { cancelled: r.cancelled, status: r.status, pages: r.pages };
  });

  expect(record.status, 'the job the proof was showing is the job that printed').toBe('done');
  expect(record.cancelled).toBe(false);
  expect(record.pages, 'and it kept its page count').toBeGreaterThan(0);
});

test('a right-click print opens the proof rather than the printer', async ({ page }) => {
  // the flow change: anywhere a person is present, the sheet comes first
  await page.evaluate(() => {
    (window as unknown as { __printed: number }).__printed = 0;
    window.print = () => {
      (window as unknown as { __printed: number }).__printed++;
    };
  });

  await page.locator('h1').click({ button: 'right' });
  await page.locator('[data-prjs-item="print-page"]').click();

  await expect(page.locator('[data-prjs-proof]')).toBeVisible({ timeout: 15000 });
  expect(await page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(0);
});

test('Printcraft.print from code still prints directly', async ({ page }) => {
  // an unattended job must not sit waiting for somebody who is not there
  const opened = await page.evaluate(async () => {
    const pc = (window as unknown as { Printcraft: Record<string, any> }).Printcraft;
    let sawProof = false;
    const job = pc.print({
      target: '#report',
      assetTimeout: 3000,
      hooks: {
        beforePrint() {
          sawProof = !!document.querySelector('[data-prjs-proof]');
          return false;
        }
      }
    });
    await job;
    return sawProof;
  });

  expect(opened, 'no proof for a programmatic call').toBe(false);
});

/* daisyUI ----------------------------------------------------------------- */

test('the kit is drawn by daisyUI, prefixed', async ({ page }) => {
  // not a mirror of daisyUI's tokens with our own rules on top: daisyUI's own
  // component css, every class renamed so none of it can reach the host page
  const seen = await page.evaluate(() => {
    const pc = (window as unknown as { Printcraft: Record<string, any> }).Printcraft;
    void pc.ui.modal({
      title: 'Everything',
      fields: [
        { type: 'text', name: 'a', label: 'Title' },
        { type: 'select', name: 'b', label: 'Paper', choices: [{ value: 'A4', label: 'A4' }] },
        { type: 'range', name: 'c', label: 'Stroke', min: 1, max: 24, value: 3 },
        { type: 'checkbox', name: 'd', label: 'Number the pages' },
        {
          type: 'radio',
          name: 'e',
          label: 'Orientation',
          choices: [{ value: 'p', label: 'Portrait' }]
        }
      ],
      actions: [
        { id: 'x', label: 'Cancel', tone: 'ghost' },
        { id: 'y', label: 'Print', tone: 'primary' }
      ]
    });

    const at = (sel: string, prop: string): string => {
      const el = document.querySelector('[data-prjs-modal] ' + sel);
      return el ? (getComputedStyle(el) as unknown as Record<string, string>)[prop]! : 'MISSING';
    };
    return {
      input: at('.prjs-input', 'height'),
      // daisyUI draws its own box; the platform's is 13px and `appearance: auto`
      checkbox: at('.prjs-checkbox', 'appearance'),
      checkboxSize: at('.prjs-checkbox', 'width'),
      radioRadius: at('.prjs-radio', 'borderRadius'),
      selectAppearance: at('.prjs-select', 'appearance'),
      primaryBg: at('[data-tone="primary"]', 'backgroundColor'),
      ghostBg: at('[data-tone="ghost"]', 'backgroundColor')
    };
  });

  expect(seen.input, 'daisyUI sizes a field from --size-field').toBe('40px');
  expect(seen.checkbox, "the platform's box is replaced").toBe('none');
  expect(seen.checkboxSize).toBe('24px');
  expect(seen.radioRadius, 'a radio is round').not.toBe('0px');
  expect(seen.selectAppearance).not.toBe('auto');
  expect(seen.primaryBg, 'the tone reaches --btn-color').toBe('rgb(15, 118, 110)');
  expect(seen.ghostBg).toBe('rgba(0, 0, 0, 0)');
});

test('no unprefixed class survives into the kit stylesheet', async ({ page }) => {
  // The reason for the prefixing pass, asserted where it can be asserted. A
  // computed-style probe cannot help here: the demo page runs daisyUI itself, so
  // a styled `.input` on it proves nothing about whose rules did the styling.
  // The sheet we inject is unambiguous.
  const audit = await page.evaluate(() => {
    // force the kit to inject
    const pc = (window as unknown as { Printcraft: Record<string, any> }).Printcraft;
    void pc.ui.toast({ message: 'x' });

    const sheet = document.getElementById('prjs-kit-style')!.textContent!;

    // every selector, with declaration blocks and url() removed first
    const selectorsOnly = sheet
      .replace(/url\([^)]*\)/gi, '')
      .replace(/\{[^{}]*\}/g, '{}')
      .replace(/"[^"]*"|'[^']*'/g, '');

    const classes = [...selectorsOnly.matchAll(/\.([a-zA-Z_-][\w-]*)/g)].map((m) => m[1]!);
    return {
      total: classes.length,
      // `prjs` with no hyphen is the kit's own root class, and is ours
      bare: [...new Set(classes.filter((c) => c !== 'prjs' && !c.startsWith('prjs-')))],
      hasDaisy: sheet.includes('--btn-color'),
      hasColoris: sheet.includes('clr-picker') || !!document.getElementById('prjs-coloris-style')
    };
  });

  expect(audit.total, 'the sheet should be full of classes').toBeGreaterThan(200);
  expect(audit.bare, 'these would restyle the host page').toEqual([]);
  expect(audit.hasDaisy, "daisyUI's own component css is in there").toBe(true);
});

/* the paths a person actually takes ---------------------------------------- */

test("the demo's own Draw button gives our region menu, not the browser's", async ({ page }) => {
  // The earlier test drove `ui.run('draw')`, which carries the registry in its
  // action context. The demo calls `Printcraft.ui.drawArea()`, which did not —
  // so the menu had no actions, returned before preventDefault, and Chrome's own
  // menu opened over our overlay. Everything looked broken from there.
  await page.locator('#btn-draw').click();
  await expect(page.locator('[data-prjs-draw]')).toBeVisible();

  await page.mouse.move(300, 300);
  await page.mouse.down();
  await page.mouse.move(800, 600, { steps: 12 });
  await page.mouse.up();

  await page.mouse.click(550, 450, { button: 'right' });

  const menu = page.locator('[data-prjs-menu]');
  await expect(menu, 'the native menu opened instead').toBeVisible();
  await expect(menu.locator('.prjs-menu-title')).toHaveText('This area');
  await expect(menu.locator('[data-prjs-item="region-print"]')).toBeVisible();
});

test('a right-click anywhere on a tool overlay is swallowed', async ({ page }) => {
  // outside the selection there is no menu of ours to show, and the browser's is
  // still the wrong answer: its entries are about a page the overlay is covering
  await page.locator('#btn-draw').click();
  await expect(page.locator('[data-prjs-draw]')).toBeVisible();

  const defaultPrevented = await page.evaluate(() => {
    const layer = document.querySelector('[data-prjs-draw]')!;
    const ev = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 60,
      clientY: 60
    });
    layer.dispatchEvent(ev);
    return ev.defaultPrevented;
  });
  expect(defaultPrevented).toBe(true);
});

test('the redaction overlay swallows it too', async ({ page }) => {
  await page.locator('#btn-redact-area').click();
  await expect(page.locator('[data-prjs-redact-layer]')).toBeVisible();

  const defaultPrevented = await page.evaluate(() => {
    const layer = document.querySelector('[data-prjs-redact-layer]')!;
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    layer.dispatchEvent(ev);
    return ev.defaultPrevented;
  });
  expect(defaultPrevented).toBe(true);
});

test('inspect opens the proof sheet, not a second overlay', async ({ page }) => {
  await page.evaluate(() => {
    (window as unknown as { __ctl: unknown }).__ctl = (
      window as unknown as { Printcraft: Record<string, any> }
    ).Printcraft.inspect({ target: '#report', assetTimeout: 3000 });
  });

  await expect(page.locator('[data-prjs-proof]')).toBeVisible({ timeout: 15000 });
  await expect(
    page.locator('[data-prjs-inspector]'),
    'the old overlay is gone, not hiding behind it'
  ).toHaveCount(0);

  // read-only: its Print goes straight to the printer rather than settling a
  // verdict nobody is waiting on
  await expect(page.locator('[data-prjs-proof] [data-prjs-act="print"]')).toBeVisible();
  await page.locator('[data-prjs-proof] [data-prjs-act="cancel"]').click();
  await expect(page.locator('[data-prjs-proof]')).toHaveCount(0);
});

/* changing the sheet while looking at it ---------------------------------- */

/** Opens a proof and waits for its frame to hold the document. */
async function proofOf(page: Page, options: Record<string, unknown> = {}): Promise<void> {
  await page.evaluate((o) => {
    (window as unknown as { __rec: unknown }).__rec = (
      window as unknown as { Printcraft: Record<string, any> }
    ).Printcraft.proof({ target: '#report', assetTimeout: 3000, ...o });
  }, options);
  await expect(page.locator('[data-prjs-proof]')).toBeVisible({ timeout: 15000 });
  await page.waitForFunction(
    () => {
      const f = document.querySelector<HTMLIFrameElement>('[data-prjs-proof] iframe');
      return (f?.contentDocument?.body?.textContent || '').length > 50;
    },
    undefined,
    { timeout: 15000 }
  );
}

test('the proof keeps every element linked to the page behind it', async ({ page }) => {
  // the link a mark travels along. `data-prjs-id` exists to correlate a
  // measurement with the node it measured and is normally swept up at the end of
  // the job; the proof holds it open, and tags the whole subtree rather than
  // only the handful of elements with something to measure.
  await proofOf(page);

  const linked = await page.evaluate(() => {
    const onPage = document.querySelectorAll('#report [data-prjs-id]').length;
    const frame = document.querySelector<HTMLIFrameElement>('[data-prjs-proof] iframe')!;
    const inProof = frame.contentDocument!.querySelectorAll('[data-prjs-id]').length;

    const el = frame.contentDocument!.querySelector('p[data-prjs-id]')!;
    const id = el.getAttribute('data-prjs-id')!;
    const source = document.querySelector('[data-prjs-id="' + id + '"]');
    return { onPage, inProof, resolves: source?.tagName === el.tagName };
  });

  expect(linked.onPage, 'the whole subtree, not just images').toBeGreaterThan(20);
  expect(linked.inProof).toBeGreaterThan(20);
  expect(linked.resolves, 'a proof element must find its source').toBe(true);
});

test('changing the paper rebuilds the sheet and keeps the marks', async ({ page }) => {
  // The reason the bridge exists. Annotating a copy and then re-rendering would
  // throw the annotations away, which is the worst possible behaviour for a
  // panel whose whole job is letting you change your mind before printing.
  await proofOf(page, { paginate: true });

  const before = await page.locator('.prjs-proof-meta').textContent();

  // a mark, carried back to the page exactly as the studio's onChange does
  await page.evaluate(() => {
    const frame = document.querySelector<HTMLIFrameElement>('[data-prjs-proof] iframe')!;
    const el = frame.contentDocument!.querySelector('p[data-prjs-id]')!;
    const id = el.getAttribute('data-prjs-id')!;
    document
      .querySelector('[data-prjs-id="' + id + '"]')!
      .setAttribute('data-printcraft-note', 'survives the rebuild');
  });

  await page.locator('[data-prjs-proof] [data-prjs-act="settings"]').click();
  await expect(page.locator('[data-prjs-modal] .prjs-title')).toHaveText('Sheet settings');

  await page.selectOption('[data-prjs-modal] select', 'letter');
  await page.locator('[data-prjs-modal] [data-prjs-action="apply"]').click();

  // the panel goes and a fresh one takes its place
  await expect(page.locator('[data-prjs-proof]')).toBeVisible({ timeout: 15000 });
  await page.waitForFunction(
    () => (document.querySelector('.prjs-proof-meta')?.textContent || '').includes('Letter'),
    undefined,
    { timeout: 15000 }
  );

  const after = await page.locator('.prjs-proof-meta').textContent();
  expect(after).not.toBe(before);
  expect(after).toContain('Letter');

  await page.waitForFunction(
    () => {
      const f = document.querySelector<HTMLIFrameElement>('[data-prjs-proof] iframe');
      return (f?.contentDocument?.body?.innerHTML || '').includes('survives the rebuild');
    },
    undefined,
    { timeout: 15000 }
  );
});

test('a proof opened to look at offers no settings', async ({ page }) => {
  // `inspect` is the same panel without the verdict; changing the paper there
  // would rebuild a job its caller is not waiting on
  await page.evaluate(() => {
    void (window as unknown as { Printcraft: Record<string, any> }).Printcraft.inspect({
      target: '#report',
      assetTimeout: 3000
    });
  });
  await expect(page.locator('[data-prjs-proof]')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('[data-prjs-proof] [data-prjs-act="settings"]')).toBeHidden();
});

test('the source link is swept up when the proof closes', async ({ page }) => {
  await proofOf(page);
  expect(await page.locator('#report [data-prjs-id]').count()).toBeGreaterThan(20);

  await page.locator('[data-prjs-proof] [data-prjs-act="cancel"]').click();
  await expect(page.locator('[data-prjs-proof]')).toHaveCount(0);

  expect(
    await page.locator('#report [data-prjs-id]').count(),
    'leaving it on the live dom is litter, and a later job would find stale numbers'
  ).toBe(0);
});

test('a surface opened from another sits above it', async ({ page }) => {
  // The proof shipped above the modal scrim, so its own Settings button opened a
  // dialog behind the panel that opened it — visible, and impossible to click.
  // Nothing about that is apparent from reading either file.
  const layers = await page.evaluate(() => {
    const sheet = document.getElementById('prjs-kit-style')!.textContent!;
    const at = (selector: string): number => {
      const rule = new RegExp(selector.replace('.', '\\.') + '\\s*\\{[^}]*z-index:\\s*(\\d+)');
      const m = rule.exec(sheet);
      return m ? Number(m[1]) : -1;
    };
    return {
      proof: at('.prjs-proof'),
      toolbar: at('.prjs-toolbar-stack'),
      modal: at('.prjs-scrim'),
      menu: at('.prjs-menu'),
      toast: at('.prjs-toasts')
    };
  });

  for (const [name, z] of Object.entries(layers)) {
    expect(z, name + ' has no z-index in the sheet').toBeGreaterThan(0);
  }

  // the order things open in
  expect(layers.toolbar, 'the annotation tools open over the proof').toBeGreaterThan(layers.proof);
  expect(layers.modal, "the proof's settings dialog opens over the proof").toBeGreaterThan(
    layers.proof
  );
  expect(
    layers.modal,
    'and over a toolbar, which is where the pen form comes from'
  ).toBeGreaterThan(layers.toolbar);
  expect(layers.menu, 'a menu opens over a modal').toBeGreaterThan(layers.modal);
  expect(layers.toast, 'a toast is over everything').toBeGreaterThan(layers.menu);
});

/* the demo's own new section ----------------------------------------------- */

test('the demo shows the proof, annotation and the colour picker', async ({ page }) => {
  // its buttons predated all four of these, so a visitor had no way to reach
  // them without opening the console
  for (const [id, selector, what] of [
    ['btn-proof', '[data-prjs-proof]', 'the proof'],
    ['btn-annotate', '.prjs-toolbar', 'the annotation tools'],
    ['btn-pen', '[data-prjs-modal] .prjs-color-input', 'the colour picker']
  ] as Array<[string, string, string]>) {
    await page.locator('#' + id).scrollIntoViewIfNeeded();
    await page.locator('#' + id).click();
    await expect(page.locator(selector), what + ' did not open').toBeVisible({ timeout: 15000 });

    await page.keyboard.press('Escape');
    await page.evaluate(() =>
      document
        .querySelectorAll('[data-prjs-modal],[data-prjs-proof],.prjs-toolbar-stack > *')
        .forEach((el) => el.remove())
    );
  }
});

test("the demo's whole-page proof paginates and fills its rail", async ({ page }) => {
  await page.locator('#btn-proof-paginated').scrollIntoViewIfNeeded();
  await page.locator('#btn-proof-paginated').click();

  await expect(page.locator('[data-prjs-proof]')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('.prjs-proof-meta')).toContainText('sheets', { timeout: 20000 });

  const rail = await page.locator('[data-prjs-page]').count();
  expect(rail, 'one tab per sheet').toBeGreaterThan(1);

  // the cover and the notes sheet it asked for
  const html = await page.evaluate(() => {
    const f = document.querySelector<HTMLIFrameElement>('[data-prjs-proof] iframe')!;
    return f.contentDocument!.body.innerHTML;
  });
  expect(html).toContain('prjs-cover');
  expect(html).toContain('Printcraft demo');
});

test('no layer is clamped by the 32-bit z-index ceiling', async ({ page }) => {
  // `z-index` is a signed 32-bit integer and anything over 2147483647 is clamped
  // to it. The base sat at 2147483600 with offsets up to +70, so the toolbar, the
  // modal scrim, the menu and the toasts all clamped to the same number and
  // their order quietly became the order they were appended in. The layering
  // above only appeared to work.
  const INT_MAX = 2147483647;

  const layers = await page.evaluate(() => {
    const pc = (window as unknown as { Printcraft: Record<string, any> }).Printcraft;
    void pc.ui.toast({ message: 'x' });

    const sheet = document.getElementById('prjs-kit-style')!.textContent!;
    const at = (selector: string): number => {
      const m = new RegExp(selector.replace('.', '\\.') + '\\s*\\{[^}]*z-index:\\s*(\\d+)').exec(
        sheet
      );
      return m ? Number(m[1]) : -1;
    };
    return {
      declared: {
        proof: at('.prjs-proof'),
        toolbar: at('.prjs-toolbar-stack'),
        modal: at('.prjs-scrim'),
        menu: at('.prjs-menu'),
        toast: at('.prjs-toasts')
      },
      // what the browser actually resolved, which is where a clamp shows up
      computed: Number(getComputedStyle(document.querySelector('.prjs-toasts')!).zIndex)
    };
  });

  for (const [name, z] of Object.entries(layers.declared)) {
    expect(z, name + ' has no z-index').toBeGreaterThan(0);
    expect(z, name + ' would be clamped to ' + INT_MAX).toBeLessThan(INT_MAX);
  }
  expect(layers.computed, 'the top layer resolved to something other than it declared').toBe(
    layers.declared.toast
  );
});

test('a tool overlay sits under the toolbar that drives it', async ({ page }) => {
  // The overlay's z-index was hard-coded at 2147483645, outside the theme stack
  // entirely. It only worked because the toolbar's declared value exceeded the
  // 32-bit ceiling and clamped two higher, by accident — so lowering the base to
  // make room for the stack put the overlay back on top of its own buttons.
  await page.locator('#btn-draw').click();
  await expect(page.locator('[data-prjs-draw]')).toBeVisible();

  const z = await page.evaluate(() => ({
    overlay: Number(getComputedStyle(document.querySelector('[data-prjs-draw]')!).zIndex),
    toolbar: Number(
      getComputedStyle(document.querySelector('.prjs-toolbar-stack[data-dock="bottom"]')!).zIndex
    )
  }));

  expect(z.overlay).toBeGreaterThan(0);
  expect(z.toolbar, 'the controls must be above the sheet they control').toBeGreaterThan(z.overlay);

  // and the button is genuinely clickable, which is the thing that broke
  await page.mouse.move(200, 520);
  await page.mouse.down();
  await page.mouse.move(700, 760, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator('.prjs-toolbar [data-prjs-act="reset"]')).toBeEnabled();
  await page.locator('.prjs-toolbar [data-prjs-act="cancel"]').click();
  await expect(page.locator('[data-prjs-draw]')).toHaveCount(0);
});
