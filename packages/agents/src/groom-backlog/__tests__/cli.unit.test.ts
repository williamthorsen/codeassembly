import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type CommandContext, runCli } from '../cli.ts';
import { renderMarker } from '../marker.ts';
import type { AssessorReply } from '../schemas.ts';
import { buildReply } from '../test-utils/build-reply.ts';
import { buildFakeRunner, type RunnerCall } from '../test-utils/fake-runner.ts';

const NOW = new Date('2026-10-01T12:00:00Z');

/** The open issues that the fake `gh issue list` returns. */
const ISSUES = [
  {
    number: 10,
    title: 'Old agents ticket',
    body: 'Body',
    url: 'https://github.com/owner/repo/issues/10',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-02-01T00:00:00Z',
    labels: [{ name: 'scope:agents' }],
    comments: [
      {
        author: { login: 'owner' },
        body: renderMarker({ run: 'cal', decision: 'keep' }),
        createdAt: '2026-01-15T00:00:00Z',
      },
    ],
  },
  {
    number: 11,
    title: 'Blocked ticket',
    body: 'Body',
    url: 'https://github.com/owner/repo/issues/11',
    createdAt: '2026-01-02T00:00:00Z',
    updatedAt: '2026-02-01T00:00:00Z',
    labels: [{ name: 'blocked' }],
    comments: [],
  },
  {
    number: 12,
    title: 'Unscoped ticket',
    body: 'Body',
    url: 'https://github.com/owner/repo/issues/12',
    createdAt: '2026-01-03T00:00:00Z',
    updatedAt: '2026-02-01T00:00:00Z',
    labels: [],
    comments: [],
  },
];

describe(runCli, () => {
  let root: string;
  let context: CommandContext;
  let calls: RunnerCall[];
  let issues: typeof ISSUES;

  beforeEach(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'groom-cli-'));
    await mkdir(path.join(root, '.git'));
    issues = structuredClone(ISSUES);
    const runner = buildFakeRunner((call) => respond(call, root, issues));
    calls = runner.calls;
    context = { now: NOW, root, run: runner.run, stdin: '' };
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  describe('collect', () => {
    it('selects, groups, and writes one input file per ticket with its signals and prior marker', async () => {
      const result = await runCli(['collect', '--run', 'r', '--out', 'in', '--exclude-label', 'blocked'], context);

      expect(result).toMatchObject({
        ok: true,
        sha: 'abc1234',
        counts: { fetched: 3, selected: 2, resumed: 0, total: 2 },
      });
      expect(result.ok && result.groups).toMatchObject([
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
      expect(result.ok && result.tickets).toMatchObject([{ number: 11 }]);
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
      expect(result.ok && result.tickets).toMatchObject([{ number: 11 }, { number: 12 }]);
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

    it('reports a malformed selector as invalid-args', async () => {
      expect(await runCli(['collect', '--run', 'r', '--out', 'in', '--older-than', '3m'], context)).toMatchObject({
        ok: false,
        error: 'invalid-args',
      });
      expect(await runCli(['collect', '--out', 'in'], context)).toMatchObject({ ok: false, error: 'invalid-args' });
    });
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
      expect(result.ok && result.pages).toMatchObject([{ entries: [{ index: 1, number: 10 }] }]);
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

    it('renders a policy decision from the stored reply', async () => {
      const reply: AssessorReply = buildReply({ recommendation: 'close-complete' });
      const replyDir = path.join(root, 'local', 'ticket-triage', 'assessments', 'r');
      await mkdir(replyDir, { recursive: true });
      writeFileSync(
        path.join(replyDir, '10.json'),
        JSON.stringify({ ...reply, assessedAt: '2026-10-01T00:00:00Z', sha: 'abc1234' }),
      );

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

    it('refuses a decision outside the vocabulary', async () => {
      const result = await runCli(
        ['comment', '--run', 'r', '--number', '10', '--decision', 'shelve', '--decided-by', 'bulk', '--out', 'c.md'],
        context,
      );

      expect(result).toMatchObject({ ok: false, error: 'invalid-args' });
    });
  });

  it('reports an unknown command as invalid-args', async () => {
    expect(await runCli(['nonesuch'], context)).toMatchObject({ ok: false, error: 'invalid-args' });
    expect(calls).toStrictEqual([]);
  });
});

// region | Helpers

/** Builds an assessment record of ticket `number` in `run`. */
function assessment(run: string, number: number, assessedAt: string): Record<string, unknown> {
  return {
    run,
    kind: 'assessment',
    number,
    assessedAt,
    sha: 'abc1234',
    ticketUpdatedAt: '2026-01-01T00:00:00Z',
    verdicts: { drift: 'none', relevance: 'uncertain', progress: 'none', advisability: 'advisable', complexity: null },
    recommendation: 'escalate',
    confidence: 'medium',
    reason: 'Unclear',
    relatedTickets: [],
    inProgress: null,
  };
}

/** Reads the fixture's ledger as parsed lines; a ledger not yet written reads as empty. */
function readLedgerLines(root: string): unknown[] {
  const file = path.join(root, 'local', 'ticket-triage', 'ledger.jsonl');
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => line !== '')
    .map((line): unknown => JSON.parse(line));
}

/** Answers the fake runner's calls with a repository on `main`, `issues`, and one closing PR for #10. */
function respond(call: RunnerCall, root: string, issues: typeof ISSUES): string | undefined {
  const [first, second] = call.args;
  if (call.command === 'git') {
    if (first === 'rev-parse' && second === '--git-common-dir') return path.join(root, '.git');
    if (first === 'rev-parse' && second === '--short') return 'abc1234\n';
    if (first === 'rev-parse') return undefined;
    if (first === 'symbolic-ref') return 'refs/remotes/origin/main\n';
    if (first === 'for-each-ref')
      return 'refs/heads/main\t2026-09-01T00:00:00Z\nrefs/heads/10-uploader\t2026-09-02T00:00:00Z\n';
    if (first === 'worktree') return `worktree ${root}\nHEAD abc\nbranch refs/heads/main\n`;
    if (first === 'rev-list') return '3\n';
    if (first === 'log') return '';
    return undefined;
  }
  if (first === 'repo') return JSON.stringify({ nameWithOwner: 'owner/repo', defaultBranchRef: { name: 'main' } });
  if (first === 'issue') return JSON.stringify(issues);
  if (first === 'pr') {
    return JSON.stringify([
      {
        number: 50,
        title: 'Fix the uploader',
        body: '',
        mergedAt: '2026-03-01T00:00:00Z',
        closingIssuesReferences: [{ number: 10, repository: { name: 'repo', owner: { login: 'owner' } } }],
      },
    ]);
  }
  return undefined;
}

/** Writes `records` as the fixture's ledger. */
function writeLedger(root: string, records: ReadonlyArray<Record<string, unknown>>): void {
  const dir = path.join(root, 'local', 'ticket-triage');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'ledger.jsonl'), records.map((record) => `${JSON.stringify(record)}\n`).join(''));
}

// endregion | Helpers
