import { describe, expect, it } from 'vitest';

import { countPreambleColumns, estimatePreambleHeight, packPreamble } from '../pack-preamble.ts';

// A one-line entry is 20px tall, and a two-line one 40px; entries in a column are 4px apart.
const ONE_LINE = 'Greet the user';
const TWO_LINES = 'x'.repeat(100);

describe(packPreamble, () => {
  it.each([
    { lines: [1, 1, 1], limit: 1, columns: 1, columnHeight: 3 * 20 + 2 * 4 },
    { lines: [1, 1, 1, 1], limit: 2, columns: 2, columnHeight: 2 * 20 + 4 },
    { lines: [2, 1, 1], limit: 3, columns: 3, columnHeight: 40 },
    { lines: [1, 1, 2], limit: 2, columns: 2, columnHeight: 2 * 20 + 4 },
    { lines: [1, 1], limit: 5, columns: 2, columnHeight: 20 },
  ])(
    'if $lines-line entries may take $limit columns, fills $columns columns $columnHeight px tall',
    ({ lines, limit, columns, columnHeight }) => {
      expect(packPreamble(buildEntries(lines), limit)).toStrictEqual({ columns, columnHeight });
    },
  );

  it('clamps a long entry to two lines, so that it is never taller than a two-line one', () => {
    expect(packPreamble([{ text: 'x'.repeat(500), gate: false }], 1)).toStrictEqual(packPreamble(buildEntries([2]), 1));
  });
});

describe(estimatePreambleHeight, () => {
  it('adds the 16px heading and the 8px gap below to a single column of the entries', () => {
    expect(estimatePreambleHeight(buildEntries([1, 2]), 1)).toBe(16 + 20 + 4 + 40 + 8);
  });

  it('lowers the estimate when the entries may take more columns', () => {
    const entries = buildEntries([1, 1, 1, 1]);

    expect(estimatePreambleHeight(entries, 2)).toBeLessThan(estimatePreambleHeight(entries, 1));
  });

  it('returns zero for a flow without ambient instructions', () => {
    expect(estimatePreambleHeight([], 3)).toBe(0);
  });
});

describe(countPreambleColumns, () => {
  // Two 480px columns, the 32px gap between them, and the flow's 28px and 20px paddings take 1040px.
  it.each([
    { width: 0, columns: 1 },
    { width: 1039, columns: 1 },
    { width: 1040, columns: 2 },
    { width: 1551, columns: 2 },
    { width: 1552, columns: 3 },
  ])('if a flow is $width px wide, fits $columns columns', ({ width, columns }) => {
    expect(countPreambleColumns(width)).toBe(columns);
  });
});

// region | Helpers
/** Builds ambient entries that take the given numbers of lines, one entry per number. */
function buildEntries(lines: number[]): { text: string; gate: boolean }[] {
  return lines.map((count) => ({ text: count === 1 ? ONE_LINE : TWO_LINES, gate: false }));
}
// endregion | Helpers
