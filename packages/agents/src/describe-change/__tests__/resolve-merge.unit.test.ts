import { describe, expect, it } from 'vitest';

import type { ChangeRecord, Taxonomy } from '../../change-grammar/types.ts';
import type { ChangeEntry } from '../change-entries.ts';
import {
  type ChangeRecordBlockReading,
  readMergeChangeRecordBlock,
  type RecordOverrides,
  renderChangeRecordBlock,
} from '../change-record-block.ts';
import { type MergeInput, resolveMerge } from '../resolve-merge.ts';
import type { Surface } from '../types.ts';

/** A taxonomy declaring one type of each breaking policy, independent of the repository's own. */
const TAXONOMY: Taxonomy = {
  tiers: ['public', 'internal', 'process'],
  types: [
    { breakingPolicy: 'optional', key: 'feat', tier: 'public' },
    { breakingPolicy: 'required', key: 'drop', tier: 'public' },
    { breakingPolicy: 'optional', key: 'sec', tier: 'public' },
    { breakingPolicy: 'forbidden', key: 'docs', tier: 'process' },
  ],
};

const TEMPLATES: Record<Surface, string> = {
  commit: '[[{scope}|]{type}: ]{title}',
  merge: '[{ticket_ref} ][[{scope}|]{type}: ]{title}[ (#{pr_number})]',
  pr: '[{ticket_ref} ]{title}',
  ticket: '{title}',
};

const HEAD_COMMIT = 'e5029924aa11bb22cc33dd44ee55ff6677889900';

const ENTRIES: ChangeEntry[] = [
  { breaking: false, scopes: ['kb'], text: 'Adds the store-qualified wikilink', type: 'feat' },
];

const BODY = '## What\n\n- Adds foo.\n';

describe(resolveMerge, () => {
  describe('when the block and the commits agree', () => {
    it('merges the block’s record, attributes it to the block, and shows nothing', () => {
      const report = resolveMerge(
        buildInput({
          block: readBlock({ scope: 'agents', type: 'feat' }),
          commitsRecord: { scope: 'agents', type: 'feat' },
        }),
      );

      expect(report).toStrictEqual({
        effective_record: {
          title: 'Add foo',
          scope: 'agents',
          type: 'feat',
          breaking: false,
          ticket_ref: '#466',
          pr_number: '470',
        },
        effective_sources: {
          title: 'pr_title',
          scope: 'block',
          type: 'block',
          breaking: 'block',
          ticket_ref: 'pr_title',
        },
        merge_title: '#466 agents|feat: Add foo (#470)',
        body: '- Adds foo.',
        merge_block: null,
        entry_count: 0,
        sources: {
          block: {
            title: 'Add foo',
            consolidated_record: { scope: 'agents', type: 'feat', breaking: false },
            overrides: {},
            entries_commit: null,
            entries: [],
          },
          commits: { scope: 'agents', type: 'feat', breaking: false },
          labels: { scope: null, type: null, breaking: null },
          pr_title: { title: 'Add foo', ticket_ref: '#466', scope: null, type: null, breaking: null },
        },
        defects: [],
        notices: [],
      });
    });

    it('when the title includes the same typed prefix, merges it once', () => {
      const report = resolveMerge(
        buildInput({ block: readBlock({ scope: 'agents', type: 'feat' }), prTitle: '#466 agents|feat: Add foo' }),
      );

      expect(report).toMatchObject({
        effective_record: { title: 'Add foo' },
        merge_title: '#466 agents|feat: Add foo (#470)',
        notices: [],
      });
    });

    it('renders the marker for a breaking record', () => {
      const report = resolveMerge(buildInput({ block: readBlock({ breaking: true, scope: 'agents', type: 'feat' }) }));

      expect(report.merge_title).toBe('#466 agents|feat!: Add foo (#470)');
    });
  });

  describe('when the block and the commits disagree', () => {
    it('uses the commits, attributes every field to them, and names the fields that differ', () => {
      const report = resolveMerge(
        buildInput({
          block: readBlock({ scope: 'agents', type: 'feat' }),
          commitsRecord: { scope: 'agents', type: 'docs' },
        }),
      );

      expect(report).toMatchObject({
        effective_record: { breaking: false, scope: 'agents', type: 'docs' },
        effective_sources: { breaking: 'commits', scope: 'commits', type: 'commits' },
        notices: [{ fields: ['type'], kind: 'divergence', sources: ['block', 'commits'] }],
      });
    });

    it('takes a breaking marker the commits add to the block’s record', () => {
      const report = resolveMerge(
        buildInput({
          block: readBlock({ scope: 'agents', type: 'feat' }),
          commitsRecord: { breaking: true, scope: 'agents', type: 'feat' },
        }),
      );

      expect(report).toMatchObject({
        effective_record: { breaking: true, scope: 'agents', type: 'feat' },
        notices: [{ fields: ['breaking'], kind: 'divergence', sources: ['block', 'commits'] }],
      });
    });

    it('compares commits that contain no entry like any other record', () => {
      const report = resolveMerge(
        buildInput({ block: readBlock({ scope: 'agents', type: 'feat' }), commits: { kind: 'read' } }),
      );

      expect(report).toMatchObject({
        effective_record: { breaking: false, scope: null, type: null },
        notices: [{ fields: ['scope', 'type'], kind: 'divergence', sources: ['block', 'commits'] }],
        sources: { commits: { breaking: null, scope: null, type: null } },
      });
    });

    it('applies the block’s overrides to the commits’ record, attributing the fields that they set', () => {
      const report = resolveMerge(
        buildInput({
          block: readBlock({ scope: 'agents', type: 'docs' }, { overrides: { breaking: true, scope: '*' } }),
          commitsRecord: { scope: 'kb', type: 'feat' },
        }),
      );

      expect(report).toMatchObject({
        effective_record: { breaking: true, scope: null, type: 'feat' },
        effective_sources: { breaking: 'block_overrides', scope: 'block_overrides', type: 'commits' },
      });
    });
  });

  describe('when the commits are unavailable', () => {
    it('lets the block’s record stand and says why', () => {
      const report = resolveMerge(
        buildInput({ block: readBlock({ scope: 'agents', type: 'feat' }), commits: unavailable('not fetched') }),
      );

      expect(report).toMatchObject({
        effective_record: { scope: 'agents', type: 'feat' },
        effective_sources: { breaking: 'block', scope: 'block', type: 'block' },
        notices: [{ kind: 'commits-unavailable', reason: 'not fetched' }],
        sources: { commits: null },
      });
    });

    it('without a block, lets the labels stand and says why', () => {
      const report = resolveMerge(
        buildInput({ commits: unavailable('not fetched'), labels: { breaking: false, scope: 'kb', type: 'docs' } }),
      );

      expect(report).toMatchObject({
        effective_record: { breaking: false, scope: 'kb', type: 'docs' },
        effective_sources: { breaking: 'labels', scope: 'labels', type: 'labels' },
        notices: [{ kind: 'absent-block' }, { kind: 'commits-unavailable' }],
      });
    });

    it('without a block or a label, attributes the fields to nothing', () => {
      const report = resolveMerge(buildInput({ commits: unavailable('not fetched') }));

      expect(report).toMatchObject({
        defects: [{ kind: 'missing-type' }],
        effective_record: { breaking: false, scope: null, type: null },
        effective_sources: { breaking: null, scope: null, type: null },
      });
    });
  });

  describe('without a readable block', () => {
    it('reports an absent block and resolves from the labels and the commits', () => {
      const report = resolveMerge(
        buildInput({ commitsRecord: { scope: 'agents', type: 'feat' }, labels: { scope: 'kb' } }),
      );

      expect(report).toMatchObject({
        effective_record: { scope: 'kb', type: 'feat' },
        effective_sources: { scope: 'labels', type: 'commits' },
        notices: [{ kind: 'absent-block' }, { fields: ['scope'], kind: 'divergence', sources: ['labels', 'commits'] }],
        sources: { block: null },
      });
    });

    it('reports a malformed block and resolves as though it were absent', () => {
      const block: ChangeRecordBlockReading = { defect: '`title` is missing', kind: 'malformed' };

      const report = resolveMerge(buildInput({ block, commitsRecord: { scope: 'agents', type: 'feat' } }));

      expect(report).toMatchObject({
        effective_record: { scope: 'agents', type: 'feat' },
        effective_sources: { breaking: 'commits', scope: 'commits', type: 'commits' },
        notices: [{ defect: '`title` is missing', kind: 'malformed-block' }],
        sources: { block: null },
      });
    });

    it('with a type label only, takes the type and its marker from the labels, and the scope from the commits', () => {
      const report = resolveMerge(
        buildInput({
          commitsRecord: { scope: 'agents', type: 'feat' },
          labels: { breaking: true, type: 'drop' },
        }),
      );

      expect(report).toMatchObject({
        effective_record: { breaking: true, scope: 'agents', type: 'drop' },
        effective_sources: { breaking: 'labels', scope: 'commits', type: 'labels' },
        notices: [
          { kind: 'absent-block' },
          { fields: ['type', 'breaking'], kind: 'divergence', sources: ['labels', 'commits'] },
        ],
        sources: { labels: { breaking: true, scope: null, type: 'drop' } },
      });
    });

    it('with a scope label only, takes the scope from the labels, and the type and its marker from the commits', () => {
      const report = resolveMerge(
        buildInput({ commitsRecord: { breaking: true, scope: 'agents', type: 'feat' }, labels: { scope: 'kb' } }),
      );

      expect(report).toMatchObject({
        effective_record: { breaking: true, scope: 'kb', type: 'feat' },
        effective_sources: { breaking: 'commits', scope: 'labels', type: 'commits' },
        notices: [{ kind: 'absent-block' }, { fields: ['scope'], kind: 'divergence', sources: ['labels', 'commits'] }],
      });
    });

    it('with a type label and a scope label, takes every field from the labels', () => {
      const report = resolveMerge(
        buildInput({
          commitsRecord: { scope: 'agents', type: 'feat' },
          labels: { breaking: false, scope: 'kb', type: 'docs' },
        }),
      );

      expect(report).toMatchObject({
        effective_record: { breaking: false, scope: 'kb', type: 'docs' },
        effective_sources: { breaking: 'labels', scope: 'labels', type: 'labels' },
        notices: [
          { kind: 'absent-block' },
          { fields: ['scope', 'type'], kind: 'divergence', sources: ['labels', 'commits'] },
        ],
      });
    });

    it('with no label, takes every field from the commits and shows only the absent block', () => {
      const report = resolveMerge(buildInput({ commitsRecord: { scope: 'agents', type: 'feat' } }));

      expect(report).toMatchObject({
        effective_record: { scope: 'agents', type: 'feat' },
        effective_sources: { breaking: 'commits', scope: 'commits', type: 'commits' },
        notices: [{ kind: 'absent-block' }],
        sources: { labels: { breaking: null, scope: null, type: null } },
      });
    });

    it('never combines a breaking label with the commits’ type', () => {
      const report = resolveMerge(
        buildInput({ commitsRecord: { scope: 'agents', type: 'feat' }, labels: { breaking: true } }),
      );

      expect(report).toMatchObject({
        effective_record: { breaking: false, type: 'feat' },
        effective_sources: { breaking: 'commits', type: 'commits' },
        notices: [{ kind: 'absent-block' }],
        sources: { labels: { breaking: true, scope: null, type: null } },
      });
    });

    it('never combines a type label with the commits’ marker', () => {
      const report = resolveMerge(
        buildInput({
          commitsRecord: { breaking: true, scope: 'agents', type: 'feat' },
          labels: { breaking: false, type: 'feat' },
        }),
      );

      expect(report).toMatchObject({
        effective_record: { breaking: false, scope: 'agents', type: 'feat' },
        notices: [
          { kind: 'absent-block' },
          { fields: ['breaking'], kind: 'divergence', sources: ['labels', 'commits'] },
        ],
      });
    });
  });

  describe('overrides', () => {
    it('outrank the block and its overrides, field by field', () => {
      const report = resolveMerge(
        buildInput({
          block: readBlock({ scope: 'agents', type: 'feat' }, { overrides: { scope: 'kb', type: 'sec' } }),
          overrides: { type: 'docs' },
        }),
      );

      expect(report).toMatchObject({
        effective_record: { breaking: false, scope: 'kb', type: 'docs' },
        effective_sources: { breaking: 'block', scope: 'block_overrides', type: 'flags' },
      });
    });

    it('are attributed to the flags when they set the value that the record already has', () => {
      const report = resolveMerge(
        buildInput({ block: readBlock({ scope: 'agents', type: 'feat' }), overrides: { type: 'feat' } }),
      );

      expect(report.effective_sources).toMatchObject({ scope: 'block', type: 'flags' });
    });

    it('clear the scope for a scope of *', () => {
      const report = resolveMerge(
        buildInput({ block: readBlock({ scope: 'agents', type: 'feat' }), overrides: { scope: '*' } }),
      );

      expect(report).toMatchObject({
        effective_record: { scope: null },
        effective_sources: { scope: 'flags' },
        merge_title: '#466 feat: Add foo (#470)',
      });
    });

    it('remove a marker that the record and the block’s override both set', () => {
      const report = resolveMerge(
        buildInput({
          block: readBlock({ breaking: true, type: 'feat' }, { overrides: { breaking: true } }),
          overrides: { breaking: false },
        }),
      );

      expect(report).toMatchObject({ effective_record: { breaking: false }, effective_sources: { breaking: 'flags' } });
    });

    it('add a marker to a record that has none', () => {
      const report = resolveMerge(buildInput({ block: readBlock({ type: 'feat' }), overrides: { breaking: true } }));

      expect(report.merge_title).toBe('#466 feat!: Add foo (#470)');
    });

    it('keep the resolved marker when only the type is overridden', () => {
      const report = resolveMerge(
        buildInput({ block: readBlock({ breaking: true, type: 'feat' }), overrides: { type: 'sec' } }),
      );

      expect(report).toMatchObject({
        effective_record: { breaking: true, scope: null, type: 'sec' },
        effective_sources: { breaking: 'block', type: 'flags' },
      });
    });
  });

  describe('defects', () => {
    it('reports an effective record that names no type', () => {
      const report = resolveMerge(buildInput({ block: readBlock({ scope: 'agents' }) }));

      expect(report.defects).toStrictEqual([{ kind: 'missing-type' }]);
    });

    it('reports the defects of the effective record that the overrides produce', () => {
      const report = resolveMerge(
        buildInput({ block: readBlock({ breaking: true, type: 'feat' }), overrides: { type: 'docs' } }),
      );

      expect(report.defects).toStrictEqual([{ kind: 'policy-violation', policy: 'forbidden', type: 'docs' }]);
    });
  });

  describe('the sources', () => {
    it('mirror the block as read, reading an absent marker within its record as not breaking', () => {
      const report = resolveMerge(
        buildInput({ block: readBlock({ scope: 'agents' }, { overrides: { breaking: true, type: 'sec' } }) }),
      );

      expect(report.sources.block).toStrictEqual({
        title: 'Add foo',
        consolidated_record: { scope: 'agents', type: null, breaking: false },
        overrides: { breaking: true, type: 'sec' },
        entries_commit: null,
        entries: [],
      });
    });

    it('report a block that names no consolidated record with a null record', () => {
      const block: ChangeRecordBlockReading = { block: { title: 'Add foo' }, kind: 'read' };

      const report = resolveMerge(buildInput({ block }));

      expect(report.sources.block).toStrictEqual({
        title: 'Add foo',
        consolidated_record: null,
        overrides: {},
        entries_commit: null,
        entries: [],
      });
    });

    it('mirror the entries and the derivation commit that the block records', () => {
      const report = resolveMerge(
        buildInput({ block: readBlock({ type: 'feat' }, { entries: ENTRIES, fresh: true }) }),
      );

      expect(report.sources.block).toMatchObject({ entries: ENTRIES, entries_commit: 'e5029924' });
    });
  });

  describe('the entries', () => {
    it('lets a fresh block’s record stand over the commits’, and reports the divergence', () => {
      const report = resolveMerge(
        buildInput({
          block: readBlock({ scope: 'kb', type: 'feat' }, { entries: ENTRIES, fresh: true }),
          commitsRecord: { scope: 'agents', type: 'fix' },
        }),
      );

      expect(report.effective_record).toMatchObject({ scope: 'kb', type: 'feat' });
      expect(report.effective_sources).toMatchObject({ scope: 'block', type: 'block' });
      expect(report.notices).toContainEqual({
        kind: 'divergence',
        sources: ['block', 'commits'],
        fields: ['scope', 'type'],
      });
    });

    it('matches a short derivation commit against the head as a prefix, ignoring case', () => {
      const block = readBlock({ type: 'feat' }, { entries: ENTRIES, entriesCommit: 'E5029924' });

      const report = resolveMerge(buildInput({ block, commitsRecord: { type: 'fix' } }));

      expect(report.effective_sources).toMatchObject({ type: 'block' });
      expect(report.notices).not.toContainEqual(expect.objectContaining({ kind: 'stale-entries' }));
    });

    it('when the derivation commit is not the head, lets the commits win and reports staleness', () => {
      const block = readBlock({ type: 'feat' }, { entries: ENTRIES, entriesCommit: 'aabbccdd' });

      const report = resolveMerge(buildInput({ block, commitsRecord: { type: 'fix' } }));

      expect(report.effective_record).toMatchObject({ type: 'fix' });
      expect(report.effective_sources).toMatchObject({ type: 'commits' });
      expect(report.notices).toContainEqual({
        kind: 'stale-entries',
        entries_commit: 'aabbccdd',
        head_commit: HEAD_COMMIT,
      });
    });

    it('when entries record no derivation commit, reports staleness with a null commit', () => {
      const block = readBlock({ type: 'feat' }, { entries: ENTRIES });

      const report = resolveMerge(buildInput({ block, commitsRecord: { type: 'fix' } }));

      expect(report.effective_sources).toMatchObject({ type: 'commits' });
      expect(report.notices).toContainEqual({
        kind: 'stale-entries',
        entries_commit: null,
        head_commit: HEAD_COMMIT,
      });
    });

    it('keeps the commits-win rule for a block written before the entries entered the grammar', () => {
      const report = resolveMerge(buildInput({ block: readBlock({ type: 'feat' }), commitsRecord: { type: 'fix' } }));

      expect(report.effective_sources).toMatchObject({ type: 'commits' });
      expect(report.notices).not.toContainEqual(expect.objectContaining({ kind: 'stale-entries' }));
    });

    it('reports a malformed entry list as a notice, leaving the rest of the block usable', () => {
      const block = readBlock({ type: 'feat' }, { entriesDefect: '`entries[0].text` is missing' });

      const report = resolveMerge(buildInput({ block }));

      expect(report.sources.block).toMatchObject({ entries: [], title: 'Add foo' });
      expect(report.notices).toContainEqual({
        kind: 'malformed-entries',
        defect: '`entries[0].text` is missing',
      });
    });

    it('when the commits could not be read, lets a stale block’s record stand', () => {
      const block = readBlock({ type: 'feat' }, { entries: ENTRIES, entriesCommit: 'aabbccdd' });

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

      const report = resolveMerge(buildInput({ block: readBlock({ type: 'feat' }, { entries, fresh: true }) }));

      expect(report.entry_count).toBe(2);
      expect(readMergeChangeRecordBlock(report.merge_block ?? '')).toStrictEqual({
        block: { entries, prNumber: 470, ticketRef: '#466' },
        kind: 'read',
      });
    });

    it('omits the ticket reference when the merge has none', () => {
      const report = resolveMerge(
        buildInput({
          block: readBlock({ type: 'feat' }, { entries: ENTRIES, fresh: true }),
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
      const report = resolveMerge(
        buildInput({ block: readBlock({ scope: 'kb', type: 'feat' }, { entries: ENTRIES, fresh: true }) }),
      );

      expect(report.body).toBe('- Adds foo.');
      expect(report.merge_block).toMatch(/^```change-record\n/);
    });

    it('renders stale entries as written, since a merge re-derives nothing', () => {
      const block = readBlock({ type: 'feat' }, { entries: ENTRIES, entriesCommit: 'aabbccdd' });

      const report = resolveMerge(buildInput({ block, commitsRecord: { type: 'fix' } }));

      expect(report.entry_count).toBe(1);
      expect(report.merge_block).not.toBeNull();
    });

    it('renders for a repository whose commit grammar is empty', () => {
      const report = resolveMerge(
        buildInput({
          block: readBlock({ type: 'feat' }, { entries: ENTRIES, fresh: true }),
          templates: { ...TEMPLATES, commit: '' },
        }),
      );

      expect(report.entry_count).toBe(1);
      expect(report.merge_block).not.toBeNull();
    });

    it.each<{ block: ChangeRecordBlockReading; name: string }>([
      { name: 'a block that records no entry', block: readBlock({ type: 'feat' }) },
      {
        name: 'a malformed entry list',
        block: readBlock({ type: 'feat' }, { entriesDefect: '`entries[0].text` is missing' }),
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
          block: readBlock({ scope: 'agents', type: 'feat' }),
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
        buildInput({ block: readBlock({ type: 'feat' }), prTitle: '#466 kb|feat!: Describe the store', templates }),
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
          block: readBlock({ scope: 'agents', type: 'feat' }),
          overrides: { scope: 'kb', type: 'docs' },
          prTitle: '#466 kb|docs: Describe the store',
        }),
      );

      expect(report.notices).toStrictEqual([]);
    });

    it('takes an overriding title in place of the pull-request title, and still reads and compares its prefix', () => {
      const report = resolveMerge(
        buildInput({
          block: readBlock({ scope: 'agents', type: 'feat' }),
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
        buildInput({ block: readBlock({ type: 'feat' }, { title: 'Add the parser' }), prTitle: 'Add foo', templates }),
      );

      expect(report).toMatchObject({
        effective_record: { ticket_ref: '#466', title: 'Add the parser' },
        effective_sources: { ticket_ref: 'flags', title: 'block' },
        notices: [{ kind: 'pr-title-unparsed' }],
        sources: { pr_title: null },
      });
    });

    it('when the title does not invert and no block is readable, uses the pull-request title verbatim', () => {
      const templates = { ...TEMPLATES, pr: '{ticket_ref} {title}' };

      const report = resolveMerge(buildInput({ prTitle: 'Add foo', templates }));

      expect(report).toMatchObject({
        effective_record: { title: 'Add foo' },
        effective_sources: { title: 'pr_title_verbatim' },
        notices: [{ kind: 'absent-block' }, { kind: 'pr-title-unparsed' }],
      });
    });

    it('takes the ticket reference from the title over the flag', () => {
      const report = resolveMerge(buildInput({ block: readBlock({ type: 'feat' }), prTitle: '#500 Add foo' }));

      expect(report).toMatchObject({
        effective_record: { ticket_ref: '#500' },
        effective_sources: { ticket_ref: 'pr_title' },
        merge_title: '#500 feat: Add foo (#470)',
      });
    });

    it('takes the flag’s ticket reference when the title names none', () => {
      const report = resolveMerge(buildInput({ block: readBlock({ type: 'feat' }), prTitle: 'Add foo' }));

      expect(report).toMatchObject({
        effective_record: { ticket_ref: '#466' },
        effective_sources: { ticket_ref: 'flags' },
      });
    });

    it('when no ticket reference is known, renders the merge title without one', () => {
      const report = resolveMerge(
        buildInput({ block: readBlock({ type: 'feat' }), prTitle: 'Add foo', ticketRef: null }),
      );

      expect(report).toMatchObject({
        effective_record: { ticket_ref: null },
        effective_sources: { ticket_ref: null },
        merge_title: 'feat: Add foo (#470)',
      });
    });

    it('when the merge template is empty, uses the bare title', () => {
      const templates = { ...TEMPLATES, merge: '' };

      const report = resolveMerge(buildInput({ block: readBlock({ type: 'feat' }), templates }));

      expect(report.merge_title).toBe('Add foo');
    });
  });

  describe('the body', () => {
    it('when ## What is the last heading, excludes the closing line and the block', () => {
      const block = renderChangeRecordBlock({ consolidatedRecord: { type: 'feat' }, title: 'Add foo' });

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

    it('yields an empty body when the pull request has no ## What', () => {
      const report = resolveMerge(buildInput({ prBody: 'Adds foo.\n' }));

      expect(report.body).toBe('');
    });
  });
});

// region | Helpers

/**
 * Builds a merge input from the house templates and a taxonomy of one type per policy. A `commitsRecord` stands for
 * commits that were read and consolidate to it; without one, the commits agree with the block's consolidated record, or
 * contain no entry when no block is readable. A `ticketRef` of null leaves the flag's reference out.
 */
function buildInput(
  changes: Partial<Omit<MergeInput, 'pr' | 'ticketRef'>> & {
    commitsRecord?: ChangeRecord;
    prBody?: string;
    prTitle?: string;
    ticketRef?: string | null;
  } = {},
): MergeInput {
  const { commitsRecord, prBody, prTitle, ticketRef, ...rest } = changes;
  const consolidatedRecord =
    commitsRecord ?? (rest.block?.kind === 'read' ? (rest.block.block.consolidatedRecord ?? {}) : undefined);
  return {
    block: { kind: 'absent' },
    commits: { ...(consolidatedRecord !== undefined && { consolidatedRecord }), kind: 'read' },
    labels: {},
    overrides: {},
    taxonomy: TAXONOMY,
    templates: TEMPLATES,
    ...(ticketRef !== null && { ticketRef: ticketRef ?? '#466' }),
    ...rest,
    pr: {
      body: prBody ?? BODY,
      headCommit: HEAD_COMMIT,
      number: '470',
      title: prTitle ?? '#466 Add foo',
    },
  };
}

/**
 * Builds a block reading that contains the consolidated record given, with the author's overrides if any are given,
 * and a title that defaults to the pull request's.
 */
function readBlock(
  consolidatedRecord: ChangeRecord,
  options: {
    entries?: ChangeEntry[];
    entriesCommit?: string;
    entriesDefect?: string;
    fresh?: boolean;
    overrides?: RecordOverrides;
    title?: string;
  } = {},
): ChangeRecordBlockReading {
  const entriesCommit = options.fresh === true ? HEAD_COMMIT.slice(0, 8) : options.entriesCommit;
  return {
    block: {
      consolidatedRecord,
      title: options.title ?? 'Add foo',
      ...(options.entries !== undefined && { entries: options.entries }),
      ...(entriesCommit !== undefined && { entriesCommit }),
      ...(options.overrides !== undefined && { overrides: options.overrides }),
    },
    ...(options.entriesDefect !== undefined && { entriesDefect: options.entriesDefect }),
    kind: 'read',
  };
}

/** Builds commits that could not be read, for the reason given. */
function unavailable(reason: string): MergeInput['commits'] {
  return { kind: 'unavailable', reason };
}

// endregion | Helpers
