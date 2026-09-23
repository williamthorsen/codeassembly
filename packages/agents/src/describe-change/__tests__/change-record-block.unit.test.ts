import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { isRecord } from '../../lib/type-guards.ts';
import {
  type ChangeRecordBlock,
  readChangeRecordBlock,
  renderChangeRecordBlock,
  stripChangeRecordBlocks,
} from '../change-record-block.ts';

describe(readChangeRecordBlock, () => {
  it.each<{ block: ChangeRecordBlock; expected: ChangeRecordBlock; name: string }>([
    {
      name: 'a title alone',
      block: { title: 'Add the parser: the reader' },
      expected: { title: 'Add the parser: the reader' },
    },
    {
      name: 'every group',
      block: {
        consolidatedRecord: { scope: 'agents', type: 'feat' },
        overrides: { breaking: true, scope: 'kb', type: 'sec' },
        title: 'Add the parser',
      },
      expected: {
        consolidatedRecord: { scope: 'agents', type: 'feat' },
        overrides: { breaking: true, scope: 'kb', type: 'sec' },
        title: 'Add the parser',
      },
    },
    {
      name: 'overrides alone',
      block: { overrides: { type: 'sec' }, title: 'Add the parser' },
      expected: { overrides: { type: 'sec' }, title: 'Add the parser' },
    },
    {
      name: 'a wildcard scope override',
      block: { consolidatedRecord: { scope: 'agents', type: 'feat' }, overrides: { scope: '*' }, title: 'Add foo' },
      expected: { consolidatedRecord: { scope: 'agents', type: 'feat' }, overrides: { scope: '*' }, title: 'Add foo' },
    },
    {
      name: 'a breaking consolidated record',
      block: { consolidatedRecord: { breaking: true, scope: 'agents', type: 'drop' }, title: 'Drop foo' },
      expected: { consolidatedRecord: { breaking: true, scope: 'agents', type: 'drop' }, title: 'Drop foo' },
    },
    {
      name: 'entries and their derivation commit',
      block: {
        consolidatedRecord: { scope: 'agents', type: 'feat' },
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
        consolidatedRecord: { scope: 'agents', type: 'feat' },
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
      block: { consolidatedRecord: { type: 'feat' }, overrides: { type: 'sec!' }, title: 'Add foo' },
      expected: { consolidatedRecord: { type: 'feat' }, overrides: { breaking: true, type: 'sec' }, title: 'Add foo' },
    },
  ])('reads back the block rendered for $name', ({ block, expected }) => {
    const body = `## What\n\n- Adds the parser\n\nCloses #466\n\n${renderChangeRecordBlock(block)}\n`;

    expect(readChangeRecordBlock(body)).toStrictEqual({ block: expected, kind: 'read' });
  });

  it('reports a body containing no block as absent', () => {
    expect(readChangeRecordBlock('## What\n\n- Adds the parser\n')).toStrictEqual({ kind: 'absent' });
  });

  it('reads the last of several blocks', () => {
    const first = renderChangeRecordBlock({ consolidatedRecord: { type: 'fix' }, title: 'Fix foo' });
    const last = renderChangeRecordBlock({ consolidatedRecord: { type: 'feat' }, title: 'Add foo' });

    expect(readChangeRecordBlock(`${first}\n\ntext\n\n${last}`)).toStrictEqual({
      block: { consolidatedRecord: { type: 'feat' }, title: 'Add foo' },
      kind: 'read',
    });
  });

  it('reads a block whose lines end in CRLF', () => {
    const block: ChangeRecordBlock = { consolidatedRecord: { scope: 'kb', type: 'docs' }, title: 'Describe the store' };
    const body = renderChangeRecordBlock(block).replaceAll('\n', '\r\n');

    expect(readChangeRecordBlock(body)).toStrictEqual({ block, kind: 'read' });
  });

  it('ignores a key that the grammar does not declare, and reads a null field as absent', () => {
    const body = [
      '```change-record',
      'grammar: 2',
      'title: Add foo',
      'consolidated_record:',
      '  scope:',
      '  title: Add bar',
      '  type: feat',
      'overrides:',
      '```',
    ];

    expect(readChangeRecordBlock(body.join('\n'))).toStrictEqual({
      block: { consolidatedRecord: { type: 'feat' }, title: 'Add foo' },
      kind: 'read',
    });
  });

  it.each<{ defect: RegExp; name: string; payload: string }>([
    {
      name: 'an entry list that is a mapping',
      payload: 'title: Add foo\nconsolidated_record:\n  type: feat\nentries:\n  type: feat',
      defect: /the entries are not a list/,
    },
    {
      name: 'an entry missing its text',
      payload: 'title: Add foo\nconsolidated_record:\n  type: feat\nentries:\n  - type: feat',
      defect: /`entries\[0\].text` is missing/,
    },
    {
      name: 'a numeric derivation commit',
      payload: 'title: Add foo\nconsolidated_record:\n  type: feat\nentries_commit: 42',
      defect: /`entries_commit` is not a string/,
    },
  ])('reads a block with $name, leaving the entries absent and reporting the defect', ({ defect, payload }) => {
    const reading = readChangeRecordBlock(`\`\`\`change-record\n${payload}\n\`\`\``);

    expect(reading).toStrictEqual({
      block: { consolidatedRecord: { type: 'feat' }, title: 'Add foo' },
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
    { name: 'a missing title', payload: 'consolidated_record:\n  type: feat', defect: /`title` is missing/ },
    {
      name: 'an old-grammar block keyed by head',
      payload: 'head:\n  title: Add foo\n  type: feat',
      defect: /`title` is missing/,
    },
    { name: 'a numeric title', payload: 'title: 42', defect: /`title` is not a string/ },
    { name: 'a blank title', payload: "title: ' '", defect: /`title` is empty/ },
    {
      name: 'a consolidated record that is a list',
      payload: 'title: Add foo\nconsolidated_record: [feat]',
      defect: /`consolidated_record` is not a mapping/,
    },
    {
      name: 'overrides that are a string',
      payload: 'title: Add foo\noverrides: sec',
      defect: /`overrides` is not a mapping/,
    },
    {
      name: 'a numeric consolidated scope',
      payload: 'title: Add foo\nconsolidated_record:\n  scope: 42',
      defect: /`consolidated_record.scope`/,
    },
    {
      name: 'a consolidated breaking spelled as a string',
      payload: "title: Add foo\nconsolidated_record:\n  breaking: 'yes'",
      defect: /`consolidated_record.breaking` is not a boolean/,
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

describe(renderChangeRecordBlock, () => {
  it('opens on the info string and closes on a bare fence', () => {
    const rendered = renderChangeRecordBlock({
      consolidatedRecord: { scope: 'agents', type: 'feat' },
      title: 'Add foo',
    });
    const lines = rendered.split('\n');

    expect(lines.at(0)).toBe('```change-record');
    expect(lines.at(-1)).toBe('```');
  });

  it('renders the title, then the consolidated record, then the overrides', () => {
    const rendered = renderChangeRecordBlock({
      consolidatedRecord: { breaking: true, scope: 'agents', type: 'feat' },
      overrides: { breaking: true, scope: 'kb', type: 'sec' },
      title: 'Add the parser',
    });

    expect(rendered).toBe(
      [
        '```change-record',
        'title: Add the parser',
        'consolidated_record:',
        '  scope: agents',
        '  type: feat',
        '  breaking: true',
        'overrides:',
        '  scope: kb',
        '  type: sec',
        '  breaking: true',
        '```',
      ].join('\n'),
    );
  });

  it('omits breaking for a consolidated record that is not breaking', () => {
    const rendered = renderChangeRecordBlock({
      consolidatedRecord: { scope: 'agents', type: 'feat' },
      title: 'Add foo',
    });

    expect(readBlock(rendered).consolidated_record).toStrictEqual({ scope: 'agents', type: 'feat' });
  });

  it('records only the scope, type, and marker of the consolidated record', () => {
    const rendered = renderChangeRecordBlock({
      consolidatedRecord: { prNumber: '470', scope: 'agents', ticketRef: '#466', title: 'Add bar', type: 'feat' },
      title: 'Add foo',
    });

    expect(readBlock(rendered)).toStrictEqual({
      consolidated_record: { scope: 'agents', type: 'feat' },
      title: 'Add foo',
    });
  });

  it('when an override type spells the marker, records the type and a breaking override', () => {
    const rendered = renderChangeRecordBlock({ overrides: { type: 'sec!' }, title: 'Add foo' });

    expect(readBlock(rendered).overrides).toStrictEqual({ type: 'sec', breaking: true });
  });

  it('when the author overrides the scope to the wildcard, records the wildcard override', () => {
    const rendered = renderChangeRecordBlock({ overrides: { scope: '*' }, title: 'Add foo' });

    expect(readBlock(rendered).overrides).toStrictEqual({ scope: '*' });
  });

  it('omits each group that is empty', () => {
    const rendered = renderChangeRecordBlock({ consolidatedRecord: { scope: '*' }, overrides: {}, title: 'Add foo' });

    expect(readBlock(rendered)).toStrictEqual({ title: 'Add foo' });
  });

  it('splits a marker spelled on the type into the type and the flag', () => {
    const rendered = renderChangeRecordBlock({ consolidatedRecord: { type: 'drop!' }, title: 'Drop foo' });

    expect(readBlock(rendered).consolidated_record).toStrictEqual({ type: 'drop', breaking: true });
  });

  it('drops the wildcard scope from the consolidated record rather than recording it', () => {
    const rendered = renderChangeRecordBlock({ consolidatedRecord: { scope: '*', type: 'feat' }, title: 'Add foo' });

    expect(readBlock(rendered).consolidated_record).toStrictEqual({ type: 'feat' });
  });

  it('renders the scalars before the entry list', () => {
    const rendered = renderChangeRecordBlock({
      consolidatedRecord: { scope: 'agents', type: 'feat' },
      entries: [{ breaking: false, scopes: ['agents'], text: 'Adds the parser', type: 'feat' }],
      entriesCommit: 'e5029924',
      overrides: { type: 'sec' },
      title: 'Add the parser',
    });

    expect(rendered).toBe(
      [
        '```change-record',
        'title: Add the parser',
        'consolidated_record:',
        '  scope: agents',
        '  type: feat',
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

describe(stripChangeRecordBlocks, () => {
  it('removes every block, fences included, and keeps the text around them', () => {
    const block = renderChangeRecordBlock({ consolidatedRecord: { type: 'feat' }, title: 'Add foo' });

    expect(stripChangeRecordBlocks(`- Adds the parser\n${block}\nbetween\n${block}\nafter`)).toBe(
      '- Adds the parser\nbetween\nafter',
    );
  });

  it('removes a block that never closes through the end of the text', () => {
    expect(stripChangeRecordBlocks('- Adds the parser\n```change-record\ntitle: Add foo')).toBe('- Adds the parser');
  });
});

// region | Helpers

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
