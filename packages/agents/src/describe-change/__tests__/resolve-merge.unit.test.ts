import { describe, expect, it } from 'vitest';

import type { ChangeRecord, Taxonomy } from '../../change-grammar/types.ts';
import {
  type ChangeRecordBlockReading,
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

const BODY = '## What\n\n- Adds foo.\n';

describe(resolveMerge, () => {
  describe('where the record and the derivation agree', () => {
    it('merges the recorded head and shows nothing', () => {
      const report = resolveMerge(
        buildInput({ block: readBlock({ scope: 'agents', type: 'feat' }), derived: { scope: 'agents', type: 'feat' } }),
      );

      expect(report).toStrictEqual({
        head: { breaking: false, scope: 'agents', type: 'feat' },
        recorded: { breaking: false, scope: 'agents', type: 'feat' },
        derived: { breaking: false, scope: 'agents', type: 'feat' },
        labeled: null,
        title: 'Add foo',
        ticket_ref: '#466',
        merge_title: '#466 agents|feat: Add foo (#470)',
        body: '- Adds foo.',
        defects: [],
        notices: [],
      });
    });

    it('when the title carries the same typed prefix, merges it once', () => {
      const report = resolveMerge(
        buildInput({ block: readBlock({ scope: 'agents', type: 'feat' }), prTitle: '#466 agents|feat: Add foo' }),
      );

      expect(report).toMatchObject({ merge_title: '#466 agents|feat: Add foo (#470)', notices: [], title: 'Add foo' });
    });

    it('renders the marker for a breaking head', () => {
      const report = resolveMerge(buildInput({ block: readBlock({ breaking: true, scope: 'agents', type: 'feat' }) }));

      expect(report.merge_title).toBe('#466 agents|feat!: Add foo (#470)');
    });
  });

  describe('where the record and the derivation disagree', () => {
    it('while the branch is unmoved, uses the record and shows the derivation', () => {
      const report = resolveMerge(
        buildInput({ block: readBlock({ scope: 'agents', type: 'feat' }), derived: { scope: 'agents', type: 'docs' } }),
      );

      expect(report).toMatchObject({
        head: { breaking: false, scope: 'agents', type: 'feat' },
        notices: [{ kind: 'divergence', shown: { breaking: false, scope: 'agents', type: 'docs' }, used: 'record' }],
      });
    });

    it('once the branch has moved, uses the derivation and shows the record', () => {
      const report = resolveMerge(
        buildInput({
          block: readBlock({ scope: 'agents', type: 'feat' }, { commit: 'aaaaaaaa' }),
          derived: { breaking: true, scope: 'agents', type: 'feat' },
        }),
      );

      expect(report).toMatchObject({
        head: { breaking: true, scope: 'agents', type: 'feat' },
        notices: [
          { kind: 'divergence', shown: { breaking: false, scope: 'agents', type: 'feat' }, used: 'derivation' },
        ],
      });
    });

    it('reads a recorded commit shorter than seven characters as moved', () => {
      const report = resolveMerge(
        buildInput({
          block: readBlock({ scope: 'agents', type: 'feat' }, { commit: 'e50299' }),
          derived: { scope: 'kb', type: 'feat' },
        }),
      );

      expect(report.notices).toMatchObject([{ kind: 'divergence', used: 'derivation' }]);
    });

    it('compares a derivation that found no entries like any other head', () => {
      const report = resolveMerge(buildInput({ block: readBlock({ scope: 'agents', type: 'feat' }), derived: {} }));

      expect(report).toMatchObject({
        derived: { breaking: false, scope: null, type: null },
        head: { scope: 'agents', type: 'feat' },
        notices: [{ kind: 'divergence', shown: { breaking: false, scope: null, type: null }, used: 'record' }],
      });
    });

    it('applies the record’s overrides to the derivation where it wins', () => {
      const report = resolveMerge(
        buildInput({
          block: readBlock(
            { scope: 'agents', type: 'docs' },
            { commit: 'aaaaaaaa', overrides: { breaking: true, scope: '*' } },
          ),
          derived: { scope: 'kb', type: 'feat' },
        }),
      );

      expect(report.head).toStrictEqual({ breaking: true, scope: null, type: 'feat' });
    });
  });

  describe('where the derivation is unavailable', () => {
    it('lets the record stand and says why', () => {
      const report = resolveMerge(
        buildInput({ block: readBlock({ scope: 'agents', type: 'feat' }), derivation: unavailable('not fetched') }),
      );

      expect(report).toMatchObject({
        derived: null,
        head: { scope: 'agents', type: 'feat' },
        notices: [{ kind: 'derivation-unavailable', reason: 'not fetched' }],
      });
    });

    it('without a block, lets the labels stand and says why', () => {
      const report = resolveMerge(
        buildInput({ derivation: unavailable('not fetched'), labeled: { scope: 'kb', type: 'docs' } }),
      );

      expect(report).toMatchObject({
        head: { breaking: false, scope: 'kb', type: 'docs' },
        notices: [{ kind: 'derivation-unavailable' }],
      });
    });
  });

  describe('without a readable block', () => {
    it('reports a malformed block and resolves as though it were absent', () => {
      const block: ChangeRecordBlockReading = { defect: '`head` is not a mapping', kind: 'malformed' };

      const report = resolveMerge(buildInput({ block, derived: { scope: 'agents', type: 'feat' } }));

      expect(report).toMatchObject({
        head: { scope: 'agents', type: 'feat' },
        notices: [{ defect: '`head` is not a mapping', kind: 'malformed-record' }],
        recorded: null,
      });
    });

    it('takes the type and its marker from the labels, and the scope from the derivation', () => {
      const report = resolveMerge(
        buildInput({ derived: { scope: 'agents', type: 'feat' }, labeled: { breaking: true, type: 'drop' } }),
      );

      expect(report).toMatchObject({
        head: { breaking: true, scope: 'agents', type: 'drop' },
        labeled: { breaking: true, scope: null, type: 'drop' },
        notices: [{ kind: 'divergence', shown: { breaking: false, scope: 'agents', type: 'feat' }, used: 'labels' }],
      });
    });

    it('takes the scope from its label, and the type and its marker from the derivation', () => {
      const report = resolveMerge(
        buildInput({ derived: { breaking: true, scope: 'agents', type: 'feat' }, labeled: { scope: 'kb' } }),
      );

      expect(report.head).toStrictEqual({ breaking: true, scope: 'kb', type: 'feat' });
    });

    it('never combines a breaking label with the derivation’s type', () => {
      const report = resolveMerge(
        buildInput({ derived: { scope: 'agents', type: 'feat' }, labeled: { breaking: true } }),
      );

      expect(report).toMatchObject({ head: { breaking: false, type: 'feat' }, labeled: null, notices: [] });
    });

    it('never combines a type label with the derivation’s marker', () => {
      const report = resolveMerge(
        buildInput({ derived: { breaking: true, scope: 'agents', type: 'feat' }, labeled: { type: 'feat' } }),
      );

      expect(report).toMatchObject({
        head: { breaking: false, scope: 'agents', type: 'feat' },
        notices: [{ kind: 'divergence', used: 'labels' }],
      });
    });

    it('where no label resolves, uses the derivation and shows nothing', () => {
      const report = resolveMerge(buildInput({ derived: { scope: 'agents', type: 'feat' } }));

      expect(report).toMatchObject({ head: { scope: 'agents', type: 'feat' }, labeled: null, notices: [] });
    });
  });

  describe('overrides', () => {
    it('outrank the record and its overrides, dimension by dimension', () => {
      const report = resolveMerge(
        buildInput({
          block: readBlock({ scope: 'agents', type: 'feat' }, { overrides: { scope: 'kb', type: 'sec' } }),
          overrides: { type: 'docs' },
        }),
      );

      expect(report.head).toStrictEqual({ breaking: false, scope: 'kb', type: 'docs' });
    });

    it('clear the scope for a scope of *', () => {
      const report = resolveMerge(
        buildInput({ block: readBlock({ scope: 'agents', type: 'feat' }), overrides: { scope: '*' } }),
      );

      expect(report).toMatchObject({ head: { scope: null }, merge_title: '#466 feat: Add foo (#470)' });
    });

    it('remove a marker that the head and the record’s override both set', () => {
      const report = resolveMerge(
        buildInput({
          block: readBlock({ breaking: true, type: 'feat' }, { overrides: { breaking: true } }),
          overrides: { breaking: false },
        }),
      );

      expect(report.head.breaking).toBe(false);
    });

    it('add a marker to a head that carries none', () => {
      const report = resolveMerge(buildInput({ block: readBlock({ type: 'feat' }), overrides: { breaking: true } }));

      expect(report.merge_title).toBe('#466 feat!: Add foo (#470)');
    });

    it('keep the resolved marker where only the type is overridden', () => {
      const report = resolveMerge(
        buildInput({ block: readBlock({ breaking: true, type: 'feat' }), overrides: { type: 'sec' } }),
      );

      expect(report.head).toStrictEqual({ breaking: true, scope: null, type: 'sec' });
    });
  });

  describe('defects', () => {
    it('reports a head that names no type', () => {
      const report = resolveMerge(buildInput({ block: readBlock({ scope: 'agents' }) }));

      expect(report.defects).toStrictEqual([{ kind: 'unclassified' }]);
    });

    it('reports a type that the taxonomy does not declare', () => {
      const report = resolveMerge(buildInput({ block: readBlock({ type: 'feat' }), overrides: { type: 'feature' } }));

      expect(report.defects).toStrictEqual([{ kind: 'undeclared-type', type: 'feature' }]);
    });

    it('reports a marker that the type’s policy forbids', () => {
      const report = resolveMerge(
        buildInput({ block: readBlock({ breaking: true, type: 'feat' }), overrides: { type: 'docs' } }),
      );

      expect(report.defects).toStrictEqual([{ kind: 'policy-violation', policy: 'forbidden', type: 'docs' }]);
    });

    it('reports a marker that the type’s policy requires and the head omits', () => {
      const report = resolveMerge(buildInput({ block: readBlock({ type: 'drop' }) }));

      expect(report.defects).toStrictEqual([{ kind: 'policy-violation', policy: 'required', type: 'drop' }]);
    });
  });

  describe('the title', () => {
    it('offers a typed prefix that differs from the head as a candidate, and keeps it out of the title', () => {
      const report = resolveMerge(
        buildInput({
          block: readBlock({ scope: 'agents', type: 'feat' }),
          prTitle: '#466 kb|docs: Describe the store',
        }),
      );

      expect(report).toMatchObject({
        merge_title: '#466 agents|feat: Describe the store (#470)',
        notices: [{ head: { breaking: false, scope: 'kb', type: 'docs' }, kind: 'candidate-head' }],
        title: 'Describe the store',
      });
    });

    it('reads the typed prefix through the pull-request template where that template names {type}', () => {
      const templates = { ...TEMPLATES, pr: '[{ticket_ref} ][[{scope}|]{type}: ]{title}' };

      const report = resolveMerge(
        buildInput({ block: readBlock({ type: 'feat' }), prTitle: '#466 kb|feat!: Describe the store', templates }),
      );

      expect(report).toMatchObject({
        notices: [{ head: { breaking: true, scope: 'kb', type: 'feat' }, kind: 'candidate-head' }],
        title: 'Describe the store',
      });
    });

    it('takes an overriding title in place of the pull-request title, and offers no candidate', () => {
      const report = resolveMerge(
        buildInput({
          block: readBlock({ scope: 'agents', type: 'feat' }),
          overrides: { title: 'Rename kb|docs: the shared layer' },
          prTitle: '#466 Rename kb|docs: the shared layer',
        }),
      );

      expect(report).toMatchObject({
        merge_title: '#466 agents|feat: Rename kb|docs: the shared layer (#470)',
        notices: [],
      });
    });

    it('where the title does not invert, uses the recorded title and says so', () => {
      const templates = { ...TEMPLATES, pr: '{ticket_ref} {title}' };

      const report = resolveMerge(
        buildInput({ block: readBlock({ title: 'Add the parser', type: 'feat' }), prTitle: 'Add foo', templates }),
      );

      expect(report).toMatchObject({
        notices: [{ kind: 'title-fallback', source: 'record' }],
        ticket_ref: '#466',
        title: 'Add the parser',
      });
    });

    it('where the title does not invert and no record is readable, uses the pull-request title verbatim', () => {
      const templates = { ...TEMPLATES, pr: '{ticket_ref} {title}' };

      const report = resolveMerge(buildInput({ prTitle: 'Add foo', templates }));

      expect(report).toMatchObject({ notices: [{ kind: 'title-fallback', source: 'pr-title' }], title: 'Add foo' });
    });

    it('takes the ticket reference from the title over the fallback', () => {
      const report = resolveMerge(buildInput({ block: readBlock({ type: 'feat' }), prTitle: '#500 Add foo' }));

      expect(report).toMatchObject({ merge_title: '#500 feat: Add foo (#470)', ticket_ref: '#500' });
    });

    it('takes the fallback ticket reference where the title carries none', () => {
      const report = resolveMerge(buildInput({ block: readBlock({ type: 'feat' }), prTitle: 'Add foo' }));

      expect(report.ticket_ref).toBe('#466');
    });

    it('where no ticket reference is known, renders the merge title without one', () => {
      const report = resolveMerge(
        buildInput({ block: readBlock({ type: 'feat' }), prTitle: 'Add foo', ticketRef: null }),
      );

      expect(report).toMatchObject({ merge_title: 'feat: Add foo (#470)', ticket_ref: null });
    });

    it('where the merge template is empty, uses the bare title', () => {
      const templates = { ...TEMPLATES, merge: '' };

      const report = resolveMerge(buildInput({ block: readBlock({ type: 'feat' }), templates }));

      expect(report.merge_title).toBe('Add foo');
    });
  });

  describe('the body', () => {
    it('where ## What is the last heading, excludes the closing line and the record block', () => {
      const block = renderChangeRecordBlock({ commit: 'e5029924', head: { type: 'feat' } });

      const report = resolveMerge(
        buildInput({ prBody: `## What\n\n- Adds foo.\n- Adds bar.\n\nCloses #466\n\n${block}\n` }),
      );

      expect(report.body).toBe('- Adds foo.\n- Adds bar.');
    });

    it('takes ## What alone where another section follows it', () => {
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

    it('yields an empty body where the pull request has no ## What', () => {
      const report = resolveMerge(buildInput({ prBody: 'Adds foo.\n' }));

      expect(report.body).toBe('');
    });
  });
});

// region | Helpers

/**
 * Builds a merge input from the house templates and a taxonomy of one type per policy. A `derived` head stands for an
 * available derivation, which otherwise agrees with the block's head, and a `ticketRef` of null leaves the fallback
 * reference out.
 */
function buildInput(
  changes: Partial<Omit<MergeInput, 'pr' | 'ticketRef'>> & {
    derived?: ChangeRecord;
    prBody?: string;
    prTitle?: string;
    ticketRef?: string | null;
  } = {},
): MergeInput {
  const { derived, prBody, prTitle, ticketRef, ...rest } = changes;
  return {
    block: { kind: 'absent' },
    derivation: { head: derived ?? (rest.block?.kind === 'read' ? rest.block.block.head : {}), kind: 'derived' },
    labeled: {},
    overrides: {},
    taxonomy: TAXONOMY,
    templates: TEMPLATES,
    ...(ticketRef !== null && { ticketRef: ticketRef ?? '#466' }),
    ...rest,
    pr: { body: prBody ?? BODY, headCommit: HEAD_COMMIT, number: '470', title: prTitle ?? '#466 Add foo' },
  };
}

/** Builds a block reading recorded at a prefix of the head commit unless another commit is given. */
function readBlock(
  head: ChangeRecord,
  options: { commit?: string; overrides?: RecordOverrides } = {},
): ChangeRecordBlockReading {
  return {
    block: {
      commit: options.commit ?? 'e5029924',
      head,
      ...(options.overrides !== undefined && { overrides: options.overrides }),
    },
    kind: 'read',
  };
}

/** Builds a derivation that could not be made, for the reason given. */
function unavailable(reason: string): MergeInput['derivation'] {
  return { kind: 'unavailable', reason };
}

// endregion | Helpers
