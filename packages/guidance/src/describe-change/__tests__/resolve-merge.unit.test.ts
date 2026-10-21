import { describe, expect, it } from 'vitest';

import type { ChangeRecordBlockReading } from '../change-record-block.ts';
import { resolveMerge } from '../resolve-merge.ts';
import { buildInput, ENTRIES, entryOf, HEAD_COMMIT, readBlock, unavailable } from '../test-utils/merge-fixtures.ts';

/** Places a block's entries at a commit other than the head. */
const STALE = { entriesCommit: 'aabbccdd' };

describe(resolveMerge, () => {
  describe('when the entries and the commits agree', () => {
    it('merges the entries’ record, attributes it to the block, and shows nothing', () => {
      const report = resolveMerge(
        buildInput({
          block: readBlock([entryOf({ scope: 'agents', type: 'feat' })]),
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
        merge_block: expect.stringMatching(/^```change-record\n/),
        entry_count: 1,
        sources: {
          block: {
            title: 'Add foo',
            overrides: {},
            entries_commit: 'e5029924',
            entries: [entryOf({ scope: 'agents', type: 'feat' })],
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
        buildInput({
          block: readBlock([entryOf({ scope: 'agents', type: 'feat' })]),
          prTitle: '#466 agents|feat: Add foo',
        }),
      );

      expect(report).toMatchObject({
        effective_record: { title: 'Add foo' },
        merge_title: '#466 agents|feat: Add foo (#470)',
        notices: [],
      });
    });

    it('renders the marker for a breaking record', () => {
      const report = resolveMerge(
        buildInput({ block: readBlock([entryOf({ breaking: true, scope: 'agents', type: 'feat' })]) }),
      );

      expect(report.merge_title).toBe('#466 agents|feat!: Add foo (#470)');
    });
  });

  describe('when stale entries and the commits disagree', () => {
    it('lets the entries’ record stand, attributes it to the block, and warns only that the entries are stale', () => {
      const report = resolveMerge(
        buildInput({
          block: readBlock([entryOf({ scope: 'agents', type: 'feat' })], STALE),
          commitsRecord: { breaking: true, scope: 'kb', type: 'docs' },
        }),
      );

      expect(report).toMatchObject({
        effective_record: { breaking: false, scope: 'agents', type: 'feat' },
        effective_sources: { breaking: 'block', scope: 'block', type: 'block' },
        notices: [{ entries_commit: 'aabbccdd', head_commit: HEAD_COMMIT, kind: 'stale-entries' }],
        sources: { commits: { breaking: true, scope: 'kb', type: 'docs' } },
      });
    });

    it('lets the entries’ record stand over commits that do not contain any entry', () => {
      const report = resolveMerge(
        buildInput({
          block: readBlock([entryOf({ scope: 'agents', type: 'feat' })], STALE),
          commits: { kind: 'read' },
        }),
      );

      expect(report).toMatchObject({
        effective_record: { breaking: false, scope: 'agents', type: 'feat' },
        notices: [{ kind: 'stale-entries' }],
        sources: { commits: { breaking: null, scope: null, type: null } },
      });
    });

    it('applies the block’s overrides to the entries’ record, attributing the fields that they set', () => {
      const report = resolveMerge(
        buildInput({
          block: readBlock([entryOf({ scope: 'agents', type: 'feat' })], {
            ...STALE,
            overrides: { breaking: true, scope: '*' },
          }),
          commitsRecord: { scope: 'kb', type: 'docs' },
        }),
      );

      expect(report).toMatchObject({
        effective_record: { breaking: true, scope: null, type: 'feat' },
        effective_sources: { breaking: 'block_overrides', scope: 'block_overrides', type: 'block' },
      });
    });
  });

  describe('when the commits are unavailable', () => {
    it('lets the entries’ record stand and says why', () => {
      const report = resolveMerge(
        buildInput({
          block: readBlock([entryOf({ scope: 'agents', type: 'feat' })]),
          commits: unavailable('not fetched'),
        }),
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
        notices: [{ kind: 'absent-block' }],
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
        notices: [{ kind: 'absent-block' }],
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
        notices: [{ kind: 'absent-block' }],
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
        notices: [{ kind: 'absent-block' }],
      });
    });

    it('without a label, takes every field from the commits and shows only the absent block', () => {
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
        notices: [{ kind: 'absent-block' }],
      });
    });
  });

  describe('overrides', () => {
    it('outrank the block and its overrides, field by field', () => {
      const report = resolveMerge(
        buildInput({
          block: readBlock([entryOf({ scope: 'agents', type: 'feat' })], { overrides: { scope: 'kb', type: 'sec' } }),
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
        buildInput({ block: readBlock([entryOf({ scope: 'agents', type: 'feat' })]), overrides: { type: 'feat' } }),
      );

      expect(report.effective_sources).toMatchObject({ scope: 'block', type: 'flags' });
    });

    it('clear the scope for a scope of *', () => {
      const report = resolveMerge(
        buildInput({ block: readBlock([entryOf({ scope: 'agents', type: 'feat' })]), overrides: { scope: '*' } }),
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
          block: readBlock([entryOf({ breaking: true, type: 'feat' })], { overrides: { breaking: true } }),
          overrides: { breaking: false },
        }),
      );

      expect(report).toMatchObject({ effective_record: { breaking: false }, effective_sources: { breaking: 'flags' } });
    });

    it('add a marker to a record that has none', () => {
      const report = resolveMerge(
        buildInput({ block: readBlock([entryOf({ type: 'feat' })]), overrides: { breaking: true } }),
      );

      expect(report.merge_title).toBe('#466 feat!: Add foo (#470)');
    });

    it('keep the resolved marker when only the type is overridden', () => {
      const report = resolveMerge(
        buildInput({ block: readBlock([entryOf({ breaking: true, type: 'feat' })]), overrides: { type: 'sec' } }),
      );

      expect(report).toMatchObject({
        effective_record: { breaking: true, scope: null, type: 'sec' },
        effective_sources: { breaking: 'block', type: 'flags' },
      });
    });
  });

  describe('defects', () => {
    it('reports an effective record that does not name a type', () => {
      const report = resolveMerge(buildInput({ block: readBlock([]) }));

      expect(report.defects).toStrictEqual([{ kind: 'missing-type' }]);
    });

    it('reports the defects of the effective record that the overrides produce', () => {
      const report = resolveMerge(
        buildInput({ block: readBlock([entryOf({ breaking: true, type: 'feat' })]), overrides: { type: 'docs' } }),
      );

      expect(report.defects).toStrictEqual([{ kind: 'policy-violation', policy: 'forbidden', type: 'docs' }]);
    });

    it('reports each defective entry, naming its index, before the effective record’s defect', () => {
      const report = resolveMerge(
        buildInput({
          block: readBlock([
            entryOf({ type: 'feat' }),
            entryOf({ type: 'feature' }),
            entryOf({ breaking: true, type: 'docs' }),
          ]),
          overrides: { breaking: true, type: 'docs' },
        }),
      );

      expect(report.defects).toStrictEqual([
        { entry: 1, kind: 'undeclared-type', type: 'feature' },
        { entry: 2, kind: 'policy-violation', policy: 'forbidden', type: 'docs' },
        { kind: 'policy-violation', policy: 'forbidden', type: 'docs' },
      ]);
    });

    it('reports a defective entry whether or not the entries are fresh', () => {
      const report = resolveMerge(
        buildInput({
          block: readBlock([entryOf({ breaking: true, type: 'docs' })], STALE),
          overrides: { breaking: false, type: 'feat' },
        }),
      );

      expect(report.defects).toStrictEqual([{ entry: 0, kind: 'policy-violation', policy: 'forbidden', type: 'docs' }]);
    });
  });

  describe('the sources', () => {
    it('mirror the block as read', () => {
      const report = resolveMerge(buildInput({ block: readBlock([], { overrides: { breaking: true, type: 'sec' } }) }));

      expect(report.sources.block).toStrictEqual({
        title: 'Add foo',
        overrides: { breaking: true, type: 'sec' },
        entries_commit: null,
        entries: [],
      });
    });

    it('mirror the entries and the derivation commit that the block records', () => {
      const report = resolveMerge(buildInput({ block: readBlock(ENTRIES) }));

      expect(report.sources.block).toMatchObject({ entries: ENTRIES, entries_commit: 'e5029924' });
    });
  });
});
