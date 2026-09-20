import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import type { Taxonomy } from '../../change-grammar/types.ts';
import { type ChangeEntry, consolidateChangeEntries, readChangeEntries } from '../change-entries.ts';

const TAXONOMY: Taxonomy = {
  tiers: ['public', 'internal', 'process'],
  types: [
    { key: 'feat', tier: 'public' },
    { key: 'drop', tier: 'public' },
    { key: 'fix', tier: 'public' },
    { key: 'sec', tier: 'public' },
    { key: 'refactor', tier: 'internal' },
    { key: 'docs', tier: 'process' },
  ],
};

describe(consolidateChangeEntries, () => {
  it('consolidates entries that agree on one scope to that scope', () => {
    const entries = [buildEntry({ scopes: ['agents'], type: 'fix' }), buildEntry({ scopes: ['agents'], type: 'feat' })];

    expect(consolidateChangeEntries(entries, TAXONOMY)).toStrictEqual({ scope: 'agents', type: 'feat' });
  });

  it('drops the scope when one entry names two of them', () => {
    const entries = [buildEntry({ scopes: ['agents', 'kb'], type: 'feat' })];

    expect(consolidateChangeEntries(entries, TAXONOMY)).toStrictEqual({ type: 'feat' });
  });

  it('drops the scope when two entries name different ones', () => {
    const entries = [buildEntry({ scopes: ['agents'], type: 'feat' }), buildEntry({ scopes: ['kb'], type: 'fix' })];

    expect(consolidateChangeEntries(entries, TAXONOMY)).toStrictEqual({ type: 'feat' });
  });

  it('ranks an entry that names no scope, so a change touching nothing scoped still resolves a type', () => {
    const entries = [buildEntry({ scopes: [], type: 'refactor' })];

    expect(consolidateChangeEntries(entries, TAXONOMY)).toStrictEqual({ type: 'refactor' });
  });

  it('keeps the scope of a scoped entry when another entry names none', () => {
    const entries = [buildEntry({ scopes: ['agents'], type: 'feat' }), buildEntry({ scopes: [], type: 'docs' })];

    expect(consolidateChangeEntries(entries, TAXONOMY)).toStrictEqual({ scope: 'agents', type: 'feat' });
  });

  it('lets a breaking entry outrank a non-breaking one of a higher-listed type', () => {
    const entries = [
      buildEntry({ breaking: true, scopes: ['agents'], type: 'fix' }),
      buildEntry({ scopes: ['agents'], type: 'feat' }),
    ];

    expect(consolidateChangeEntries(entries, TAXONOMY)).toStrictEqual({
      breaking: true,
      scope: 'agents',
      type: 'fix',
    });
  });

  it('skips an entry whose type the taxonomy does not declare', () => {
    const entries = [
      buildEntry({ scopes: ['agents'], type: 'invented' }),
      buildEntry({ scopes: ['agents'], type: 'fix' }),
    ];

    expect(consolidateChangeEntries(entries, TAXONOMY)).toStrictEqual({ scope: 'agents', type: 'fix' });
  });

  it('consolidates an empty list to an empty record', () => {
    expect(consolidateChangeEntries([], TAXONOMY)).toStrictEqual({});
  });
});

describe(readChangeEntries, () => {
  it('reads the list that entry-drafter returns', () => {
    const value = parseYaml(
      [
        '- type: feat',
        '  scopes: [agents, kb]',
        '  breaking: false',
        '  text: Adds the store-qualified wikilink',
        '- type: fix',
        '  scopes: [agents]',
        '  breaking: true',
        '  text: Stops the sync from deleting a subagent',
      ].join('\n'),
    );

    expect(readChangeEntries(value)).toStrictEqual({
      entries: [
        { breaking: false, scopes: ['agents', 'kb'], text: 'Adds the store-qualified wikilink', type: 'feat' },
        { breaking: true, scopes: ['agents'], text: 'Stops the sync from deleting a subagent', type: 'fix' },
      ],
    });
  });

  it('reads an omitted scopes and breaking as empty and not breaking', () => {
    const value = parseYaml('- type: docs\n  text: Records the grammar\n');

    expect(readChangeEntries(value)).toStrictEqual({
      entries: [{ breaking: false, scopes: [], text: 'Records the grammar', type: 'docs' }],
    });
  });

  it('ignores a key that the grammar does not declare', () => {
    const value = parseYaml('- type: docs\n  text: Records the grammar\n  commit: abc1234\n');

    expect(readChangeEntries(value)).toStrictEqual({
      entries: [{ breaking: false, scopes: [], text: 'Records the grammar', type: 'docs' }],
    });
  });

  it('reads an empty list as no entries', () => {
    expect(readChangeEntries([])).toStrictEqual({ entries: [] });
  });

  it.each<{ defect: string; name: string; value: unknown }>([
    { name: 'a mapping', value: { type: 'feat' }, defect: 'the entries are not a list' },
    { name: 'a string', value: 'feat', defect: 'the entries are not a list' },
    { name: 'a null', value: null, defect: 'the entries are not a list' },
    { name: 'an item that is a string', value: ['feat'], defect: '`entries[0]` is not a mapping' },
    { name: 'an item that is a list', value: [[]], defect: '`entries[0]` is not a mapping' },
    {
      name: 'a non-boolean breaking',
      value: [{ breaking: 'yes', text: 'Adds foo', type: 'feat' }],
      defect: '`entries[0].breaking` is not a boolean',
    },
    {
      name: 'a non-list scopes',
      value: [{ scopes: 'agents', text: 'Adds foo', type: 'feat' }],
      defect: '`entries[0].scopes` is not a list',
    },
    {
      name: 'a non-string scope',
      value: [{ scopes: ['agents', 7], text: 'Adds foo', type: 'feat' }],
      defect: '`entries[0].scopes[1]` is not a string',
    },
    { name: 'a missing type', value: [{ text: 'Adds foo' }], defect: '`entries[0].type` is missing' },
    { name: 'a missing text', value: [{ type: 'feat' }], defect: '`entries[0].text` is missing' },
    {
      name: 'a non-string type',
      value: [{ text: 'Adds foo', type: 7 }],
      defect: '`entries[0].type` is not a string',
    },
    { name: 'a blank text', value: [{ text: '  ', type: 'feat' }], defect: '`entries[0].text` is empty' },
    {
      name: 'a defective second item',
      value: [{ text: 'Adds foo', type: 'feat' }, { type: 'fix' }],
      defect: '`entries[1].text` is missing',
    },
  ])('refuses $name', ({ defect, value }) => {
    expect(readChangeEntries(value)).toStrictEqual({ defect });
  });
});

// region | Helpers

/** Builds a change entry from the fields that the case under test varies. */
function buildEntry(fields: Partial<ChangeEntry> & Pick<ChangeEntry, 'scopes' | 'type'>): ChangeEntry {
  return { breaking: false, text: `Reports the ${fields.type} outcome`, ...fields };
}

// endregion | Helpers
