import { describe, expect, it } from 'vitest';

import type { Example } from '../../../examples/examples.ts';
import {
  buildVisualizationRows,
  sortVisualizationRows,
  type StoredFileKind,
  type VisualizationColumn,
  type VisualizationRow,
} from '../visualization-rows.ts';

const STORED_FILES = [
  { name: 'Reset passwords.md', modifiedAt: '2026-03-03T00:00:00.000Z' },
  { name: 'onboarding.agent-logic.json', modifiedAt: '2026-02-02T00:00:00.000Z' },
  { name: 'Expense claims.agent-logic.json', modifiedAt: '2026-01-01T00:00:00.000Z' },
];

const EXAMPLES: Example[] = [
  { name: 'Change approval', slug: 'change-approval', value: {} },
  { name: 'Password reset', slug: 'password-reset', value: {} },
];

describe(buildVisualizationRows, () => {
  it('lists the stored files in their given order, then the examples, each with the kind that `readKind` gives', () => {
    const rows = buildVisualizationRows(STORED_FILES, EXAMPLES, { readKind: readPromptKind });

    expect(rows.map(({ name, kind, file, modifiedAt, href }) => ({ name, kind, file, modifiedAt, href }))).toEqual([
      {
        name: 'Reset passwords',
        kind: 'prompt',
        file: 'Reset passwords.md',
        modifiedAt: '2026-03-03T00:00:00.000Z',
        href: '?file=Reset+passwords.md',
      },
      {
        name: 'onboarding',
        kind: 'chart',
        file: 'onboarding.agent-logic.json',
        modifiedAt: '2026-02-02T00:00:00.000Z',
        href: '?file=onboarding.agent-logic.json',
      },
      {
        name: 'Expense claims',
        kind: 'chart',
        file: 'Expense claims.agent-logic.json',
        modifiedAt: '2026-01-01T00:00:00.000Z',
        href: '?file=Expense+claims.agent-logic.json',
      },
      {
        name: 'Change approval',
        kind: 'chart',
        file: undefined,
        modifiedAt: undefined,
        href: '?example=change-approval',
      },
      {
        name: 'Password reset',
        kind: 'chart',
        file: undefined,
        modifiedAt: undefined,
        href: '?example=password-reset',
      },
    ]);
  });

  it('gives every stored file the chart kind without `readKind`', () => {
    const rows = buildVisualizationRows(STORED_FILES, []);

    expect(rows.map(({ name, kind }) => ({ name, kind }))).toEqual([
      { name: 'Reset passwords.md', kind: 'chart' },
      { name: 'onboarding', kind: 'chart' },
      { name: 'Expense claims', kind: 'chart' },
    ]);
  });

  it('opens a stored file by its name and an example by itself', () => {
    const rows = buildVisualizationRows(STORED_FILES.slice(1, 2), EXAMPLES.slice(0, 1));

    expect(rows.map(({ target }) => target)).toEqual([
      { kind: 'file', name: 'onboarding.agent-logic.json' },
      { kind: 'example', example: EXAMPLES[0] },
    ]);
  });
});

describe(sortVisualizationRows, () => {
  const rows = buildVisualizationRows(STORED_FILES, EXAMPLES, { readKind: readPromptKind });

  it('keeps the given order without a sort', () => {
    expect(sortVisualizationRows(rows, undefined)).toBe(rows);
  });

  it.each<{ column: VisualizationColumn; ascending: string[]; descending: string[] }>([
    {
      column: 'name',
      ascending: ['Change approval', 'Expense claims', 'onboarding', 'Password reset', 'Reset passwords'],
      descending: ['Reset passwords', 'Password reset', 'onboarding', 'Expense claims', 'Change approval'],
    },
    {
      column: 'kind',
      ascending: ['onboarding', 'Expense claims', 'Change approval', 'Password reset', 'Reset passwords'],
      descending: ['Reset passwords', 'onboarding', 'Expense claims', 'Change approval', 'Password reset'],
    },
    {
      column: 'file',
      ascending: ['Expense claims', 'onboarding', 'Reset passwords', 'Change approval', 'Password reset'],
      descending: ['Reset passwords', 'onboarding', 'Expense claims', 'Change approval', 'Password reset'],
    },
    {
      column: 'modified',
      ascending: ['Expense claims', 'onboarding', 'Reset passwords', 'Change approval', 'Password reset'],
      descending: ['Reset passwords', 'onboarding', 'Expense claims', 'Change approval', 'Password reset'],
    },
  ])('sorts by $column both ways, keeping equal values in their given order', ({ column, ascending, descending }) => {
    expect(listNames(sortVisualizationRows(rows, { column, direction: 'ascending' }))).toEqual(ascending);
    expect(listNames(sortVisualizationRows(rows, { column, direction: 'descending' }))).toEqual(descending);
  });

  it('sorts the kind column by the label that `labelKind` returns', () => {
    const labels = { chart: 'Visualization', prompt: 'Prompt' };
    const sorted = sortVisualizationRows(
      rows,
      { column: 'kind', direction: 'ascending' },
      { labelKind: (kind) => labels[kind] },
    );

    expect(listNames(sorted)).toEqual([
      'Reset passwords',
      'onboarding',
      'Expense claims',
      'Change approval',
      'Password reset',
    ]);
  });
});

// region | Helpers
/** Returns the rows' names, in order. */
function listNames(rows: Array<VisualizationRow<string>>): string[] {
  return rows.map(({ name }) => name);
}

/** Reads a `.md` file as a prompt named without its suffix, and any other file as a chart. */
function readPromptKind(fileName: string): StoredFileKind<'prompt'> | undefined {
  return fileName.endsWith('.md') ? { kind: 'prompt', name: fileName.slice(0, -'.md'.length) } : undefined;
}
// endregion | Helpers
