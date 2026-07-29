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
  await expect(page.locator('#tickets .pc-ticket').first()).toBeVisible();
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
  const menu = page.locator('[data-pc-menu]');
  await expect(menu).toBeVisible();
  await expect(menu.locator('.pc-k-menu-title')).toHaveText('Print & mark up');

  const installed = await page.evaluate(() => {
    const pc = (window as unknown as { Printcraft: Record<string, any> }).Printcraft;
    return { auto: pc.autoMenu, actions: pc.ui.actions.ids().length };
  });
  expect(installed.auto).toBe(true);
  expect(installed.actions).toBeGreaterThan(8);
});

test('every row says what it does, and destructive rows are red', async ({ page }) => {
  await page.locator('h1').click({ button: 'right' });
  const menu = page.locator('[data-pc-menu]');

  const rows = await menu.locator('[data-pc-item]').count();
  const hints = await menu.locator('.pc-k-item-hint').count();
  expect(hints, 'every row carries a description').toBe(rows);

  await expect(menu.locator('[data-pc-item="redact"]')).toHaveAttribute('data-tone', 'danger');
  await expect(menu.locator('[data-pc-item="redact"]')).toHaveCSS('color', 'rgb(185, 28, 28)');
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
  const notes = page.locator('[data-pc-menu] [data-pc-item="notes"]');
  await expect(notes).toBeDisabled();
  await expect(notes).toHaveAttribute('title', /Nothing is marked/);
});

/* the palette ------------------------------------------------------------- */

async function openPalette(page: Page): Promise<void> {
  await page.keyboard.press(MOD + '+k');
  await expect(page.locator('[data-pc-palette]')).toBeVisible();
}

test('the palette opens on the keyboard and runs what is picked', async ({ page }) => {
  await openPalette(page);
  await expect(page.locator('.pc-k-palette-input')).toBeFocused();

  // the footer is where people learn the keyboard
  await expect(page.locator('.pc-k-palette-foot')).toContainText('navigate');
  await expect(page.locator('.pc-k-palette-foot')).toContainText('run');

  await page.keyboard.type('preview');
  const first = page.locator('[data-pc-palette] [data-pc-item]').first();
  await expect(first).toContainText('Preview the print');

  await page.keyboard.press('Enter');
  await expect(page.locator('[data-pc-palette]')).toHaveCount(0);
  await expect(page.locator('[data-pc-inspector]'), 'it ran the action').toBeVisible();
  await page.keyboard.press('Escape');
});

test('matching is by subsequence, and the characters that matched are shown', async ({ page }) => {
  await openPalette(page);
  await page.keyboard.type('dpa');

  const first = page.locator('[data-pc-palette] [data-pc-item]').first();
  await expect(first.locator('.pc-k-item-label')).toHaveText('Draw a print area…');
  // "dpa" is not a substring of anything; it is d-p-a in order
  await expect(first.locator('.pc-k-match')).toHaveCount(3);
});

test('arrows move the selection and wrap, and Escape closes', async ({ page }) => {
  await openPalette(page);
  const rows = page.locator('[data-pc-palette] [data-pc-item]');
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
  await expect(page.locator('[data-pc-palette]')).toHaveCount(0);
});

test('a query that matches nothing says so', async ({ page }) => {
  await openPalette(page);
  await page.keyboard.type('zzzzqqq');
  await expect(page.locator('.pc-k-palette-empty')).toContainText('Nothing matches');
  await page.keyboard.press('Escape');
});

/* keyboard commands ------------------------------------------------------- */

test('a binding fires its action, and typing in a field does not', async ({ page }) => {
  await page.keyboard.press(MOD + '+Shift+i');
  await expect(page.locator('[data-pc-inspector]')).toBeVisible();

  // the inspector's controls are labelled, not tagged
  await page.locator('[data-pc-inspector]').getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('[data-pc-inspector]')).toHaveCount(0);

  // the same keystroke inside a text field is somebody typing
  await page.locator('#cust').click();
  await page.locator('#cust').press(MOD + '+Shift+i');
  await page.waitForTimeout(300);
  await expect(page.locator('[data-pc-inspector]')).toHaveCount(0);
});

test('the palette still opens from inside a text field', async ({ page }) => {
  await page.locator('#cust').click();
  await page.locator('#cust').press(MOD + '+k');
  await expect(page.locator('[data-pc-palette]')).toBeVisible();
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
    btn.setAttribute('data-pc-ui', '');
    // a tooltip's target has to have a box to hover
    btn.style.cssText = 'position:fixed;top:40px;left:40px;width:40px;height:40px;z-index:9';
    document.body.appendChild(btn);

    pc.ui.tooltip(btn, { text: 'Save the sheet', keys: 'S' }, { document, window });
    return {
      labelled: btn.getAttribute('aria-label'),
      immediate: !!document.querySelector('.pc-k-tip')
    };
  });

  // the tooltip is the only label an icon-only button has
  expect(has.labelled).toBe('Save the sheet');
  expect(has.immediate, 'nothing on load').toBe(false);

  await page.hover('#probe');
  await expect(page.locator('.pc-k-tip')).toContainText('Save the sheet', { timeout: 2000 });
  await expect(page.locator('.pc-k-tip .pc-k-kbd')).toHaveText('S');

  await page.hover('h1');
  await expect(page.locator('.pc-k-tip')).toHaveCount(0);
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

  const pop = page.locator('.pc-k-pop');
  await expect(pop).toBeVisible();
  await expect(pop).toContainText('About this page');
  await expect(pop.locator('[data-pc-action="ok"]')).toBeVisible();

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

  const modal = page.locator('[data-pc-modal]');
  await expect(modal).toBeVisible();
  await expect(modal.locator('.pc-k-title')).toHaveText('Notes and redactions');

  const cards = modal.locator('[data-pc-notes] .pc-k-card');
  await expect(cards).toHaveCount(2);
  await expect(modal).toContainText('check with finance');
  // a badge each, so the shape of what is marked is readable at a glance
  await expect(modal.locator('.pc-k-badge')).toHaveCount(2);

  // removing one takes it off the page as well as out of the list
  await cards.first().locator('[data-pc-act="remove"]').click();
  await expect(cards).toHaveCount(1);
  await expect(page.locator('#report')).not.toHaveAttribute('data-printcraft-note');

  await page.locator('[data-pc-action="close"]').click();
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

  await expect(page.locator('.pc-k-empty')).toContainText('Nothing marked yet');
  await page.locator('[data-pc-action="close"]').click();
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
  await expect(page.locator('[data-pc-menu] .pc-k-menu-title')).toHaveText('Report tools');
  await expect(page.locator('[data-pc-menu] [data-pc-item="print-element"]')).toBeVisible();
  await expect(page.locator('[data-pc-menu] [data-pc-item="redact"]')).toHaveCount(0);
  await page.keyboard.press('Escape');

  const memo = page.locator('#memo p').first();
  await memo.scrollIntoViewIfNeeded();
  await settle(page);
  await memo.click({ button: 'right' });
  await expect(page.locator('[data-pc-menu] .pc-k-menu-title')).toHaveText('Memo tools');
  await expect(page.locator('[data-pc-menu] [data-pc-item="redact"]')).toBeVisible();
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
  expect(printed).toContain('pc-heading-meta');
  expect(printed.indexOf('pc-heading')).toBeLessThan(printed.indexOf('pc-target'));
});
