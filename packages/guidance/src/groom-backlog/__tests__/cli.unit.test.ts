import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
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

/** The `gh` relation fields of an issue that does not have any relations. */
const NO_RELATIONS = {
  state: 'OPEN',
  closedAt: null,
  assignees: [],
  milestone: null,
  parent: null,
  blockedBy: { nodes: [], totalCount: 0 },
  subIssuesSummary: { completed: 0, percentCompleted: 0, total: 0 },
};

/** The open issues that the fake `gh issue list` returns. */
const ISSUES = [
  {
    number: 10,
    title: 'Old agents ticket',
    body: 'Body',
    url: 'https://github.com/owner/repo/issues/10',
    ...NO_RELATIONS,
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
    ...NO_RELATIONS,
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
    ...NO_RELATIONS,
    createdAt: '2026-01-03T00:00:00Z',
    updatedAt: '2026-02-01T00:00:00Z',
    labels: [],
    comments: [],
  },
];

/** The closed issues that the fake `gh issue list --state closed` and `gh issue view` return. */
const CLOSED_ISSUES = [19, 20, 21].map((number) => ({
  number,
  title: `Closed ticket ${number}`,
  body: 'Body',
  url: `https://github.com/owner/repo/issues/${number}`,
  ...NO_RELATIONS,
  state: 'CLOSED',
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: `2026-08-${number - 5}T00:00:00Z`,
  closedAt: `2026-08-${number - 5}T00:00:00Z`,
  labels: [],
  comments: [],
}));

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
      expect(input).not.toHaveProperty('ripple');
      expect(result).not.toHaveProperty('ripple');
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

    it('with --related-to, writes the related set in tier order, each file with its ripple evidence', async () => {
      setBody(issues, 12, 'Follows #20.');
      setBody(issues, 11, 'Edit `src/upload.ts`.');

      const result = await runCli(['collect', '--run', 'ripple-20', '--out', 'in', '--related-to', '20'], context);

      expect(result).toMatchObject({ ok: true, counts: { fetched: 3, selected: 2, resumed: 0, total: 2 } });
      expect(result.ok && result.groups).toMatchObject([{ scope: null, waves: [[12, 11]] }]);
      expect(result).toMatchObject({ ripple: { kind: 'ripple', number: 20, pr: 60, candidates: [12, 11] } });
      const input: unknown = JSON.parse(readFileSync(path.join(root, 'in', '11.json'), 'utf8'));
      expect(input).toMatchObject({
        number: 11,
        ripple: {
          closedNumber: 20,
          closedTitle: 'Closed ticket 20',
          pr: 60,
          mergeSha: '01234567',
          files: ['src/upload.ts'],
          filesTruncated: false,
          tiers: ['file-overlap'],
        },
      });
    });

    it('with --related-to, refuses a backlog selector and a ticket that is still open', async () => {
      const combined = await runCli(
        ['collect', '--run', 'r', '--out', 'in', '--related-to', '20', '--scope', 'agents'],
        context,
      );
      const open = await runCli(['collect', '--run', 'r', '--out', 'in', '--related-to', '10'], context);

      expect(combined).toMatchObject({ ok: false, error: 'invalid-args', message: expect.stringContaining('--scope') });
      expect(open).toMatchObject({ ok: false, error: 'invalid-args', message: expect.stringContaining('#10 is open') });
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

    it('appends ripple and pull records', async () => {
      const stdin = JSON.stringify([
        { kind: 'ripple', number: 20, pr: 60, candidates: [11, 12] },
        { kind: 'ripple', number: 21, pr: null, candidates: [] },
        { kind: 'pull', picked: [11], sha: 'abc1234' },
      ]);

      expect(await runCli(['record', '--run', 'ripple-20'], { ...context, stdin })).toMatchObject({ appended: 3 });
      expect(readLedgerLines(root)).toStrictEqual([
        {
          run: 'ripple-20',
          kind: 'ripple',
          number: 20,
          pr: 60,
          candidates: [11, 12],
          recordedAt: '2026-10-01T12:00:00Z',
        },
        { run: 'ripple-20', kind: 'ripple', number: 21, pr: null, candidates: [], recordedAt: '2026-10-01T12:00:00Z' },
        { run: 'ripple-20', kind: 'pull', picked: [11], sha: 'abc1234', recordedAt: '2026-10-01T12:00:00Z' },
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

  describe('related', () => {
    it('lists the related set with the counts by tier and writes nothing', async () => {
      setBody(issues, 12, 'Follows #20.');
      setBody(issues, 11, 'Edit src/upload.ts');

      const result = await runCli(['related', '--ticket', '20'], context);

      expect(result).toMatchObject({
        ok: true,
        ticket: 20,
        pr: 60,
        mergeSha: '01234567',
        counts: { mention: 1, blocked: 0, family: 0, 'file-overlap': 1, total: 2 },
        candidates: [
          { number: 12, tier: 'mention' },
          { number: 11, tier: 'file-overlap' },
        ],
      });
      expect(readdirSync(root)).toStrictEqual(['.git']);
    });

    it('refuses a ticket that is still open', async () => {
      expect(await runCli(['related', '--ticket', '10'], context)).toMatchObject({ ok: false, error: 'invalid-args' });
    });
  });

  describe('pending-ripples', () => {
    it('reports no-baseline when the ledger lacks a pull and a groom policy record', async () => {
      writeLedger(root, [policy('ripple-5', '2026-08-01T00:00:00Z')]);

      expect(await runCli(['pending-ripples'], context)).toMatchObject({ ok: false, error: 'no-baseline' });
    });

    it('lists the tickets closed since the latest groom policy record that lack a ripple record', async () => {
      writeLedger(root, [policy('r', '2026-08-15T00:00:00Z'), ripple(21)]);

      const result = await runCli(['pending-ripples'], context);

      // #19 closed before the baseline, and #21 has rippled.
      expect(result).toMatchObject({ ok: true, baseline: 'policy', since: '2026-08-15T00:00:00Z' });
      expect(result.ok && result.pending).toStrictEqual([
        { number: 20, title: 'Closed ticket 20', closedAt: '2026-08-15T00:00:00Z' },
      ]);
      expect(calls.some((call) => call.args.includes('closed:>=2026-08-15'))).toBe(true);
    });

    it('prefers the latest pull record, and --since over both', async () => {
      writeLedger(root, [
        policy('r', '2026-08-01T00:00:00Z'),
        { run: 'p', kind: 'pull', picked: [], sha: 'abc', recordedAt: '2026-08-16T00:00:00Z' },
      ]);

      expect(await runCli(['pending-ripples'], context)).toMatchObject({
        baseline: 'pull',
        pending: [{ number: 21 }],
      });
      expect(await runCli(['pending-ripples', '--since', '2026-08-01'], context)).toMatchObject({
        baseline: 'since',
        pending: [{ number: 19 }, { number: 20 }, { number: 21 }],
      });
    });

    it('with --ticket, lists that ticket when it is closed and lacks a ripple record', async () => {
      writeLedger(root, [ripple(21)]);

      expect(await runCli(['pending-ripples', '--ticket', '20'], context)).toMatchObject({ pending: [{ number: 20 }] });
      expect(await runCli(['pending-ripples', '--ticket', '21'], context)).toMatchObject({ pending: [] });
      expect(await runCli(['pending-ripples', '--ticket', '10'], context)).toMatchObject({ pending: [] });
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

/** Builds a groom `policy` record of `run`. */
function policy(run: string, recordedAt: string): Record<string, unknown> {
  return { run, kind: 'policy', decisions: {}, decidedBy: 'user', recordedAt };
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

/**
 * Answers the fake runner's calls with a repository on `main`, the open `issues`, the closed issues, a closing PR for
 * #10, and a closing PR for #20 that touches `src/upload.ts`.
 */
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
  return respondToGh(call, issues);
}

/** Answers the fake runner's `gh` calls for `respond`. */
function respondToGh(call: RunnerCall, issues: typeof ISSUES): string | undefined {
  const [first, second] = call.args;
  if (first === 'repo') return JSON.stringify({ nameWithOwner: 'owner/repo', defaultBranchRef: { name: 'main' } });
  if (first === 'issue' && second === 'view') {
    const issue = [...issues, ...CLOSED_ISSUES].find((candidate) => String(candidate.number) === call.args[2]);
    return issue === undefined ? undefined : JSON.stringify(issue);
  }
  if (first === 'issue') return JSON.stringify(call.args.includes('closed') ? CLOSED_ISSUES : issues);
  if (first === 'pr' && second === 'view') {
    return JSON.stringify({ files: [{ path: 'src/upload.ts' }], mergeCommit: { oid: '0123456789abcdef' } });
  }
  if (first === 'pr') {
    return JSON.stringify([
      {
        number: 60,
        title: 'Close the closed ticket',
        body: '',
        mergedAt: '2026-08-15T00:00:00Z',
        closingIssuesReferences: [{ number: 20, repository: { name: 'repo', owner: { login: 'owner' } } }],
      },
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

/** Builds the `ripple` record of closed ticket `number`. */
function ripple(number: number): Record<string, unknown> {
  return {
    run: `ripple-${number}`,
    kind: 'ripple',
    number,
    pr: null,
    candidates: [],
    recordedAt: '2026-09-01T00:00:00Z',
  };
}

/** Sets the body of open issue `number`. */
function setBody(issues: typeof ISSUES, number: number, body: string): void {
  const issue = issues.find((candidate) => candidate.number === number);
  if (issue === undefined) throw new Error(`fixture does not have #${number}`);
  issue.body = body;
}

/** Writes `records` as the fixture's ledger. */
function writeLedger(root: string, records: ReadonlyArray<Record<string, unknown>>): void {
  const dir = path.join(root, 'local', 'ticket-triage');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'ledger.jsonl'), records.map((record) => `${JSON.stringify(record)}\n`).join(''));
}

// endregion | Helpers
