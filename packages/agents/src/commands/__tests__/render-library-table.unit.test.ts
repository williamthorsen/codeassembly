import { describe, expect, it } from 'vitest';

import { type LibraryRow, renderLibraryTable } from '../render-library-table.ts';
import { FIXTURE_SOURCE_NAME } from '../test-utils/declare-fixture-source.ts';

describe(renderLibraryTable, () => {
  it('sorts rows by type (rulebook, skill, subagent), then by slug', () => {
    const rows: Array<LibraryRow> = [
      makeRow({ type: 'subagent', slug: 'bravo' }),
      makeRow({ type: 'skill', slug: 'zulu' }),
      makeRow({ type: 'skill', slug: 'alpha' }),
      makeRow({ type: 'rulebook', slug: 'romeo' }),
    ];

    const output = renderLibraryTable(rows, 100, 'plain');
    const order = ['romeo', 'alpha', 'zulu', 'bravo'].map((slug) => output.indexOf(slug));

    expect(order).toEqual(order.toSorted((a, b) => a - b));
    expect(order.every((index) => index >= 0)).toBe(true);
  });

  it('renders a header and one line per row with the synthesized delivery value', () => {
    const rows: Array<LibraryRow> = [
      makeRow({ type: 'rulebook', slug: 'shell-conventions', delivery: 'ambient, skill' }),
      makeRow({ type: 'skill', slug: 'add-test-ids', delivery: 'skill' }),
      makeRow({ type: 'subagent', slug: 'planner', delivery: 'install' }),
    ];

    const lines = renderLibraryTable(rows, 100, 'rich').split('\n');

    expect(lines[0]).toContain('type');
    expect(lines[0]).toContain('slug');
    expect(lines[0]).toContain('source');
    expect(lines[0]).toContain('delivery');
    expect(lines[0]).toContain('description');
    expect(lines[1]).toContain('📕 rulebook');
    expect(lines[1]).toContain('ambient, skill');
    expect(lines[2]).toContain('🪄 skill');
    expect(lines[3]).toContain('🤖 subagent');
  });

  it('aligns every column in each style, with a plain type cell holding the label alone', () => {
    const rows: Array<LibraryRow> = [
      makeRow({ type: 'rulebook', slug: 'shell-conventions', delivery: 'ambient' }),
      makeRow({ type: 'skill', slug: 'add-test-ids', delivery: 'skill' }),
    ];

    expect(renderLibraryTable(rows, 100, 'rich').split('\n')).toEqual([
      'type         slug               source        delivery  description',
      `📕 rulebook  shell-conventions  ${FIXTURE_SOURCE_NAME}  ambient   A description.`,
      `🪄 skill     add-test-ids       ${FIXTURE_SOURCE_NAME}  skill     A description.`,
    ]);
    expect(renderLibraryTable(rows, 100, 'plain').split('\n')).toEqual([
      'type      slug               source        delivery  description',
      `rulebook  shell-conventions  ${FIXTURE_SOURCE_NAME}  ambient   A description.`,
      `skill     add-test-ids       ${FIXTURE_SOURCE_NAME}  skill     A description.`,
    ]);
  });

  it('wraps a long description with a hanging indent aligned under the description column', () => {
    const row = makeRow({
      type: 'skill',
      slug: 'demo',
      delivery: 'skill',
      description: 'one two three four five six seven eight nine ten',
    });

    // Column widths for this single row: type = 8 (`🪄 skill`), slug = 4 (`demo`), source = 12 (the fixture source
    // name), delivery = 8 (`delivery` header). With gaps of 2 the description starts at column
    // 8 + 2 + 4 + 2 + 12 + 2 + 8 + 2 = 40; width 60 leaves a 20-cell description column.
    const lines = renderLibraryTable([row], 60, 'rich').split('\n');
    const continuations = lines.slice(1).filter((line) => /^ +\S/.test(line));

    expect(lines[1]).toMatch(/one two three four$/);
    expect(continuations).toEqual([`${' '.repeat(40)}five six seven eight`, `${' '.repeat(40)}nine ten`]);
  });

  it('sorts rows of one slug by source precedence and marks a shadowed row in the source column', () => {
    const rows: Array<LibraryRow> = [
      makeRow({ slug: 'demo', source: 'low', precedence: 2, isShadowed: true, description: 'Low.' }),
      makeRow({ slug: 'demo', source: 'high', precedence: 0, isShadowed: false, description: 'High.' }),
      makeRow({ slug: 'demo', source: 'mid', precedence: 1, isShadowed: true, description: 'Mid.' }),
    ];

    expect(renderLibraryTable(rows, 100, 'plain').split('\n')).toEqual([
      'type   slug  source          delivery  description',
      'skill  demo  high            skill     High.',
      'skill  demo  mid (shadowed)  skill     Mid.',
      'skill  demo  low (shadowed)  skill     Low.',
    ]);
  });
});

// region | Helpers

/** Builds a `LibraryRow` with sensible defaults, overriding only the fields that a test cares about. */
function makeRow(overrides: Partial<LibraryRow>): LibraryRow {
  return {
    type: 'skill',
    slug: 'slug',
    source: FIXTURE_SOURCE_NAME,
    precedence: 0,
    isShadowed: false,
    delivery: 'skill',
    description: 'A description.',
    ...overrides,
  };
}

// endregion | Helpers
