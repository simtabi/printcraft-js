// node:assert-shaped helpers on top of vitest's expect.
//
// the suites were written against node:assert and read well that way — the
// assertion reads as a sentence about the subject. keeping that shape made the
// port to vitest a mechanical, reviewable diff instead of a rewrite.

import { expect } from 'vitest';

export function expect_eq(actual: unknown, expected: unknown, message?: string): void {
  expect(actual, message).toBe(expected);
}

export function expect_deep(actual: unknown, expected: unknown, message?: string): void {
  expect(actual, message).toEqual(expected);
}

export function expect_match(actual: unknown, pattern: RegExp, message?: string): void {
  expect(String(actual), message).toMatch(pattern);
}

export function expect_ok(actual: unknown, message?: string): void {
  expect(actual, message).toBeTruthy();
}

export function expect_throws(fn: () => unknown, pattern?: RegExp): void {
  expect(fn).toThrow(pattern);
}

export function expect_no_throw(fn: () => unknown): void {
  expect(fn).not.toThrow();
}

export async function expect_rejects(
  fn: (() => Promise<unknown>) | Promise<unknown>,
  pattern?: RegExp
): Promise<void> {
  const p = typeof fn === 'function' ? fn() : fn;
  await expect(p).rejects.toThrow(pattern);
}
