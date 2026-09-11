import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { isRecord } from '../../lib/type-guards.ts';
import { type ChangeRecordBlock, renderChangeRecordBlock } from '../change-record-block.ts';

describe(renderChangeRecordBlock, () => {
  it('opens on the info string and closes on a bare fence', () => {
    const rendered = renderChangeRecordBlock({ commit: 'e5029924', head: { scope: 'agents', type: 'feat' } });
    const lines = rendered.split('\n');

    expect(lines.at(0)).toBe('```change-record');
    expect(lines.at(-1)).toBe('```');
  });

  it('parses back to the record it was given', () => {
    const block: ChangeRecordBlock = {
      commit: 'e5029924',
      head: { breaking: true, scope: 'agents', title: 'Add the parser', type: 'sec' },
      overrides: { type: 'sec' },
    };

    expect(readBlock(renderChangeRecordBlock(block))).toStrictEqual({
      commit: 'e5029924',
      head: { breaking: true, scope: 'agents', title: 'Add the parser', type: 'sec' },
      overrides: { type: 'sec' },
    });
  });

  it('omits breaking for a head that is not breaking', () => {
    const rendered = renderChangeRecordBlock({ commit: 'e5029924', head: { scope: 'agents', type: 'feat' } });

    expect(readBlock(rendered).head).toStrictEqual({ scope: 'agents', type: 'feat' });
  });

  it('when an override type spells the marker, records the type and a breaking override', () => {
    const rendered = renderChangeRecordBlock({
      commit: 'e5029924',
      head: { type: 'feat' },
      overrides: { type: 'sec!' },
    });

    expect(readBlock(rendered).overrides).toStrictEqual({ breaking: true, type: 'sec' });
  });

  it('omits overrides where the author applied none', () => {
    const rendered = renderChangeRecordBlock({ commit: 'e5029924', head: { type: 'feat' }, overrides: {} });

    expect(readBlock(rendered)).toStrictEqual({ commit: 'e5029924', head: { type: 'feat' } });
  });

  it('splits a marker spelled on the type into the type and the flag', () => {
    const rendered = renderChangeRecordBlock({ commit: 'e5029924', head: { type: 'drop!' } });

    expect(readBlock(rendered).head).toStrictEqual({ breaking: true, type: 'drop' });
  });

  it('drops the wildcard scope rather than recording it', () => {
    const rendered = renderChangeRecordBlock({ commit: 'e5029924', head: { scope: '*', type: 'feat' } });

    expect(readBlock(rendered).head).toStrictEqual({ type: 'feat' });
  });

  it('quotes a title carrying the colon that would otherwise open a mapping', () => {
    const title = 'Add a parser: the reader, the writer, and the verifier';
    const rendered = renderChangeRecordBlock({ commit: 'e5029924', head: { title, type: 'feat' } });

    expect(readBlock(rendered).head).toStrictEqual({ title, type: 'feat' });
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
