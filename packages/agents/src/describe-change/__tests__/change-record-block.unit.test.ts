import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { isRecord } from '../../lib/type-guards.ts';
import type { ChangeEntry } from '../change-entries.ts';
import {
  type ChangeRecordBlock,
  readChangeRecordBlock,
  readMergeChangeRecordBlock,
  renderChangeRecordBlock,
  renderMergeChangeRecordBlock,
  stripChangeRecordBlocks,
} from '../change-record-block.ts';

const MERGE_ENTRIES: ChangeEntry[] = [
  { breaking: false, scopes: ['agents', 'kb'], text: 'Adds the store-qualified wikilink', type: 'feat' },
  { breaking: true, migration: 'Import `read` from `kb`', scopes: [], text: 'Removes the legacy reader', type: 'drop' },
];

describe(readChangeRecordBlock, () => {
  it.each<{ block: ChangeRecordBlock; expected: ChangeRecordBlock; name: string }>([
    {
      name: 'a title alone',
      block: { title: 'Add the parser: the reader' },
      expected: { title: 'Add the parser: the reader' },
    },
    {
      name: 'every override',
      block: { overrides: { breaking: true, scope: 'kb', type: 'sec' }, title: 'Add the parser' },
      expected: { overrides: { breaking: true, scope: 'kb', type: 'sec' }, title: 'Add the parser' },
    },
    {
      name: 'a wildcard scope override',
      block: { overrides: { scope: '*' }, title: 'Add foo' },
      expected: { overrides: { scope: '*' }, title: 'Add foo' },
    },
    {
      name: 'entries and their derivation commit',
      block: {
        entries: [
          { breaking: false, scopes: ['agents', 'kb'], text: 'Adds the store-qualified wikilink', type: 'feat' },
          {
            breaking: true,
            migration: 'Import `read` from `kb`',
            scopes: [],
            text: 'Drops the legacy reader',
            type: 'drop',
          },
        ],
        entriesCommit: 'e5029924',
        title: 'Add the parser',
      },
      expected: {
        entries: [
          { breaking: false, scopes: ['agents', 'kb'], text: 'Adds the store-qualified wikilink', type: 'feat' },
          {
            breaking: true,
            migration: 'Import `read` from `kb`',
            scopes: [],
            text: 'Drops the legacy reader',
            type: 'drop',
          },
        ],
        entriesCommit: 'e5029924',
        title: 'Add the parser',
      },
    },
    {
      name: 'a marker spelled on an override type',
      block: { overrides: { type: 'sec!' }, title: 'Add foo' },
      expected: { overrides: { breaking: true, type: 'sec' }, title: 'Add foo' },
    },
  ])('reads back the block rendered for $name', ({ block, expected }) => {
    const body = `## What\n\n- Adds the parser\n\nCloses #466\n\n${renderChangeRecordBlock(block)}\n`;

    expect(readChangeRecordBlock(body)).toStrictEqual({ block: expected, kind: 'read' });
  });

  it('reports a body containing no block as absent', () => {
    expect(readChangeRecordBlock('## What\n\n- Adds the parser\n')).toStrictEqual({ kind: 'absent' });
  });

  it('reads the last of several blocks', () => {
    const first = renderChangeRecordBlock({ overrides: { type: 'fix' }, title: 'Fix foo' });
    const last = renderChangeRecordBlock({ overrides: { type: 'feat' }, title: 'Add foo' });

    expect(readChangeRecordBlock(`${first}\n\ntext\n\n${last}`)).toStrictEqual({
      block: { overrides: { type: 'feat' }, title: 'Add foo' },
      kind: 'read',
    });
  });

  it('reads a block whose lines end in CRLF', () => {
    const block: ChangeRecordBlock = { overrides: { scope: 'kb', type: 'docs' }, title: 'Describe the store' };
    const body = renderChangeRecordBlock(block).replaceAll('\n', '\r\n');

    expect(readChangeRecordBlock(body)).toStrictEqual({ block, kind: 'read' });
  });

  it('ignores a key that the grammar does not declare, and reads a null field as absent', () => {
    const body = [
      '```change-record',
      'grammar: 2',
      'title: Add foo',
      'overrides:',
      '  scope:',
      '  title: Add bar',
      '  type: feat',
      'entries_commit:',
      '```',
    ];

    expect(readChangeRecordBlock(body.join('\n'))).toStrictEqual({
      block: { overrides: { type: 'feat' }, title: 'Add foo' },
      kind: 'read',
    });
  });

  it.each([
    { name: 'a valid record', value: '\n  scope: agents\n  type: feat' },
    { name: 'a list', value: ' [feat]' },
    { name: 'a numeric scope', value: '\n  scope: 42' },
    { name: 'a marker spelled as a string', value: "\n  breaking: 'yes'" },
  ])('ignores a legacy consolidated record holding $name', ({ value }) => {
    const body = `\`\`\`change-record\ntitle: Add foo\nconsolidated_record:${value}\n\`\`\``;

    expect(readChangeRecordBlock(body)).toStrictEqual({ block: { title: 'Add foo' }, kind: 'read' });
  });

  it.each<{ defect: RegExp; name: string; payload: string }>([
    {
      name: 'an entry list that is a mapping',
      payload: 'title: Add foo\noverrides:\n  type: sec\nentries:\n  type: feat',
      defect: /the entries are not a list/,
    },
    {
      name: 'an entry missing its text',
      payload: 'title: Add foo\noverrides:\n  type: sec\nentries:\n  - type: feat',
      defect: /`entries\[0\].text` is missing/,
    },
    {
      name: 'a numeric derivation commit',
      payload: 'title: Add foo\noverrides:\n  type: sec\nentries_commit: 42',
      defect: /`entries_commit` is not a string/,
    },
  ])('reads a block with $name, leaving the entries absent and reporting the defect', ({ defect, payload }) => {
    const reading = readChangeRecordBlock(`\`\`\`change-record\n${payload}\n\`\`\``);

    expect(reading).toStrictEqual({
      block: { overrides: { type: 'sec' }, title: 'Add foo' },
      entriesDefect: expect.stringMatching(defect),
      kind: 'read',
    });
  });

  it('reads an empty entry list as no entries', () => {
    const body = '```change-record\ntitle: Add foo\nentries: []\n```';

    expect(readChangeRecordBlock(body)).toStrictEqual({ block: { title: 'Add foo' }, kind: 'read' });
  });

  it('reads a derivation commit recorded without entries', () => {
    const body = '```change-record\ntitle: Add foo\nentries_commit: e5029924\n```';

    expect(readChangeRecordBlock(body)).toStrictEqual({
      block: { entriesCommit: 'e5029924', title: 'Add foo' },
      kind: 'read',
    });
  });

  it.each([
    { name: 'a block that never closes', payload: null, defect: /never closes/ },
    { name: 'a payload that is not YAML', payload: 'title: [unclosed', defect: /not valid YAML/ },
    { name: 'a payload that is not a mapping', payload: '- e5029924', defect: /payload is not a mapping/ },
    { name: 'a missing title', payload: 'overrides:\n  type: feat', defect: /`title` is missing/ },
    {
      name: 'an old-grammar block keyed by head',
      payload: 'head:\n  title: Add foo\n  type: feat',
      defect: /`title` is missing/,
    },
    { name: 'a numeric title', payload: 'title: 42', defect: /`title` is not a string/ },
    { name: 'a blank title', payload: "title: ' '", defect: /`title` is empty/ },
    {
      name: 'overrides that are a string',
      payload: 'title: Add foo\noverrides: sec',
      defect: /`overrides` is not a mapping/,
    },
    {
      name: 'an override marker spelled as a string',
      payload: "title: Add foo\noverrides:\n  breaking: 'yes'",
      defect: /`overrides.breaking` is not a boolean/,
    },
    {
      name: 'a numeric override type',
      payload: 'title: Add foo\noverrides:\n  type: 7',
      defect: /`overrides.type`/,
    },
  ])('reports $name as malformed, naming the defect', ({ payload, defect }) => {
    const body = payload === null ? '```change-record\ntitle: Add foo\n' : `\`\`\`change-record\n${payload}\n\`\`\``;

    const reading = readChangeRecordBlock(body);

    expect(reading).toMatchObject({ kind: 'malformed' });
    expect(reading.kind === 'malformed' ? reading.defect : '').toMatch(defect);
  });
});

describe(readMergeChangeRecordBlock, () => {
  it('reads a rendered block back to its entries, pull-request number, and ticket reference', () => {
    const block = { entries: MERGE_ENTRIES, prNumber: 470, ticketRef: '#466' };

    expect(readMergeChangeRecordBlock(`Adds the parser.\n\n${renderMergeChangeRecordBlock(block)}`)).toStrictEqual({
      block,
      kind: 'read',
    });
  });

  it('reads a block without a ticket reference', () => {
    const block = { entries: MERGE_ENTRIES, prNumber: 470 };

    expect(readMergeChangeRecordBlock(renderMergeChangeRecordBlock(block))).toStrictEqual({ block, kind: 'read' });
  });

  it('reads an entry naming many scopes back intact', () => {
    const scopes = Array.from({ length: 24 }, (_value, index) => `workspace-with-a-long-name-${index}`);
    const block = { entries: [{ breaking: false, scopes, text: 'Upgrades every workspace', type: 'deps' }] };

    expect(readMergeChangeRecordBlock(renderMergeChangeRecordBlock(block))).toStrictEqual({ block, kind: 'read' });
  });

  it('reports a body containing no block as absent', () => {
    expect(readMergeChangeRecordBlock('Adds the parser.')).toStrictEqual({ kind: 'absent' });
  });

  it('ignores a key that the grammar does not declare, and reads a null field as absent', () => {
    const body =
      '```change-record\ntitle: Add foo\npr_number: null\nticket_ref: null\nentries:\n  - type: feat\n    text: Adds foo\n```';

    expect(readMergeChangeRecordBlock(body)).toStrictEqual({
      block: { entries: [{ breaking: false, scopes: [], text: 'Adds foo', type: 'feat' }] },
      kind: 'read',
    });
  });

  it.each<{ defect: RegExp; name: string; payload: string }>([
    { name: 'a block that never closes', payload: 'pr_number: 1', defect: /never closes/ },
    { name: 'invalid YAML', payload: 'entries: [', defect: /not valid YAML/ },
    { name: 'a payload that is not a mapping', payload: '- 1', defect: /not a mapping/ },
    { name: 'a string pr_number', payload: 'pr_number: "470"', defect: /`pr_number` is not a positive integer/ },
    { name: 'a fractional pr_number', payload: 'pr_number: 1.5', defect: /`pr_number` is not a positive integer/ },
    { name: 'a zero pr_number', payload: 'pr_number: 0', defect: /`pr_number` is not a positive integer/ },
    {
      name: 'an unsafe pr_number',
      payload: 'pr_number: 9007199254740993',
      defect: /`pr_number` is not a positive integer/,
    },
    { name: 'a non-string ticket_ref', payload: 'ticket_ref: 1827', defect: /`ticket_ref` is not a string/ },
    { name: 'entries that are not a list', payload: 'entries: feat', defect: /not a list/ },
    { name: 'an entry that is not a mapping', payload: 'entries: [feat]', defect: /`entries\[0\]` is not a mapping/ },
    {
      name: 'an entry missing its text',
      payload: 'entries:\n  - type: feat\n  - type: fix',
      defect: /`entries\[0\].text` is missing/,
    },
    {
      name: 'a blank type',
      payload: 'entries:\n  - type: " "\n    text: Adds foo',
      defect: /`entries\[0\].type` is empty/,
    },
    {
      name: 'a non-boolean breaking',
      payload: 'entries:\n  - type: feat\n    breaking: yes please\n    text: Adds foo',
      defect: /`entries\[0\].breaking` is not a boolean/,
    },
    {
      name: 'scopes that are not a list',
      payload: 'entries:\n  - type: feat\n    scopes: agents\n    text: Adds foo',
      defect: /`entries\[0\].scopes` is not a list/,
    },
    {
      name: 'a non-string scope',
      payload: 'entries:\n  - type: feat\n    scopes: [1]\n    text: Adds foo',
      defect: /`entries\[0\].scopes\[0\]` is not a string/,
    },
    {
      name: 'a non-string migration',
      payload: 'entries:\n  - type: drop\n    text: Drops foo\n    migration: [Import foo]',
      defect: /`entries\[0\].migration` is not a string/,
    },
  ])('reports $name as malformed', ({ defect, name, payload }) => {
    const body = name === 'a block that never closes' ? `\`\`\`change-record\n${payload}` : fence(payload);
    const reading = readMergeChangeRecordBlock(body);

    expect(reading.kind).toBe('malformed');
    expect(reading).toHaveProperty('defect', expect.stringMatching(defect));
  });

  it('reads no entry from a list that has a defective item', () => {
    const body = fence('entries:\n  - type: feat\n    text: Adds foo\n  - type: fix');

    expect(readMergeChangeRecordBlock(body)).not.toHaveProperty('block');
  });
});

describe(renderChangeRecordBlock, () => {
  it('opens on the info string and closes on a bare fence', () => {
    const rendered = renderChangeRecordBlock({ title: 'Add foo' });
    const lines = rendered.split('\n');

    expect(lines.at(0)).toBe('```change-record');
    expect(lines.at(-1)).toBe('```');
  });

  it('renders the title, then the overrides', () => {
    const rendered = renderChangeRecordBlock({
      overrides: { breaking: true, scope: 'kb', type: 'sec' },
      title: 'Add the parser',
    });

    expect(rendered).toBe(
      [
        '```change-record',
        'title: Add the parser',
        'overrides:',
        '  scope: kb',
        '  type: sec',
        '  breaking: true',
        '```',
      ].join('\n'),
    );
  });

  it('when an override type spells the marker, records the type and a breaking override', () => {
    const rendered = renderChangeRecordBlock({ overrides: { type: 'sec!' }, title: 'Add foo' });

    expect(readBlock(rendered).overrides).toStrictEqual({ type: 'sec', breaking: true });
  });

  it('when the author overrides the scope to the wildcard, records the wildcard override', () => {
    const rendered = renderChangeRecordBlock({ overrides: { scope: '*' }, title: 'Add foo' });

    expect(readBlock(rendered).overrides).toStrictEqual({ scope: '*' });
  });

  it('omits empty overrides and an empty entry list', () => {
    const rendered = renderChangeRecordBlock({ entries: [], overrides: {}, title: 'Add foo' });

    expect(readBlock(rendered)).toStrictEqual({ title: 'Add foo' });
  });

  it('renders the scalars before the entry list', () => {
    const rendered = renderChangeRecordBlock({
      entries: [{ breaking: false, scopes: ['agents'], text: 'Adds the parser', type: 'feat' }],
      entriesCommit: 'e5029924',
      overrides: { type: 'sec' },
      title: 'Add the parser',
    });

    expect(rendered).toBe(
      [
        '```change-record',
        'title: Add the parser',
        'overrides:',
        '  type: sec',
        'entries_commit: e5029924',
        'entries:',
        '  - type: feat',
        '    scopes: [agents]',
        '    text: Adds the parser',
        '```',
      ].join('\n'),
    );
  });

  it('renders an entry with scopes in flow form, breaking only when true, and migration last', () => {
    const rendered = renderChangeRecordBlock({
      entries: [
        { breaking: false, scopes: ['agents', 'kb'], text: 'Adds the parser', type: 'feat' },
        { breaking: true, migration: 'Import `read` from `kb`', scopes: [], text: 'Drops the reader', type: 'drop' },
      ],
      title: 'Add the parser',
    });

    expect(rendered).toBe(
      [
        '```change-record',
        'title: Add the parser',
        'entries:',
        '  - type: feat',
        '    scopes: [agents, kb]',
        '    text: Adds the parser',
        '  - type: drop',
        '    scopes: []',
        '    breaking: true',
        '    text: Drops the reader',
        '    migration: Import `read` from `kb`',
        '```',
      ].join('\n'),
    );
  });

  it('omits the entries and the derivation commit when they are empty', () => {
    const rendered = renderChangeRecordBlock({ entries: [], entriesCommit: '  ', title: 'Add foo' });

    expect(readBlock(rendered)).toStrictEqual({ title: 'Add foo' });
  });

  it('omits the derivation commit when the block records no entries', () => {
    const rendered = renderChangeRecordBlock({ entries: [], entriesCommit: 'e5029924', title: 'Add foo' });

    expect(readBlock(rendered)).toStrictEqual({ title: 'Add foo' });
  });

  it('quotes a title containing the colon that would otherwise open a mapping', () => {
    const title = 'Add a parser: the reader, the writer, and the verifier';
    const rendered = renderChangeRecordBlock({ title });

    expect(readBlock(rendered)).toStrictEqual({ title });
  });
});

describe(renderMergeChangeRecordBlock, () => {
  it('renders the pull-request number and the ticket reference before the entry list', () => {
    const rendered = renderMergeChangeRecordBlock({ entries: MERGE_ENTRIES, prNumber: 470, ticketRef: '#466' });

    expect(rendered).toBe(
      [
        '```change-record',
        'pr_number: 470',
        'ticket_ref: "#466"',
        'entries:',
        '  - type: feat',
        '    scopes: [agents, kb]',
        '    text: Adds the store-qualified wikilink',
        '  - type: drop',
        '    scopes: []',
        '    breaking: true',
        '    text: Removes the legacy reader',
        '    migration: Import `read` from `kb`',
        '```',
      ].join('\n'),
    );
  });

  it('renders the pull-request number as a YAML integer', () => {
    const rendered = renderMergeChangeRecordBlock({ entries: MERGE_ENTRIES, prNumber: 470 });

    expect(readBlock(rendered).pr_number).toBe(470);
  });

  it('omits a blank ticket reference', () => {
    const rendered = renderMergeChangeRecordBlock({ entries: MERGE_ENTRIES, prNumber: 470, ticketRef: ' ' });

    expect(readBlock(rendered)).not.toHaveProperty('ticket_ref');
  });
});

describe(stripChangeRecordBlocks, () => {
  it('removes every block, fences included, and keeps the text around them', () => {
    const block = renderChangeRecordBlock({ title: 'Add foo' });

    expect(stripChangeRecordBlocks(`- Adds the parser\n${block}\nbetween\n${block}\nafter`)).toBe(
      '- Adds the parser\nbetween\nafter',
    );
  });

  it('removes a block that never closes through the end of the text', () => {
    expect(stripChangeRecordBlocks('- Adds the parser\n```change-record\ntitle: Add foo')).toBe('- Adds the parser');
  });
});

// region | Helpers

/** Wraps a payload in the block's fences. */
function fence(payload: string): string {
  return `\`\`\`change-record\n${payload}\n\`\`\``;
}

/** Reads a rendered block back through a YAML parse, which is the inverse against which the renderer is written. */
function readBlock(rendered: string): Record<string, unknown> {
  const lines = rendered.split('\n');
  const parsed: unknown = parseYaml(lines.slice(1, -1).join('\n'));
  if (!isRecord(parsed)) {
    throw new Error(`the rendered block did not parse to a mapping: ${rendered}`);
  }
  return parsed;
}

// endregion | Helpers
