import { describe, expect, it } from 'vitest';

import type { ChangeEntry } from '../change-entries.ts';
import {
  type ChangeRecordBlockReading,
  readMergeChangeRecordBlock,
  renderChangeRecordBlock,
} from '../change-record-block.ts';
import { resolveMerge } from '../resolve-merge.ts';
import {
  buildInput,
  ENTRIES,
  entryOf,
  HEAD_COMMIT,
  readBlock,
  TEMPLATES,
  unavailable,
} from '../test-utils/merge-fixtures.ts';

describe(resolveMerge, () => {
  describe('the entries', () => {
    it('ranks the entries into the record', () => {
      const entries: ChangeEntry[] = [
        { breaking: false, scopes: ['agents'], text: 'Adds the store-qualified wikilink', type: 'feat' },
        { breaking: true, scopes: ['kb'], text: 'Removes the reader', type: 'drop' },
        { breaking: false, scopes: ['kb'], text: 'Describes the store', type: 'docs' },
      ];
      const block = readBlock(entries);

      const report = resolveMerge(buildInput({ block }));

      expect(report).toMatchObject({
        effective_record: { breaking: true, scope: null, type: 'drop' },
        effective_sources: { breaking: 'block', scope: 'block', type: 'block' },
        merge_title: '#466 drop!: Add foo (#470)',
        notices: [],
      });
    });

    it('lets fresh entries’ record stand over the commits’ without a notice', () => {
      const report = resolveMerge(
        buildInput({
          block: readBlock(ENTRIES),
          commitsRecord: { scope: 'agents', type: 'fix' },
        }),
      );

      expect(report.effective_record).toMatchObject({ scope: 'kb', type: 'feat' });
      expect(report.effective_sources).toMatchObject({ scope: 'block', type: 'block' });
      expect(report.notices).toStrictEqual([]);
    });

    it('matches a short derivation commit against the head as a prefix, ignoring case', () => {
      const block = readBlock(ENTRIES, { entriesCommit: 'E5029924' });

      const report = resolveMerge(buildInput({ block, commitsRecord: { type: 'fix' } }));

      expect(report.effective_sources).toMatchObject({ type: 'block' });
      expect(report.notices).not.toContainEqual(expect.objectContaining({ kind: 'stale-entries' }));
    });

    it('when the derivation commit is not the head, lets the entries’ record stand and reports staleness', () => {
      const block = readBlock(ENTRIES, { entriesCommit: 'aabbccdd' });

      const report = resolveMerge(buildInput({ block, commitsRecord: { type: 'fix' } }));

      expect(report.effective_record).toMatchObject({ type: 'feat' });
      expect(report.effective_sources).toMatchObject({ type: 'block' });
      expect(report.notices).toStrictEqual([
        { kind: 'stale-entries', entries_commit: 'aabbccdd', head_commit: HEAD_COMMIT },
      ]);
    });

    it('when the entries do not record a derivation commit, reports staleness with a null commit', () => {
      const block = readBlock(ENTRIES, { entriesCommit: null });

      const report = resolveMerge(buildInput({ block, commitsRecord: { type: 'fix' } }));

      expect(report.effective_sources).toMatchObject({ type: 'block' });
      expect(report.notices).toContainEqual({
        kind: 'stale-entries',
        entries_commit: null,
        head_commit: HEAD_COMMIT,
      });
    });

    it('resolves a block that does not record any entry from the labels and the commits, applying its overrides', () => {
      const block = readBlock([], { overrides: { breaking: true } });

      const report = resolveMerge(
        buildInput({ block, commitsRecord: { scope: 'agents', type: 'sec' }, labels: { scope: 'kb' } }),
      );

      expect(report).toMatchObject({
        effective_record: { breaking: true, scope: 'kb', type: 'sec' },
        effective_sources: { breaking: 'block_overrides', scope: 'labels', type: 'commits' },
        notices: [],
      });
    });

    it('reports a malformed entry list as a notice, resolving the record as for a block that does not record any entry', () => {
      const block = readBlock([], {
        entriesDefect: '`entries[0].text` is missing',
        overrides: { scope: 'kb' },
      });

      const report = resolveMerge(buildInput({ block, commitsRecord: { type: 'sec' } }));

      expect(report).toMatchObject({
        effective_record: { scope: 'kb', type: 'sec' },
        effective_sources: { scope: 'block_overrides', type: 'commits' },
      });
      expect(report.sources.block).toMatchObject({ entries: [], title: 'Add foo' });
      expect(report.notices).toContainEqual({
        kind: 'malformed-entries',
        defect: '`entries[0].text` is missing',
      });
    });

    it('when the commits could not be read, lets stale entries’ record stand', () => {
      const block = readBlock(ENTRIES, { entriesCommit: 'aabbccdd' });

      const report = resolveMerge(buildInput({ block, commits: unavailable('the head commit is not local') }));

      expect(report.effective_sources).toMatchObject({ type: 'block' });
    });
  });

  describe('the merge block', () => {
    it('renders the entries with the pull-request number and the ticket reference, and counts them', () => {
      const entries: ChangeEntry[] = [
        { breaking: false, scopes: ['agents', 'kb'], text: 'Adds the store-qualified wikilink', type: 'feat' },
        { breaking: true, migration: 'Import `read` from `kb`', scopes: [], text: 'Removes the reader', type: 'drop' },
      ];

      const report = resolveMerge(buildInput({ block: readBlock(entries) }));

      expect(report.entry_count).toBe(2);
      expect(readMergeChangeRecordBlock(report.merge_block ?? '')).toStrictEqual({
        block: { entries, prNumber: 470, ticketRef: '#466' },
        kind: 'read',
      });
    });

    it('omits the ticket reference when the merge has none', () => {
      const report = resolveMerge(
        buildInput({
          block: readBlock(ENTRIES),
          prTitle: 'Add foo',
          ticketRef: null,
        }),
      );

      expect(readMergeChangeRecordBlock(report.merge_block ?? '')).toStrictEqual({
        block: { entries: ENTRIES, prNumber: 470 },
        kind: 'read',
      });
    });

    it('keeps the block out of the composed body', () => {
      const report = resolveMerge(buildInput({ block: readBlock(ENTRIES) }));

      expect(report.body).toBe('- Adds foo.');
      expect(report.merge_block).toMatch(/^```change-record\n/);
    });

    it('renders stale entries as written, since a merge re-derives nothing', () => {
      const block = readBlock(ENTRIES, { entriesCommit: 'aabbccdd' });

      const report = resolveMerge(buildInput({ block, commitsRecord: { type: 'fix' } }));

      expect(report.entry_count).toBe(1);
      expect(report.merge_block).not.toBeNull();
    });

    it('renders for a repository whose commit grammar is empty', () => {
      const report = resolveMerge(
        buildInput({
          block: readBlock(ENTRIES),
          templates: { ...TEMPLATES, commit: '' },
        }),
      );

      expect(report.entry_count).toBe(1);
      expect(report.merge_block).not.toBeNull();
    });

    it.each<{ block: ChangeRecordBlockReading; name: string }>([
      { name: 'a block that does not record any entry', block: readBlock([]) },
      {
        name: 'a malformed entry list',
        block: readBlock([], { entriesDefect: '`entries[0].text` is missing' }),
      },
      { name: 'an absent block', block: { kind: 'absent' } },
      { name: 'a malformed block', block: { defect: '`title` is missing', kind: 'malformed' } },
    ])('renders none for $name', ({ block }) => {
      const report = resolveMerge(buildInput({ block }));

      expect(report.merge_block).toBeNull();
      expect(report.entry_count).toBe(0);
    });
  });

  describe('the title', () => {
    it('reports a typed prefix that differs from the effective record, and keeps it out of the title', () => {
      const report = resolveMerge(
        buildInput({
          block: readBlock([entryOf({ scope: 'agents', type: 'feat' })]),
          prTitle: '#466 kb|docs: Describe the store',
        }),
      );

      expect(report).toMatchObject({
        effective_record: { title: 'Describe the store' },
        merge_title: '#466 agents|feat: Describe the store (#470)',
        notices: [{ fields: ['scope', 'type'], kind: 'pr-title-divergence' }],
        sources: {
          pr_title: { breaking: false, scope: 'kb', ticket_ref: '#466', title: 'Describe the store', type: 'docs' },
        },
      });
    });

    it('reads the typed prefix through the pull-request template when that template names {type}', () => {
      const templates = { ...TEMPLATES, pr: '[{ticket_ref} ][[{scope}|]{type}: ]{title}' };

      const report = resolveMerge(
        buildInput({
          block: readBlock([entryOf({ type: 'feat' })]),
          prTitle: '#466 kb|feat!: Describe the store',
          templates,
        }),
      );

      expect(report).toMatchObject({
        effective_record: { title: 'Describe the store' },
        notices: [{ fields: ['scope', 'breaking'], kind: 'pr-title-divergence' }],
        sources: { pr_title: { breaking: true, scope: 'kb', type: 'feat' } },
      });
    });

    it('compares the prefix with the record that the overrides produce', () => {
      const report = resolveMerge(
        buildInput({
          block: readBlock([entryOf({ scope: 'agents', type: 'feat' })]),
          overrides: { scope: 'kb', type: 'docs' },
          prTitle: '#466 kb|docs: Describe the store',
        }),
      );

      expect(report.notices).toStrictEqual([]);
    });

    it('takes an overriding title in place of the pull-request title, and still reads and compares its prefix', () => {
      const report = resolveMerge(
        buildInput({
          block: readBlock([entryOf({ scope: 'agents', type: 'feat' })]),
          overrides: { title: 'Rename kb|docs: the shared layer' },
          prTitle: '#466 Rename kb|docs: the shared layer',
        }),
      );

      expect(report).toMatchObject({
        effective_sources: { title: 'flags' },
        merge_title: '#466 agents|feat: Rename kb|docs: the shared layer (#470)',
        notices: [{ fields: ['scope', 'type'], kind: 'pr-title-divergence' }],
        sources: { pr_title: { scope: 'Rename kb', title: 'the shared layer', type: 'docs' } },
      });
    });

    it('when the title does not invert, uses the block’s title and says so', () => {
      const templates = { ...TEMPLATES, pr: '{ticket_ref} {title}' };

      const report = resolveMerge(
        buildInput({
          block: readBlock([entryOf({ type: 'feat' })], { title: 'Add the parser' }),
          prTitle: 'Add foo',
          templates,
        }),
      );

      expect(report).toMatchObject({
        effective_record: { ticket_ref: '#466', title: 'Add the parser' },
        effective_sources: { ticket_ref: 'flags', title: 'block' },
        notices: [{ kind: 'pr-title-unparsed' }],
        sources: { pr_title: null },
      });
    });

    it('when the title does not invert and the body does not contain a readable block, uses the pull-request title verbatim', () => {
      const templates = { ...TEMPLATES, pr: '{ticket_ref} {title}' };

      const report = resolveMerge(buildInput({ prTitle: 'Add foo', templates }));

      expect(report).toMatchObject({
        effective_record: { title: 'Add foo' },
        effective_sources: { title: 'pr_title_verbatim' },
        notices: [{ kind: 'absent-block' }, { kind: 'pr-title-unparsed' }],
      });
    });

    it('takes the ticket reference from the title over the flag', () => {
      const report = resolveMerge(
        buildInput({ block: readBlock([entryOf({ type: 'feat' })]), prTitle: '#500 Add foo' }),
      );

      expect(report).toMatchObject({
        effective_record: { ticket_ref: '#500' },
        effective_sources: { ticket_ref: 'pr_title' },
        merge_title: '#500 feat: Add foo (#470)',
      });
    });

    it('takes the flag’s ticket reference when the title names none', () => {
      const report = resolveMerge(buildInput({ block: readBlock([entryOf({ type: 'feat' })]), prTitle: 'Add foo' }));

      expect(report).toMatchObject({
        effective_record: { ticket_ref: '#466' },
        effective_sources: { ticket_ref: 'flags' },
      });
    });

    it('when the ticket reference is unknown, renders the merge title without one', () => {
      const report = resolveMerge(
        buildInput({ block: readBlock([entryOf({ type: 'feat' })]), prTitle: 'Add foo', ticketRef: null }),
      );

      expect(report).toMatchObject({
        effective_record: { ticket_ref: null },
        effective_sources: { ticket_ref: null },
        merge_title: 'feat: Add foo (#470)',
      });
    });

    it('when the merge template is empty, uses the bare title', () => {
      const templates = { ...TEMPLATES, merge: '' };

      const report = resolveMerge(buildInput({ block: readBlock([entryOf({ type: 'feat' })]), templates }));

      expect(report.merge_title).toBe('Add foo');
    });
  });

  describe('the body', () => {
    it('when ## What is the last heading, excludes the closing line and the block', () => {
      const block = renderChangeRecordBlock({ title: 'Add foo' });

      const report = resolveMerge(
        buildInput({ prBody: `## What\n\n- Adds foo.\n- Adds bar.\n\nCloses #466\n\n${block}\n` }),
      );

      expect(report.body).toBe('- Adds foo.\n- Adds bar.');
    });

    it('takes ## What alone when another section follows it', () => {
      const report = resolveMerge(
        buildInput({ prBody: '## What\n\n- Adds foo.\n\n## Why\n\nBecause.\n\nCloses #466\n' }),
      );

      expect(report.body).toBe('- Adds foo.');
    });

    it('reads a body whose lines end in CRLF', () => {
      const report = resolveMerge(buildInput({ prBody: '## What\r\n\r\n- Adds foo.\r\n\r\nFixes #466\r\n' }));

      expect(report.body).toBe('- Adds foo.');
    });

    it('drops a closing line naming several references, and keeps a line that only mentions a fix', () => {
      const prBody = '## What\n\n- Fixes #12 by guarding the parser.\n\nResolves: #466, owner/repo#7 and MAC-147.\n';

      const report = resolveMerge(buildInput({ prBody }));

      expect(report.body).toBe('- Fixes #12 by guarding the parser.');
    });

    it('yields an empty body when the pull request does not have a ## What', () => {
      const report = resolveMerge(buildInput({ prBody: 'Adds foo.\n' }));

      expect(report.body).toBe('');
    });
  });
});
