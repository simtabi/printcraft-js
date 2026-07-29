// The interface: menu, palette, tooltips, popovers and the notes panel.
//
// These need a real browser for the parts that are the whole point: anchor
// positioning, the top layer, focus order, and a tooltip that only appears once
// the pointer has rested. jsdom has none of them.

import { expect, test, type Page } from '@playwright/test';

const DEMO = '/demo/index.html';

/**
 * Waits two frames.
 *
 * The menu closes on scroll by design: it is fixed, so it would otherwise
 * detach from what it points at. Playwright's own scroll-into-view delivers its
 * scroll event a frame late, which lands after the right-click and shuts the
 * menu the moment it opens.
 */
async function settle(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      })
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto(DEMO);
  await expect(page.locator('#tickets .prjs-ticket').first()).toBeVisible();
});

/** ⌘ on a Mac runner, Ctrl elsewhere. */
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

/* the menu ---------------------------------------------------------------- */

test('the menu installs itself, with no setup call anywhere', async ({ page }) => {
  // the right-click comes first, before anything touches `Printcraft.ui`.
  // reading the surface creates the interface lazily, so an assertion that
  // looked at it first would pass whether or not the boot install worked — which
  // is exactly how the boot ordering bug hid.
  await page.locator('h1').click({ button: 'right' });
  const menu = page.locator('[data-prjs-menu]');
  await expect(menu).toBeVisible();
  await expect(menu.locator('.prjs-menu-title')).toHaveText('Print & mark up');

  const installed = await page.evaluate(() => {
    const pc = (window as unknown as { Printcraft: Record<string, any> }).Printcraft;
    return { auto: pc.autoMenu, actions: pc.ui.actions.ids().length };
  });
  expect(installed.auto).toBe(true);
  expect(installed.actions).toBeGreaterThan(8);
});

test('every row says what it does, and destructive rows are red', async ({ page }) => {
  await page.locator('h1').click({ button: 'right' });
  const menu = page.locator('[data-prjs-menu]');

  const rows = await menu.locator('[data-prjs-item]').count();
  const hints = await menu.locator('.prjs-item-hint').count();
  expect(hints, 'every row carries a description').toBe(rows);

  await expect(menu.locator('[data-prjs-item="redact"]')).toHaveAttribute('data-tone', 'danger');
  await expect(menu.locator('[data-prjs-item="redact"]')).toHaveCSS('color', 'rgb(185, 28, 28)');
});

test('a disabled row says why rather than just being grey', async ({ page }) => {
  // nothing is marked on a fresh load, so the notes row has nothing to show
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('[data-printcraft-note],[data-printcraft-redact]')) {
      el.removeAttribute('data-printcraft-note');
      el.removeAttribute('data-printcraft-redact');
    }
  });

  await page.locator('h1').click({ button: 'right' });
  const notes = page.locator('[data-prjs-menu] [data-prjs-item="notes"]');
  await expect(notes).toBeDisabled();
  await expect(notes).toHaveAttribute('title', /Nothing is marked/);
});

/* the palette ------------------------------------------------------------- */

async function openPalette(page: Page): Promise<void> {
  await page.keyboard.press(MOD + '+k');
  await expect(page.locator('[data-prjs-palette]')).toBeVisible();
}

test('the palette opens on the keyboard and runs what is picked', async ({ page }) => {
  await openPalette(page);
  await expect(page.locator('.prjs-palette-input')).toBeFocused();

  // the footer is where people learn the keyboard
  await expect(page.locator('.prjs-palette-foot')).toContainText('navigate');
  await expect(page.locator('.prjs-palette-foot')).toContainText('run');

  await page.keyboard.type('preview');
  const first = page.locator('[data-prjs-palette] [data-prjs-item]').first();
  await expect(first).toContainText('Preview the print');

  await page.keyboard.press('Enter');
  await expect(page.locator('[data-prjs-palette]')).toHaveCount(0);
  await expect(page.locator('[data-prjs-proof]'), 'it ran the action').toBeVisible();
  await page.keyboard.press('Escape');
});

test('matching is by subsequence, and the characters that matched are shown', async ({ page }) => {
  await openPalette(page);
  await page.keyboard.type('dpa');

  const first = page.locator('[data-prjs-palette] [data-prjs-item]').first();
  await expect(first.locator('.prjs-item-label')).toHaveText('Draw a print area…');
  // "dpa" is not a substring of anything; it is d-p-a in order
  await expect(first.locator('.prjs-match')).toHaveCount(3);
});

test('arrows move the selection and wrap, and Escape closes', async ({ page }) => {
  await openPalette(page);
  const rows = page.locator('[data-prjs-palette] [data-prjs-item]');
  const count = await rows.count();

  await expect(rows.first()).toHaveAttribute('data-active', 'true');
  await page.keyboard.press('ArrowDown');
  await expect(rows.nth(1)).toHaveAttribute('data-active', 'true');

  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(
    rows.nth(count - 1),
    'a list you cannot get back to the top of is one you scroll'
  ).toHaveAttribute('data-active', 'true');

  await page.keyboard.press('Escape');
  await expect(page.locator('[data-prjs-palette]')).toHaveCount(0);
});

test('a query that matches nothing says so', async ({ page }) => {
  await openPalette(page);
  await page.keyboard.type('zzzzqqq');
  await expect(page.locator('.prjs-palette-empty')).toContainText('Nothing matches');
  await page.keyboard.press('Escape');
});

/* keyboard commands ------------------------------------------------------- */

test('a binding fires its action, and typing in a field does not', async ({ page }) => {
  await page.keyboard.press(MOD + '+Shift+i');
  await expect(page.locator('[data-prjs-proof]')).toBeVisible();

  // the inspector's controls are labelled, not tagged
  await page.locator('[data-prjs-proof] [data-prjs-modal-close]').click();
  await expect(page.locator('[data-prjs-proof]')).toHaveCount(0);

  // the same keystroke inside a text field is somebody typing
  await page.locator('#cust').click();
  await page.locator('#cust').press(MOD + '+Shift+i');
  await page.waitForTimeout(300);
  await expect(page.locator('[data-prjs-proof]')).toHaveCount(0);
});

test('the palette still opens from inside a text field', async ({ page }) => {
  await page.locator('#cust').click();
  await page.locator('#cust').press(MOD + '+k');
  await expect(page.locator('[data-prjs-palette]')).toBeVisible();
  await page.keyboard.press('Escape');
});

/* tooltips and popovers --------------------------------------------------- */

test('a tooltip waits for the pointer to rest, and labels an icon-only button', async ({
  page
}) => {
  const has = await page.evaluate(async () => {
    const pc = (window as unknown as { Printcraft: Record<string, any> }).Printcraft;
    const btn = document.createElement('button');
    btn.id = 'probe';
    btn.setAttribute('data-prjs-ui', '');
    // a tooltip's target has to have a box to hover
    btn.style.cssText = 'position:fixed;top:40px;left:40px;width:40px;height:40px;z-index:9';
    document.body.appendChild(btn);

    pc.ui.tooltip(btn, { text: 'Save the sheet', keys: 'S' }, { document, window });
    return {
      labelled: btn.getAttribute('aria-label'),
      immediate: !!document.querySelector('.prjs-tip')
    };
  });

  // the tooltip is the only label an icon-only button has
  expect(has.labelled).toBe('Save the sheet');
  expect(has.immediate, 'nothing on load').toBe(false);

  await page.hover('#probe');
  await expect(page.locator('.prjs-tip')).toContainText('Save the sheet', { timeout: 2000 });
  await expect(page.locator('.prjs-tip .prjs-kbd')).toHaveText('S');

  await page.hover('h1');
  await expect(page.locator('.prjs-tip')).toHaveCount(0);
});

test('a popover holds real content and closes on Escape and on a click outside', async ({
  page
}) => {
  await page.evaluate(() => {
    const pc = (window as unknown as { Printcraft: Record<string, any> }).Printcraft;
    (window as unknown as { __pop?: unknown }).__pop = pc.ui.popover(
      document.querySelector('h1'),
      {
        title: 'About this page',
        body: 'Everything here prints through the same pipeline.',
        actions: [{ id: 'ok', label: 'Got it', tone: 'primary' }]
      },
      { document, window }
    );
  });

  const pop = page.locator('.prjs-pop');
  await expect(pop).toBeVisible();
  await expect(pop).toContainText('About this page');
  await expect(pop.locator('[data-prjs-action="ok"]')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(pop).toHaveCount(0);
});

/* the notes panel --------------------------------------------------------- */

test('every note and redaction can be listed, found and removed', async ({ page }) => {
  await page.evaluate(() => {
    const pc = (window as unknown as { Printcraft: Record<string, any> }).Printcraft;
    // the demo ships with a note of its own; start from a known state
    for (const el of document.querySelectorAll('[data-printcraft-note],[data-printcraft-redact]')) {
      el.removeAttribute('data-printcraft-note');
      el.removeAttribute('data-printcraft-redact');
    }
    document.querySelector('#report')!.setAttribute('data-printcraft-note', 'check with finance');
    document.querySelector('#memo')!.setAttribute('data-printcraft-redact', '');
    void pc.ui.notes();
  });

  const modal = page.locator('[data-prjs-modal]');
  await expect(modal).toBeVisible();
  await expect(modal.locator('.prjs-title')).toHaveText('Notes and redactions');

  const cards = modal.locator('[data-prjs-notes] .prjs-card');
  await expect(cards).toHaveCount(2);
  await expect(modal).toContainText('check with finance');
  // a badge each, so the shape of what is marked is readable at a glance
  await expect(modal.locator('.prjs-badge')).toHaveCount(2);

  // removing one takes it off the page as well as out of the list
  await cards.first().locator('[data-prjs-act="remove"]').click();
  await expect(cards).toHaveCount(1);
  await expect(page.locator('#report')).not.toHaveAttribute('data-printcraft-note');

  await page.locator('[data-prjs-modal] [data-prjs-modal-close]').click();
});

test('with nothing marked, the panel says so rather than showing an empty box', async ({
  page
}) => {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('[data-printcraft-note],[data-printcraft-redact]')) {
      el.removeAttribute('data-printcraft-note');
      el.removeAttribute('data-printcraft-redact');
    }
    const pc = (window as unknown as { Printcraft: Record<string, any> }).Printcraft;
    void pc.ui.notes();
  });

  await expect(page.locator('.prjs-empty')).toContainText('Nothing marked yet');
  await page.locator('[data-prjs-modal] [data-prjs-modal-close]').click();
});

/* multi-instance ---------------------------------------------------------- */

test('two interfaces on one page keep to their own scope', async ({ page }) => {
  await page.evaluate(() => {
    const pc = (window as unknown as { Printcraft: Record<string, any> }).Printcraft;
    // the shared one has to go, or it would answer for the whole document
    pc.ui.instance.destroy();

    (window as unknown as { __a?: unknown }).__a = pc.ui.create({
      scope: '#report',
      title: 'Report tools',
      items: ['print-element', 'inspect']
    });
    (window as unknown as { __b?: unknown }).__b = pc.ui.create({
      scope: '#memo',
      title: 'Memo tools',
      items: ['redact']
    });
  });

  const report = page.locator('#report p').first();
  await report.scrollIntoViewIfNeeded();
  await settle(page);
  await report.click({ button: 'right' });
  await expect(page.locator('[data-prjs-menu] .prjs-menu-title')).toHaveText('Report tools');
  await expect(page.locator('[data-prjs-menu] [data-prjs-item="print-element"]')).toBeVisible();
  await expect(page.locator('[data-prjs-menu] [data-prjs-item="redact"]')).toHaveCount(0);
  await page.keyboard.press('Escape');

  const memo = page.locator('#memo p').first();
  await memo.scrollIntoViewIfNeeded();
  await settle(page);
  await memo.click({ button: 'right' });
  await expect(page.locator('[data-prjs-menu] .prjs-menu-title')).toHaveText('Memo tools');
  await expect(page.locator('[data-prjs-menu] [data-prjs-item="redact"]')).toBeVisible();
  await page.keyboard.press('Escape');
});

/* the printed heading ----------------------------------------------------- */

test('a title and description are printed above the content', async ({ page }) => {
  const printed = await page.evaluate(async () => {
    let html = '';
    const pc = (window as unknown as { Printcraft: Record<string, any> }).Printcraft;
    await pc.print({
      target: '#report',
      documentTitle: 'Quarterly production report',
      documentDescription: 'Prepared for the board',
      // the demo's config sets printHeading: false, because the title there is
      // for the save-as-PDF filename rather than the paper
      printHeading: true,
      printHeadingMeta: true,
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

  expect(printed).toContain('Quarterly production report');
  expect(printed).toContain('Prepared for the board');
  expect(printed).toContain('prjs-heading-meta');
  expect(printed.indexOf('prjs-heading')).toBeLessThan(printed.indexOf('prjs-target'));
});

/* the share layer, as actions --------------------------------------------- */

test('screenshot, copy and email are menu entries like everything else', async ({ page }) => {
  await page.locator('h1').click({ button: 'right' });
  const menu = page.locator('[data-prjs-menu]');

  // contributed by /share when it loads, rather than imported by the catalogue,
  // so a page that only takes /ui does not pull a rasteriser in behind it
  await Promise.all(
    ['screenshot', 'copy-image', 'copy-markup', 'email'].map((id) =>
      expect(menu.locator(`[data-prjs-item="${id}"]`), id).toBeVisible()
    )
  );

  // and each group is drawn once, wherever its actions were contributed
  const groups = await menu.locator('.prjs-group').allTextContents();
  expect(new Set(groups).size, groups.join(' | ')).toBe(groups.length);
  expect(groups).toContain('Share');
});

test('the screenshot action saves a file named from the title', async ({ page }) => {
  const wait = page.waitForEvent('download');
  await page.evaluate(() => {
    const pc = (window as unknown as { Printcraft: Record<string, any> }).Printcraft;
    pc.ui.run('screenshot', document.querySelector('#report'));
  });

  const download = await wait;
  expect(download.suggestedFilename()).toMatch(/\.png$/);
});

test('a share action that fails says so rather than going quiet', async ({ page }) => {
  const message = await page.evaluate(async () => {
    const pc = (window as unknown as { Printcraft: Record<string, any> }).Printcraft;
    // no ClipboardItem means an image cannot go on the clipboard at all
    const real = (window as unknown as { ClipboardItem?: unknown }).ClipboardItem;
    delete (window as unknown as { ClipboardItem?: unknown }).ClipboardItem;

    pc.ui.run('copy-image');
    await new Promise((r) => setTimeout(r, 800));
    const text = document.querySelector('[data-prjs-toast]')?.textContent || '';
    (window as unknown as { ClipboardItem?: unknown }).ClipboardItem = real;
    return text;
  });

  expect(message).toContain('cannot put an image on the clipboard');
});

test('a configured title alone does not put a heading on the paper', async ({ page }) => {
  // the demo's config carries documentTitle for the filename and printHeading:
  // false. Without the second, every job on the page would grow a heading it
  // never asked for, which is the upgrade hazard the option exists for.
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

  expect(await page.evaluate(() => (window as any).Printcraft.defaults.documentTitle)).toBeTruthy();
  expect(printed).not.toContain('prjs-heading');
});

/* the surfaces you reported ----------------------------------------------- */
//
// Five defects, each reproduced in a browser before it was fixed. Every test
// here fails on the code that shipped in 2.0.0.

test('a menu taller than the viewport can be scrolled without closing', async ({ page }) => {
  // the demo's menu is ~1100px of content in a ~320px box, so reaching the rows
  // below the fold means scrolling it. The dismiss-on-scroll listener was bound
  // at the document in capture, so the menu's own scroll shut the menu.
  await page.setViewportSize({ width: 1280, height: 420 });
  await page.locator('h1').click({ button: 'right' });
  const menu = page.locator('[data-prjs-menu]');
  await expect(menu).toBeVisible();
  await settle(page);

  const box = (await menu.boundingBox())!;
  const overflows = await menu.evaluate((m) => m.scrollHeight > m.clientHeight + 2);
  expect(overflows, 'the fixture must actually overflow or this proves nothing').toBe(true);

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 200);
  await settle(page);

  await expect(menu, 'scrolling the menu must not dismiss it').toBeVisible();
  expect(await menu.evaluate((m) => m.scrollTop)).toBeGreaterThan(0);
});

test('scrolling the page underneath still closes the menu', async ({ page }) => {
  // the other half of the fix: the guard must be narrow enough that a real page
  // scroll — which moves what the menu points at — still dismisses it.
  await page.locator('h1').click({ button: 'right' });
  await expect(page.locator('[data-prjs-menu]')).toBeVisible();
  await settle(page);

  await page.evaluate(() => window.scrollBy(0, 200));
  await expect(page.locator('[data-prjs-menu]')).toHaveCount(0);
});

test('resizing the window keeps the menu and puts it back in view', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 700 });
  await page.locator('h1').click({ button: 'right' });
  const menu = page.locator('[data-prjs-menu]');
  await expect(menu).toBeVisible();
  await settle(page);

  await page.setViewportSize({ width: 900, height: 520 });
  await settle(page);

  await expect(menu, 'a resize is not a reason to throw the menu away').toBeVisible();
  const box = (await menu.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(900 + 1);
});

test('a modal with nothing to say has no empty body', async ({ page }) => {
  // notify maps `message` onto the header sub-line, so the body took nothing and
  // rendered as a bare 36px band between the title and the button.
  await page.evaluate(() => {
    void (window as any).Printcraft.ui.notify({
      title: 'Nope',
      message: 'It failed.',
      tone: 'danger'
    });
  });
  const panel = page.locator('[data-prjs-modal] .prjs-modal-box');
  await expect(panel).toBeVisible();

  await expect(panel.locator('.prjs-modal-body')).toHaveCount(0);
  await expect(panel.locator('.prjs-sub')).toHaveText('It failed.');
});

test('a modal that does have a body still renders one', async ({ page }) => {
  // the guard must not swallow real content
  await page.evaluate(() => {
    void (window as any).Printcraft.ui.confirm({
      title: 'Sure?',
      message: 'This cannot be undone.',
      detail: 'The text is replaced in the print copy.'
    });
  });
  const body = page.locator('[data-prjs-modal] .prjs-modal-body');
  await expect(body).toBeVisible();
  await expect(body).toContainText('replaced in the print copy');
});

test('every dismissible surface has exactly one icon close in its header', async ({ page }) => {
  // it used to be a text button reading "Close" beside a footer button reading
  // "OK", which is two controls for one action.
  await page.evaluate(() => {
    void (window as any).Printcraft.ui.notify({ title: 'Heads up', message: 'Done.' });
  });
  const panel = page.locator('[data-prjs-modal] .prjs-modal-box');
  await expect(panel).toBeVisible();

  const close = panel.locator('[data-prjs-modal-close]');
  await expect(close).toHaveCount(1);
  await expect(close).toHaveAttribute('aria-label', 'Close');
  await expect(close, 'an icon, not a word').toHaveText('');
  await expect(close.locator('svg')).toHaveCount(1);

  await close.click();
  await expect(panel).toHaveCount(0);
});

test('the command palette has a visible way out', async ({ page }) => {
  await openPalette(page);
  const close = page.locator('[data-prjs-palette] [data-prjs-modal-close]');
  await expect(close).toHaveCount(1);

  await close.click();
  await expect(page.locator('[data-prjs-palette]')).toHaveCount(0);
});

test('popovers and tooltips carry a caret that points at their anchor', async ({ page }) => {
  // the side is read back from the rendered geometry, not from what was asked
  // for: with CSS anchor positioning the browser applies position-try-fallbacks
  // itself and never tells us which way it went.
  const result = await page.evaluate(async () => {
    const wait = (): Promise<void> =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    const pc = (window as unknown as { Printcraft: Record<string, any> }).Printcraft;

    const anchor = document.createElement('button');
    anchor.textContent = 'anchor';
    anchor.style.cssText = 'position:fixed;top:340px;left:450px;width:80px;height:24px';
    document.body.appendChild(anchor);

    const sides: Record<string, unknown> = {};
    for (const side of ['top', 'bottom', 'left', 'right']) {
      const handle = pc.ui.popover(anchor, { title: 'T', body: 'Body.', side });
      // one at a time: each popover has to be opened, laid out and measured
      // before the next, or they anchor on top of one another
      // oxlint-disable-next-line no-await-in-loop
      await wait();
      const pop = document.querySelector('.prjs-pop')!;
      const caret = pop.querySelector('.prjs-caret');
      sides[side] = {
        resolved: pop.getAttribute('data-side'),
        hasCaret: !!caret,
        at: pop.style.getPropertyValue('--prjs-caret-at')
      };
      handle.close();
    }

    // jammed against the top of the viewport, "top" has to become "bottom"
    anchor.style.top = '2px';
    const handle = pc.ui.popover(anchor, { title: 'T', body: 'x', side: 'top' });
    await wait();
    const flipped = document.querySelector('.prjs-pop')!.getAttribute('data-side');
    handle.close();
    anchor.remove();

    return { sides, flipped };
  });

  for (const side of ['top', 'bottom', 'left', 'right']) {
    const seen = (
      result.sides as Record<string, { resolved: string; hasCaret: boolean; at: string }>
    )[side]!;
    expect(seen.hasCaret, side + ' has no caret').toBe(true);
    expect(seen.resolved, side + ' resolved wrong').toBe(side);
    expect(seen.at, side + ' never got an offset').toMatch(/\d+px/);
  }
  expect(result.flipped, 'with no room above, the caret must face the other way').toBe('bottom');
});

test('a tooltip caret is the same colour as the tooltip', async ({ page }) => {
  // one rule serves both surfaces through `background: inherit`; a caret that
  // hard-coded a colour would be the wrong one on the dark tooltip.
  const seen = await page.evaluate(async () => {
    const pc = (window as unknown as { Printcraft: Record<string, any> }).Printcraft;
    const anchor = document.createElement('button');
    anchor.style.cssText = 'position:fixed;top:340px;left:450px;width:80px;height:24px';
    document.body.appendChild(anchor);

    pc.ui.tooltip(anchor, { text: 'Tip text', side: 'top' });
    anchor.dispatchEvent(new FocusEvent('focus'));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const tip = document.querySelector('.prjs-tip')!;
    const caret = tip.querySelector('.prjs-caret')!;
    return {
      caret: getComputedStyle(caret).backgroundColor,
      surface: getComputedStyle(tip).backgroundColor,
      text: tip.textContent
    };
  });

  expect(seen.caret).toBe(seen.surface);
  expect(seen.text, 'the caret must not add text to the label').toBe('Tip text');
});
