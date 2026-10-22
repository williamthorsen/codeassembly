import { readFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runCli } from '../cli.ts';
import type { CommandContext } from '../command.ts';
import { renderMarker } from '../marker.ts';
import { setUpCliFixture, tearDownCliFixture } from '../test-utils/cli-fixture.ts';
import { assessment, ISSUES } from '../test-utils/issue-fixtures.ts';
import { writeLedger } from '../test-utils/write-ledger.ts';

describe(runCli, () => {
  let root: string;
  let context: CommandContext;
  let issues: typeof ISSUES;

  beforeEach(() => {
    issues = structuredClone(ISSUES);
    ({ context, root } = setUpCliFixture(() => issues));
  });

  afterEach(async () => {
    await tearDownCliFixture(root);
  });

  describe('collect', () => {
    it('selects, groups, and writes one input file per ticket with its signals and prior marker', async () => {
      const result = await runCli(['collect', '--run', 'r', '--out', 'in', '--exclude-label', 'blocked'], context);

      expect(result).toMatchObject({
        ok: true,
        sha: 'abc1234',
        counts: { fetched: 3, selected: 2, resumed: 0, total: 2 },
      });
      expect(result.ok && result['groups']).toMatchObject([
        { scope: 'agents', waves: [[10]] },
        { scope: null, waves: [[12]] },
      ]);
      const input: unknown = JSON.parse(readFileSync(path.join(root, 'in', '10.json'), 'utf8'));
      expect(input).toMatchObject({
        number: 10,
        priorMarker: { run: 'cal', decision: 'keep' },
        inProgress: { signal: 'branch', ref: '10-uploader', commitsAhead: 3 },
        crossReferences: [{ kind: 'closing-pr', ref: '#50' }],
      });
    });

    it('caps the tickets at --limit in sweep order, after the resume skip', async () => {
      writeLedger(root, [assessment('r', 10, '2026-03-01T00:00:00Z')]);
      issues.reverse();

      const result = await runCli(['collect', '--run', 'r', '--out', 'in', '--limit', '1'], context);

      // #10 is resumed, and #11, the oldest unscoped ticket, leads #12 whatever order `gh` returns.
      expect(result).toMatchObject({ ok: true, counts: { total: 1 } });
      expect(result.ok && result['tickets']).toMatchObject([{ number: 11 }]);
    });

    it('skips a ticket assessed in the run unless it changed since, ignoring the run marker comment', async () => {
      writeLedger(root, [
        assessment('r', 10, '2026-03-01T00:00:00Z'),
        assessment('r', 11, '2026-01-20T00:00:00Z'),
        assessment('r-dry-run', 12, '2026-03-01T00:00:00Z'),
      ]);

      const result = await runCli(['collect', '--run', 'r', '--out', 'in'], context);

      // #10 is unchanged since its assessment, #11 changed after it, and #12 was assessed only by a dry run.
      expect(result).toMatchObject({ ok: true, resumed: [10] });
      expect(result.ok && result['tickets']).toMatchObject([{ number: 11 }, { number: 12 }]);
    });

    it('reports a resumed auto-close that does not have a decision as pending', async () => {
      writeLedger(root, [
        { ...assessment('r', 10, '2026-03-01T00:00:00Z'), class: 'auto-close-complete' },
        { ...assessment('r', 11, '2026-03-01T00:00:00Z'), class: 'auto-close-half-met' },
        {
          run: 'r',
          kind: 'decision',
          number: 11,
          decision: 'close-superseded',
          actor: 'agent',
          decidedBy: 'policy',
          appliedAt: '2026-03-01T00:00:00Z',
        },
        { ...assessment('r', 12, '2026-03-01T00:00:00Z'), class: 'silent-keep' },
      ]);

      const result = await runCli(['collect', '--run', 'r', '--out', 'in'], context);

      expect(result).toMatchObject({
        ok: true,
        resumed: [10, 11, 12],
        pendingAutomatic: [{ number: 10, class: 'auto-close-complete' }],
      });
    });

    it("does not count the run's own comment as a change", async () => {
      issues[0]?.comments.push({
        author: { login: 'owner' },
        body: renderMarker({ run: 'r', decision: 'update' }),
        createdAt: '2026-02-01T00:00:00Z',
      });
      writeLedger(root, [assessment('r', 10, '2026-01-20T00:00:00Z')]);

      const result = await runCli(['collect', '--run', 'r', '--out', 'in'], context);

      expect(result).toMatchObject({ ok: true, resumed: [10] });
    });

    it('does not count an update stamped after the run comment but by the time of its decision as a change', async () => {
      // GitHub stamps `updatedAt` a second after the comment that caused it.
      issues[0]?.comments.push({
        author: { login: 'owner' },
        body: renderMarker({ run: 'r', decision: 'update' }),
        createdAt: '2026-02-01T00:00:00Z',
      });
      if (issues[0]) issues[0].updatedAt = '2026-02-01T00:00:01Z';
      writeLedger(root, [
        assessment('r', 10, '2026-01-20T00:00:00Z'),
        {
          run: 'r',
          kind: 'decision',
          number: 10,
          decision: 'update',
          actor: 'agent',
          decidedBy: 'user',
          appliedAt: '2026-02-01T00:00:01Z',
        },
      ]);

      const result = await runCli(['collect', '--run', 'r', '--out', 'in'], context);

      expect(result).toMatchObject({ ok: true, resumed: [10] });
    });

    it('reports a malformed selector as invalid-args', async () => {
      expect(await runCli(['collect', '--run', 'r', '--out', 'in', '--older-than', '3m'], context)).toMatchObject({
        ok: false,
        error: 'invalid-args',
      });
      expect(await runCli(['collect', '--out', 'in'], context)).toMatchObject({ ok: false, error: 'invalid-args' });
    });
  });
});
