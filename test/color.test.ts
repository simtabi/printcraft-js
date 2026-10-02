// The colour picker's loader: per-field options, and a failed load that is not
// remembered forever. Coloris itself is replaced by a recorder.

import { test, expect, vi } from 'vitest';
import { dom } from './harness';

const calls = vi.hoisted(() => ({
  init: 0,
  coloris: [] as unknown[],
  instances: [] as unknown[][]
}));

vi.mock('@melloware/coloris', () => ({
  default: {
    init: () => {
      // the first load fails, as a blocked chunk or a network blip would
      if (++calls.init === 1) throw new Error('chunk failed');
    },
    coloris: (o: unknown) => calls.coloris.push(o),
    setInstance: (selector: string, o: unknown) => calls.instances.push([selector, o])
  }
}));

const tick = (ms = 0): Promise<void> => new Promise((r) => setTimeout(r, ms));

test('a picker that failed to load is tried again, not given up on for the page', async () => {
  const { buildColorField } = await import('../src/ui/kit/color');
  const d = dom('');
  const doc = d.window.document;

  const first = buildColorField(doc, 'ink-a', {});
  doc.body.appendChild(first.element);
  await tick(5);
  expect(first.input.hasAttribute('data-prjs-color-fallback'), 'the first load failed').toBe(true);

  const second = buildColorField(doc, 'ink-b', {});
  doc.body.appendChild(second.element);
  await tick(5);
  expect(calls.coloris.length, 'the next field loads it').toBeGreaterThan(0);
  expect(second.input.hasAttribute('data-prjs-color-fallback')).toBe(false);
});

test('a field without an opacity channel gets a picker without one', async () => {
  // alpha was configured once for every field, and the data-alpha attribute
  // the field writes was never read, so a border colour offered opacity
  const { buildColorField } = await import('../src/ui/kit/color');
  const d = dom('');
  const doc = d.window.document;
  const field = buildColorField(doc, 'border', { alpha: false });
  doc.body.appendChild(field.element);
  await tick(5);
  expect(calls.instances).toContainEqual([
    '.prjs-color-input[data-alpha="false"]',
    { alpha: false }
  ]);
});
