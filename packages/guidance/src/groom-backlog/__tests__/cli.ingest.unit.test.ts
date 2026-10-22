import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runCli } from '../cli.ts';
import type { CommandContext } from '../command.ts';
import { buildReply } from '../test-utils/build-reply.ts';
import { setUpCliFixture, tearDownCliFixture } from '../test-utils/cli-fixture.ts';
import { ISSUES } from '../test-utils/issue-fixtures.ts';

describe(runCli, () => {
  let root: string;
  let context: CommandContext;

  beforeEach(() => {
    const issues = structuredClone(ISSUES);
    ({ context, root } = setUpCliFixture(() => issues));
  });

  afterEach(async () => {
    await tearDownCliFixture(root);
  });

  describe('ingest', () => {
    beforeEach(() => {
      writeFileSync(
        path.join(root, 'ticket.json'),
        JSON.stringify({ number: 10, updatedAt: '2026-02-01T00:00:00Z', inProgress: null }),
      );
    });

    it('stores a valid reply, appends its assessment record, and reports its class', async () => {
      const reply = buildReply({ dependsOn: 7, verdicts: { ...buildReply().verdicts, relevance: 'uncertain' } });

      const result = await runCli(['ingest', '--run', 'r', '--ticket', 'ticket.json'], {
        ...context,
        stdin: `I assessed it.\n\n\`\`\`json\n${JSON.stringify(reply)}\n\`\`\`\n`,
      });

      expect(result).toMatchObject({ ok: true, number: 10, class: 'escalate' });
      expect(readLedgerLines(root)).toStrictEqual([
        expect.objectContaining({
          run: 'r',
          kind: 'assessment',
          number: 10,
          assessedAt: '2026-10-01T12:00:00Z',
          sha: 'abc1234',
          ticketUpdatedAt: '2026-02-01T00:00:00Z',
          class: 'escalate',
          rule: null,
          dependsOn: 7,
          overlaps: [],
        }),
      ]);
      expect(existsSync(path.join(root, 'local', 'ticket-triage', 'assessments', 'r', '10.json'))).toBe(true);
    });

    it("keeps silently an umbrella's keep with partial progress, and stores the umbrella flag", async () => {
      writeFileSync(
        path.join(root, 'ticket.json'),
        JSON.stringify({
          number: 10,
          updatedAt: '2026-02-01T00:00:00Z',
          inProgress: null,
          body: '- [ ] Every child is closed.',
          subIssues: { completed: 1, total: 2 },
        }),
      );
      const reply = buildReply({ verdicts: { ...buildReply().verdicts, progress: 'partial' } });

      const result = await runCli(['ingest', '--run', 'r', '--ticket', 'ticket.json'], {
        ...context,
        stdin: JSON.stringify(reply),
      });

      expect(result).toMatchObject({ ok: true, class: 'silent-keep' });
      const stored: unknown = JSON.parse(
        readFileSync(path.join(root, 'local', 'ticket-triage', 'assessments', 'r', '10.json'), 'utf8'),
      );
      expect(stored).toMatchObject({ umbrella: true });
    });

    it('refuses a reply that fails validation and does not append it', async () => {
      const reply = { ...buildReply(), rule: 'half-met' };

      const result = await runCli(['ingest', '--run', 'r', '--ticket', 'ticket.json'], {
        ...context,
        stdin: JSON.stringify(reply),
      });

      expect(result).toMatchObject({ ok: false, error: 'invalid-reply' });
      expect(readLedgerLines(root)).toStrictEqual([]);
    });

    it('refuses a reply that assesses another ticket', async () => {
      const result = await runCli(['ingest', '--run', 'r', '--ticket', 'ticket.json'], {
        ...context,
        stdin: JSON.stringify(buildReply({ number: 99 })),
      });

      expect(result).toMatchObject({ ok: false, error: 'invalid-reply' });
    });
  });

  describe('record', () => {
    it('appends the records with the run and a timestamp filled in', async () => {
      const stdin = [
        JSON.stringify({
          kind: 'decision',
          number: 10,
          decision: 'close-not-planned',
          decidedBy: 'bulk',
          reason: 'Dormant',
        }),
        JSON.stringify({ kind: 'note', text: 'Done' }),
      ].join('\n');

      const result = await runCli(['record', '--run', 'r'], { ...context, stdin });

      expect(result).toMatchObject({ ok: true, appended: 2 });
      expect(readLedgerLines(root)).toStrictEqual([
        {
          run: 'r',
          kind: 'decision',
          number: 10,
          decision: 'close-not-planned',
          actor: 'agent',
          decidedBy: 'bulk',
          reason: 'Dormant',
          appliedAt: '2026-10-01T12:00:00Z',
        },
        { run: 'r', kind: 'note', text: 'Done', recordedAt: '2026-10-01T12:00:00Z' },
      ]);
    });

    it('appends pull records', async () => {
      const stdin = JSON.stringify([{ kind: 'pull', picked: [11], sha: 'abc1234' }]);

      expect(await runCli(['record', '--run', 'p'], { ...context, stdin })).toMatchObject({ appended: 1 });
      expect(readLedgerLines(root)).toStrictEqual([
        { run: 'p', kind: 'pull', picked: [11], sha: 'abc1234', recordedAt: '2026-10-01T12:00:00Z' },
      ]);
    });

    it('appends nothing when any record is invalid', async () => {
      const stdin = JSON.stringify([
        { kind: 'note', text: 'Fine' },
        { kind: 'decision', number: 10, decision: 'shelve', decidedBy: 'user' },
      ]);

      expect(await runCli(['record', '--run', 'r'], { ...context, stdin })).toMatchObject({
        ok: false,
        error: 'invalid-record',
      });
      expect(readLedgerLines(root)).toStrictEqual([]);
    });
  });
});

// region | Helpers

/** Reads the fixture's ledger as parsed lines, returning an empty list for a ledger not yet written. */
function readLedgerLines(root: string): unknown[] {
  const file = path.join(root, 'local', 'ticket-triage', 'ledger.jsonl');
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line !== '')
    .map((line): unknown => JSON.parse(line));
}

// endregion | Helpers
