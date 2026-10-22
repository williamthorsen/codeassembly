import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { RunnerCall } from '../../test-utils/fake-runner.ts';
import { runCli } from '../cli.ts';
import type { CommandContext } from '../command.ts';
import { renderMarker } from '../marker.ts';
import type { AssessorReply } from '../schemas.ts';
import { buildReply } from '../test-utils/build-reply.ts';
import { setUpCliFixture, tearDownCliFixture } from '../test-utils/cli-fixture.ts';
import { assessment, ISSUES } from '../test-utils/issue-fixtures.ts';
import { writeLedger } from '../test-utils/write-ledger.ts';

describe(runCli, () => {
  let root: string;
  let context: CommandContext;
  let calls: RunnerCall[];
  let issues: typeof ISSUES;

  beforeEach(() => {
    issues = structuredClone(ISSUES);
    ({ calls, context, root } = setUpCliFixture(() => issues));
  });

  afterEach(async () => {
    await tearDownCliFixture(root);
  });

  describe('parent-status', () => {
    it('reports a closed ticket without a parent, without offering or writing', async () => {
      expect(await runCli(['parent-status', '--ticket', '19'], context)).toStrictEqual({
        ok: true,
        offer: false,
        parent: null,
        ticket: 19,
        ticketState: 'closed',
      });
      expect(existsSync(path.join(root, 'local'))).toBe(false);
    });

    it('requires --ticket', async () => {
      expect(await runCli(['parent-status'], context)).toMatchObject({ ok: false, error: 'invalid-args' });
    });
  });

  describe('digest', () => {
    it('renders the escalations that do not have a later decision', async () => {
      writeLedger(root, [
        { ...assessment('r', 10, '2026-10-01T00:00:00Z'), class: 'escalate' },
        { ...assessment('r', 11, '2026-10-01T00:00:00Z'), class: 'escalate' },
        { ...assessment('r', 12, '2026-10-01T00:00:00Z'), class: 'silent-keep' },
        { ...assessment('other', 13, '2026-10-01T00:00:00Z'), class: 'escalate' },
        {
          run: 'r',
          kind: 'decision',
          number: 11,
          decision: 'keep',
          actor: 'agent',
          decidedBy: 'user',
          appliedAt: '2026-10-01T01:00:00Z',
        },
      ]);

      const result = await runCli(['digest', '--run', 'r'], context);

      expect(result).toMatchObject({ ok: true, total: 1, pageSize: 25 });
      expect(result.ok && result['pages']).toMatchObject([{ entries: [{ index: 1, number: 10 }] }]);
    });

    it('refuses a page size outside 20 to 30', async () => {
      expect(await runCli(['digest', '--run', 'r', '--page-size', '31'], context)).toMatchObject({
        ok: false,
        error: 'invalid-args',
      });
    });
  });

  describe('comment', () => {
    it('refuses a non-bulk decision without a reply file', async () => {
      const result = await runCli(
        ['comment', '--run', 'r', '--number', '10', '--decision', 'keep', '--decided-by', 'user', '--out', 'c.md'],
        context,
      );

      expect(result).toMatchObject({ ok: false, error: 'missing-reply' });
    });

    it('reports a baseline keep as not posted and does not write a body', async () => {
      writeStoredReply(root, buildReply());

      const result = await runCli(
        ['comment', '--run', 'r', '--number', '10', '--decision', 'keep', '--decided-by', 'user', '--out', 'c.md'],
        context,
      );

      expect(result).toStrictEqual({ ok: true, number: 10, post: false });
      expect(existsSync(path.join(root, 'c.md'))).toBe(false);
    });

    it('renders a policy decision from the stored reply', async () => {
      const reply: AssessorReply = buildReply({ recommendation: 'close-complete' });
      writeStoredReply(root, reply);

      const result = await runCli(
        [
          'comment',
          '--run',
          'r',
          '--number',
          '10',
          '--decision',
          'close-complete',
          '--decided-by',
          'policy',
          '--out',
          'c.md',
        ],
        context,
      );

      expect(result).toMatchObject({ ok: true, number: 10 });
      expect(readFileSync(path.join(root, 'c.md'), 'utf8')).toContain('**Disposition:** Closed as complete.');
    });

    it('refuses a split without --children', async () => {
      const result = await runCli(
        ['comment', '--run', 'r', '--number', '10', '--decision', 'split', '--decided-by', 'user', '--out', 'c.md'],
        context,
      );

      expect(result).toMatchObject({ ok: false, error: 'invalid-args', message: '--children is required for a split' });
    });

    it('refuses a decision outside the vocabulary', async () => {
      const result = await runCli(
        ['comment', '--run', 'r', '--number', '10', '--decision', 'shelve', '--decided-by', 'bulk', '--out', 'c.md'],
        context,
      );

      expect(result).toMatchObject({ ok: false, error: 'invalid-args' });
    });
  });

  describe('draft', () => {
    const CONTEXT_SECTION = { heading: 'Context', body: 'The uploader lives in `src/transport/`.' };
    const DRAFT = { sections: [CONTEXT_SECTION, { heading: 'Notes', body: 'Appended.' }], title: null, children: [] };

    beforeEach(() => {
      const body = '## Problem\n\nIt fails.\n\n## Context\n\nOld path.\n';
      issues = issues.map((issue) => (issue.number === 10 ? { ...issue, body, comments: [] } : issue));
    });

    it('composes the new body from the current body, replacing and appending the drafted sections', async () => {
      writeStoredReply(root, buildReply({ recommendation: 'update', draft: DRAFT }));

      const result = await runCli(['draft', '--run', 'r', '--number', '10', '--out', 'd'], context);

      expect(result).toMatchObject({
        ok: true,
        stale: false,
        title: null,
        sections: ['Context', 'Notes'],
        children: [],
      });
      expect(readFileSync(path.join(root, 'd', 'body.md'), 'utf8')).toBe(
        '## Problem\n\nIt fails.\n\n## Context\n\nThe uploader lives in `src/transport/`.\n\n## Notes\n\nAppended.\n',
      );
    });

    it('returns the drafted title', async () => {
      writeStoredReply(root, buildReply({ recommendation: 'revise', draft: { ...DRAFT, title: 'Retry the upload' } }));

      const result = await runCli(['draft', '--run', 'r', '--number', '10', '--out', 'd'], context);

      expect(result).toMatchObject({ ok: true, stale: false, title: 'Retry the upload' });
    });

    it('writes one file per child of a split', async () => {
      const draft = {
        sections: [CONTEXT_SECTION],
        title: null,
        children: [{ title: 'Add the backoff', body: 'Backoff.' }],
      };
      writeStoredReply(root, buildReply({ recommendation: 'split', draft }));

      const result = await runCli(['draft', '--run', 'r', '--number', '10', '--out', 'd'], context);

      const child = path.join(root, 'd', 'child-1.md');
      expect(result).toMatchObject({ ok: true, children: [{ title: 'Add the backoff', path: child }] });
      expect(readFileSync(child, 'utf8')).toBe('Backoff.\n');
    });

    it('reports a stale draft and writes nothing when the ticket changed after the version assessed', async () => {
      writeStoredReply(root, buildReply({ recommendation: 'update', draft: DRAFT }), {
        ticketUpdatedAt: '2026-01-15T00:00:00Z',
      });

      const result = await runCli(['draft', '--run', 'r', '--number', '10', '--out', 'd'], context);

      expect(result).toStrictEqual({ ok: true, number: 10, stale: true });
      expect(existsSync(path.join(root, 'd'))).toBe(false);
    });

    it("does not count the run's own marker comment as a change", async () => {
      writeStoredReply(root, buildReply({ recommendation: 'update', draft: DRAFT }), {
        ticketUpdatedAt: '2026-01-15T00:00:00Z',
      });
      const comments = [
        {
          author: { login: 'owner' },
          body: renderMarker({ run: 'r', decision: 'keep' }),
          createdAt: '2026-02-01T00:00:00Z',
        },
      ];
      issues = issues.map((issue) => (issue.number === 10 ? { ...issue, comments } : issue));

      const result = await runCli(['draft', '--run', 'r', '--number', '10', '--out', 'd'], context);

      expect(result).toMatchObject({ ok: true, stale: false });
    });

    it('refuses a reply without a draft', async () => {
      writeStoredReply(root, buildReply());

      const result = await runCli(['draft', '--run', 'r', '--number', '10', '--out', 'd'], context);

      expect(result).toMatchObject({ ok: false, error: 'missing-draft' });
    });

    it('refuses a draft that replaces a frozen section of a ticket in progress', async () => {
      const inProgress = {
        signal: 'branch',
        ref: '10-uploader',
        commitsAhead: 1,
        lastCommitAt: '2026-09-01T00:00:00Z',
      };
      writeStoredReply(root, buildReply({ recommendation: 'update', draft: DRAFT }), { inProgress });

      const result = await runCli(['draft', '--run', 'r', '--number', '10', '--out', 'd'], context);

      expect(result).toMatchObject({ ok: false, error: 'frozen-section', message: expect.stringContaining('Context') });
    });
  });

  it('reports an unknown command as invalid-args', async () => {
    expect(await runCli(['nonesuch'], context)).toMatchObject({ ok: false, error: 'invalid-args' });
    expect(calls).toStrictEqual([]);
  });
});

// region | Helpers

/** Writes `reply` as run `r`'s stored reply file, with the provenance that `ingest` adds, overridden by `provenance`. */
function writeStoredReply(root: string, reply: AssessorReply, provenance: Record<string, unknown> = {}): void {
  const dir = path.join(root, 'local', 'ticket-triage', 'assessments', 'r');
  mkdirSync(dir, { recursive: true });
  const stored = {
    ...reply,
    assessedAt: '2026-10-01T00:00:00Z',
    inProgress: null,
    sha: 'abc1234',
    ticketUpdatedAt: '2026-02-01T00:00:00Z',
    umbrella: false,
    ...provenance,
  };
  writeFileSync(path.join(dir, `${reply.number}.json`), JSON.stringify(stored));
}

// endregion | Helpers
