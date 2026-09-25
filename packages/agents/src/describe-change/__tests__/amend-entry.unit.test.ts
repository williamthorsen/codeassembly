import { describe, expect, it } from 'vitest';

import type { Taxonomy } from '../../change-grammar/types.ts';
import { amendEntry, type EntryAmendment } from '../amend-entry.ts';
import type { ChangeEntry } from '../change-entries.ts';
import { readChangeRecordBlock, renderChangeRecordBlock } from '../change-record-block.ts';

/** A taxonomy declaring every breaking policy, independent of the repository's own. */
const TAXONOMY: Taxonomy = {
  tiers: ['public', 'process'],
  types: [
    { breakingPolicy: 'optional', key: 'feat', tier: 'public' },
    { breakingPolicy: 'optional', key: 'drop', tier: 'public' },
    { breakingPolicy: 'forbidden', key: 'docs', tier: 'process' },
  ],
};

const FEATURE_ENTRY: ChangeEntry = { breaking: false, scopes: ['agents'], text: 'Adds the parser', type: 'feature' };

const DOCS_ENTRY: ChangeEntry = { breaking: true, scopes: ['kb'], text: 'Documents the store', type: 'docs' };

const ENTRIES = [FEATURE_ENTRY, DOCS_ENTRY];

const BLOCK = renderChangeRecordBlock({
  entries: ENTRIES,
  entriesCommit: 'e5029924',
  overrides: { scope: 'agents' },
  title: 'Add the parser',
});

const PREFIX = '## What\n\nAdds the parser.\n\n';

const SUFFIX = '\n\n## Why\n\nCloses #466\n';

describe(amendEntry, () => {
  it('rewrites the amended entry alone, keeping the title, overrides, and derivation commit', () => {
    const { body, entry, entryCount } = amend({ type: 'feat' }, 0);

    const reading = readChangeRecordBlock(body);
    expect(reading).toStrictEqual({
      block: {
        entries: [{ ...FEATURE_ENTRY, type: 'feat' }, DOCS_ENTRY],
        entriesCommit: 'e5029924',
        overrides: { scope: 'agents' },
        title: 'Add the parser',
      },
      kind: 'read',
    });
    expect(entry).toStrictEqual({ ...FEATURE_ENTRY, type: 'feat' });
    expect(entryCount).toBe(2);
  });

  it('drops a legacy consolidated record from the re-rendered block', () => {
    const legacy = BLOCK.replace(
      'title: Add the parser\n',
      'title: Add the parser\nconsolidated_record:\n  type: feat\n',
    );
    const { body } = amendEntry({ amendment: { type: 'feat' }, body: legacy, index: 0, taxonomy: TAXONOMY });

    expect(body).not.toContain('consolidated_record');
  });

  it('sets or clears the marker without changing the type', () => {
    expect(amend({ breaking: false }, 1).entry).toStrictEqual({ ...DOCS_ENTRY, breaking: false });
    expect(amend({ breaking: true, type: 'drop' }, 1).entry).toStrictEqual({ ...DOCS_ENTRY, type: 'drop' });
  });

  it('leaves the text outside the last block byte for byte unchanged', () => {
    const earlier = '```change-record\ntitle: Earlier\n```';
    const { body } = amendEntry({
      amendment: { type: 'feat' },
      body: `${earlier}\n\n${PREFIX}${BLOCK}${SUFFIX}`,
      index: 0,
      taxonomy: TAXONOMY,
    });

    expect(body.startsWith(`${earlier}\n\n${PREFIX}\`\`\`change-record\n`)).toBe(true);
    expect(body.endsWith(`\`\`\`${SUFFIX}`)).toBe(true);
  });

  it('writes the block with the line ending of a body that uses CRLF', () => {
    const crlf = (text: string): string => text.replaceAll('\n', '\r\n');
    const { body } = amendEntry({
      amendment: { type: 'feat' },
      body: crlf(`${PREFIX}${BLOCK}${SUFFIX}`),
      index: 0,
      taxonomy: TAXONOMY,
    });

    expect(body).not.toMatch(/[^\r]\n/);
    expect(body.startsWith(crlf(PREFIX))).toBe(true);
    expect(body.endsWith(crlf(SUFFIX))).toBe(true);
  });

  describe('refuses', () => {
    it('a body containing no block', () => {
      expect(() => amendEntry({ amendment: { type: 'feat' }, body: PREFIX, index: 0, taxonomy: TAXONOMY })).toThrow(
        'the body contains no change-record block',
      );
    });

    it('a malformed block, naming the defect', () => {
      const body = `${PREFIX}\`\`\`change-record\nentries: []\n\`\`\``;

      expect(() => amendEntry({ amendment: { type: 'feat' }, body, index: 0, taxonomy: TAXONOMY })).toThrow(
        'the body’s change-record block is malformed: `title` is missing',
      );
    });

    it('malformed entries, naming the defect', () => {
      const body = `${PREFIX}\`\`\`change-record\ntitle: Add the parser\nentries:\n  - type: feat\n\`\`\``;

      expect(() => amendEntry({ amendment: { type: 'feat' }, body, index: 0, taxonomy: TAXONOMY })).toThrow(
        'the block’s change entries are malformed: `entries[0].text` is missing',
      );
    });

    it('an index past the last entry', () => {
      expect(() => amend({ type: 'feat' }, 2)).toThrow('entry 2 is out of range; the block records 2 change entries');
    });

    it('a type that the taxonomy does not declare', () => {
      expect(() => amend({ type: 'feature' }, 0)).toThrow(
        'the amendment leaves entries[0] defective: the taxonomy does not declare the type feature',
      );
    });

    it('an amendment that leaves the marker in breach of the type’s policy', () => {
      expect(() => amend({ type: 'docs' }, 1)).toThrow(
        'the amendment leaves entries[1] defective: the type docs forbids the breaking marker',
      );
    });
  });
});

// region | Helpers

/** Amends entry `index` of a body containing the fixture block between prose sections. */
function amend(amendment: EntryAmendment, index: number): ReturnType<typeof amendEntry> {
  return amendEntry({ amendment, body: `${PREFIX}${BLOCK}${SUFFIX}`, index, taxonomy: TAXONOMY });
}

// endregion | Helpers
