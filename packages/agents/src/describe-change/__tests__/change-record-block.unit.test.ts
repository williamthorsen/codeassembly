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
      name: 'a head carrying every field',
      block: { head: { scope: 'agents', title: 'Add the parser: the reader', type: 'feat' } },
      expected: { head: { scope: 'agents', title: 'Add the parser: the reader', type: 'feat' } },
    },
    {
      name: 'a wildcard scope override',
      block: { head: { scope: 'agents', type: 'feat' }, overrides: { scope: '*' } },
      expected: { head: { scope: 'agents', type: 'feat' }, overrides: { scope: '*' } },
    },
    {
      name: 'a breaking head',
      block: { head: { breaking: true, scope: 'agents', type: 'drop' } },
      expected: { head: { breaking: true, scope: 'agents', type: 'drop' } },
    },
    {
      name: 'a marker spelled on an override type',
      block: { head: { type: 'feat' }, overrides: { type: 'sec!' } },
      expected: { head: { type: 'feat' }, overrides: { breaking: true, type: 'sec' } },
    },
  ])('reads back the block rendered for $name', ({ block, expected }) => {
    const body = `## What\n\n- Adds the parser\n\nCloses #466\n\n${renderChangeRecordBlock(block)}\n`;

    expect(readChangeRecordBlock(body)).toStrictEqual({ block: expected, kind: 'read' });
  });

  it('reports a body carrying no block as absent', () => {
    expect(readChangeRecordBlock('## What\n\n- Adds the parser\n')).toStrictEqual({ kind: 'absent' });
  });

  it('reads the last of several blocks', () => {
    const first = renderChangeRecordBlock({ head: { type: 'fix' } });
    const last = renderChangeRecordBlock({ head: { type: 'feat' } });

    expect(readChangeRecordBlock(`${first}\n\ntext\n\n${last}`)).toStrictEqual({
      block: { head: { type: 'feat' } },
      kind: 'read',
    });
  });

  it('reads a block whose lines end in CRLF', () => {
    const body = renderChangeRecordBlock({ head: { scope: 'kb', type: 'docs' } }).replaceAll('\n', '\r\n');

    expect(readChangeRecordBlock(body)).toStrictEqual({
      block: { head: { scope: 'kb', type: 'docs' } },
      kind: 'read',
    });
  });

  it('ignores a key the grammar does not declare, and reads a null field as absent', () => {
    const body = ['```change-record', 'entries: []', 'head:', '  scope:', '  type: feat', '```'];

    expect(readChangeRecordBlock(body.join('\n'))).toStrictEqual({
      block: { head: { type: 'feat' } },
      kind: 'read',
    });
  });

  it('reads a block written before the grammar dropped the commit key', () => {
    const body = [
      '```change-record',
      'commit: e5029924',
      'head:',
      '  scope: agents',
      '  type: feat',
      'overrides:',
      '  type: sec',
      '```',
    ];

    expect(readChangeRecordBlock(body.join('\n'))).toStrictEqual({
      block: { head: { scope: 'agents', type: 'feat' }, overrides: { type: 'sec' } },
      kind: 'read',
    });
  });

  it.each([
    { name: 'a block that never closes', payload: null, defect: /never closes/ },
    { name: 'a payload that is not YAML', payload: 'head: [unclosed', defect: /not valid YAML/ },
    { name: 'a payload that is not a mapping', payload: '- e5029924', defect: /payload is not a mapping/ },
    { name: 'a missing head', payload: 'overrides: {}', defect: /`head` is not a mapping/ },
    { name: 'a head that is a list', payload: 'head: [feat]', defect: /`head` is not a mapping/ },
    {
      name: 'overrides that are a string',
      payload: 'head: {}\noverrides: sec',
      defect: /`overrides` is not a mapping/,
    },
    { name: 'a numeric head scope', payload: 'head:\n  scope: 42', defect: /`head.scope`/ },
    {
      name: 'a head breaking spelled as a string',
      payload: "head:\n  breaking: 'yes'",
      defect: /`head.breaking` is not a boolean/,
    },
    {
      name: 'a numeric override type',
      payload: 'head: {}\noverrides:\n  type: 7',
      defect: /`overrides.type`/,
    },
  ])('reports $name as malformed, naming the defect', ({ payload, defect }) => {
    const body = payload === null ? '```change-record\nhead: {}\n' : `\`\`\`change-record\n${payload}\n\`\`\``;

    const reading = readChangeRecordBlock(body);

    expect(reading).toMatchObject({ kind: 'malformed' });
    expect(reading.kind === 'malformed' ? reading.defect : '').toMatch(defect);
  });
});

describe(renderChangeRecordBlock, () => {
  it('opens on the info string and closes on a bare fence', () => {
    const rendered = renderChangeRecordBlock({ head: { scope: 'agents', type: 'feat' } });
    const lines = rendered.split('\n');

    expect(lines.at(0)).toBe('```change-record');
    expect(lines.at(-1)).toBe('```');
  });

  it('parses back to the record it was given', () => {
    const block: ChangeRecordBlock = {
      head: { breaking: true, scope: 'agents', title: 'Add the parser', type: 'sec' },
      overrides: { type: 'sec' },
    };

    expect(readBlock(renderChangeRecordBlock(block))).toStrictEqual({
      head: { breaking: true, scope: 'agents', title: 'Add the parser', type: 'sec' },
      overrides: { type: 'sec' },
    });
  });

  it('omits breaking for a head that is not breaking', () => {
    const rendered = renderChangeRecordBlock({ head: { scope: 'agents', type: 'feat' } });

    expect(readBlock(rendered).head).toStrictEqual({ scope: 'agents', type: 'feat' });
  });

  it('when an override type spells the marker, records the type and a breaking override', () => {
    const rendered = renderChangeRecordBlock({
      head: { type: 'feat' },
      overrides: { type: 'sec!' },
    });

    expect(readBlock(rendered).overrides).toStrictEqual({ breaking: true, type: 'sec' });
  });

  it('when the author overrides the scope to the wildcard, records the wildcard override', () => {
    const rendered = renderChangeRecordBlock({
      head: { scope: 'agents', type: 'feat' },
      overrides: { scope: '*' },
    });

    expect(readBlock(rendered).overrides).toStrictEqual({ scope: '*' });
  });

  it('omits overrides where the author applied none', () => {
    const rendered = renderChangeRecordBlock({ head: { type: 'feat' }, overrides: {} });

    expect(readBlock(rendered)).toStrictEqual({ head: { type: 'feat' } });
  });

  it('splits a marker spelled on the type into the type and the flag', () => {
    const rendered = renderChangeRecordBlock({ head: { type: 'drop!' } });

    expect(readBlock(rendered).head).toStrictEqual({ breaking: true, type: 'drop' });
  });

  it('drops the wildcard scope rather than recording it', () => {
    const rendered = renderChangeRecordBlock({ head: { scope: '*', type: 'feat' } });

    expect(readBlock(rendered).head).toStrictEqual({ type: 'feat' });
  });

  it('quotes a title carrying the colon that would otherwise open a mapping', () => {
    const title = 'Add a parser: the reader, the writer, and the verifier';
    const rendered = renderChangeRecordBlock({ head: { title, type: 'feat' } });

    expect(readBlock(rendered).head).toStrictEqual({ title, type: 'feat' });
  });
});

describe(stripChangeRecordBlocks, () => {
  it('removes every block, fences included, and keeps the text around them', () => {
    const block = renderChangeRecordBlock({ head: { type: 'feat' } });

    expect(stripChangeRecordBlocks(`- Adds the parser\n${block}\nbetween\n${block}\nafter`)).toBe(
      '- Adds the parser\nbetween\nafter',
    );
  });

  it('removes a block that never closes through the end of the text', () => {
    expect(stripChangeRecordBlocks('- Adds the parser\n```change-record\nhead: {}')).toBe('- Adds the parser');
  });
});

// region | Helpers

/** Reads a rendered block back through a YAML parse, which is the inverse the renderer is written against. */
function readBlock(rendered: string): Record<string, unknown> {
  const lines = rendered.split('\n');
  const parsed: unknown = parseYaml(lines.slice(1, -1).join('\n'));
  if (!isRecord(parsed)) {
    throw new Error(`the rendered block did not parse to a mapping: ${rendered}`);
  }
  return parsed;
}

// endregion | Helpers
