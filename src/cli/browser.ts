// Driving a real browser from the command line.
//
// Playwright is an optional peer, so a browser user never downloads 200 MB of
// Chromium to import a print library. It is loaded on demand and, when missing,
// the message says exactly what to install rather than surfacing a bare
// ERR_MODULE_NOT_FOUND.

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export interface BrowserPage {
  goto(url: string, options?: unknown): Promise<unknown>;
  addScriptTag(options: { content?: string; path?: string }): Promise<unknown>;
  evaluate<T>(fn: (arg: never) => T | Promise<T>, arg?: unknown): Promise<T>;
  pdf(options?: Record<string, unknown>): Promise<Buffer>;
  screenshot(options?: Record<string, unknown>): Promise<Buffer>;
  content(): Promise<string>;
  close(): Promise<void>;
}

export interface Session {
  page: BrowserPage;
  close(): Promise<void>;
}

const MISSING =
  'Printcraft: this command needs Playwright, which is an optional peer so that browser ' +
  'users do not download a browser.\n\n  npm install -D playwright\n  npx playwright install chromium\n';

/** Loads playwright, or explains what to install. */
export async function loadPlaywright(): Promise<{
  chromium: { launch(o?: Record<string, unknown>): Promise<unknown> };
}> {
  try {
    return (await import('playwright')) as never;
  } catch {
    try {
      return (await import('playwright-core')) as never;
    } catch {
      throw new Error(MISSING);
    }
  }
}

/** A url for a path that may be a local file or an address. */
export function toUrl(target: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return target;
  const path = resolve(process.cwd(), target);
  if (!existsSync(path)) {
    throw new Error('Printcraft: no such file: ' + target);
  }
  return pathToFileURL(path).href;
}

/**
 * Opens a page with the library already on it.
 *
 * The bundle is injected as inline source rather than a script tag pointing at
 * a path, so this works against a `file://` page, where fetching a sibling is
 * blocked and a tag would silently do nothing.
 */
export async function open(
  url: string,
  options: { bundle: string; viewport?: { width: number; height: number }; timeout?: number }
): Promise<Session> {
  const { chromium } = await loadPlaywright();
  const browser = (await chromium.launch()) as {
    newContext(o?: unknown): Promise<{
      newPage(): Promise<BrowserPage>;
      close(): Promise<void>;
    }>;
    close(): Promise<void>;
  };

  const context = await browser.newContext({
    viewport: options.viewport || { width: 1280, height: 900 }
  });
  const page = await context.newPage();

  await page.goto(url, { waitUntil: 'networkidle', timeout: options.timeout ?? 30_000 });
  await page.addScriptTag({ content: await readFile(options.bundle, 'utf8') });

  return {
    page,
    async close() {
      await context.close();
      await browser.close();
    }
  };
}
