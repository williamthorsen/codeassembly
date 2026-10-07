import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildFakeRunner, type RunnerCall } from '../../test-utils/fake-runner.ts';
import { type CommandContext, runCli } from '../cli.ts';

const NOW = new Date('2026-10-01T12:00:00Z');

const MILESTONES = [
  { number: 1, title: 'Sprint 1', due_on: '2026-09-20T00:00:00Z', state: 'open' },
  { number: 2, title: 'Sprint 2', due_on: '2026-10-20T00:00:00Z', state: 'open' },
];

/** The open issues that the fake `gh issue list` returns. */
const OPEN = [
  ghIssue({ number: 10, title: 'Oldest', milestone: 'Sprint 1', createdAt: '2026-01-01T00:00:00Z' }),
  ghIssue({ number: 11, title: 'High priority', milestone: 'Sprint 1', labels: ['priority:high'] }),
  ghIssue({ number: 12, title: 'Mine', milestone: 'Sprint 1', assignees: ['me'] }),
  ghIssue({ number: 13, title: 'On a branch', milestone: 'Sprint 1' }),
  ghIssue({ number: 14, title: 'Blocked', milestone: 'Sprint 1', blockedBy: [20] }),
  ghIssue({ number: 20, title: 'Later blocker', milestone: 'Sprint 2' }),
];

describe(runCli, () => {
  let root: string;
  let context: CommandContext;

  beforeEach(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'pull-cli-'));
    await mkdir(path.join(root, '.git'));
    const runner = buildFakeRunner((call) => respond(call, root));
    context = { now: NOW, root, run: runner.run };
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  describe('survey', () => {
    it('reports the picture, the ranked candidates with reasons, and the warnings, without writing', async () => {
      writeLedger(root, [policy('2026-09-24T00:00:00Z')]);

      const result = await runCli(['survey'], context);

      expect(result).toMatchObject({
        ok: true,
        user: 'me',
        assignOnPick: false,
        now: { source: 'due-date', milestone: { title: 'Sprint 1' } },
        counts: { open: 6, inNow: 5, candidates: 2 },
        blocked: [{ number: 14, blockedBy: [20] }],
        groomStale: { stale: false, daysSince: 7 },
      });
      expect(result.ok && result.candidates).toMatchObject([
        { number: 11, inNow: true, reasons: ['priority:high', expect.stringMatching(/^opened/)] },
        { number: 10, inNow: true },
        { number: 20, inNow: false },
      ]);
      expect(result.ok && result.inProgress).toMatchObject([
        { number: 12, assignees: ['me'], ref: null },
        { number: 13, ref: '13-branch', daysSinceLastCommit: 30 },
      ]);
      expect(result.ok && result.yours).toMatchObject([{ number: 12 }]);
      expect(result.ok && result.warnings).toStrictEqual([
        { days: 11, kind: 'milestone-past-due', title: 'Sprint 1' },
        { days: 30, kind: 'stale-branch', number: 13, ref: '13-branch' },
        { blockers: [20], kind: 'blocked-outside-now', number: 14 },
      ]);
      expect(readFileSync(ledgerFile(root), 'utf8').split('\n').filter(Boolean)).toHaveLength(1);
    });

    it('takes --now over ticket.pull.now, and the configured thresholds and limit', async () => {
      writePreferences(root, 'ticket:\n  pull:\n    now: Sprint 1\n    staleBranchDays: 31\n    assignOnPick: true\n');

      const configured = await runCli(['survey', '--limit', '1'], context);
      const flagged = await runCli(['survey', '--now', 'Sprint 2'], context);

      expect(configured).toMatchObject({ ok: true, assignOnPick: true, now: { source: 'config' } });
      expect(configured.ok && configured.candidates).toHaveLength(1);
      expect(configured.ok && configured.warnings).not.toContainEqual(
        expect.objectContaining({ kind: 'stale-branch' }),
      );
      expect(flagged).toMatchObject({ ok: true, now: { source: 'flag', milestone: { title: 'Sprint 2' } } });
      expect(flagged.ok && flagged.candidates).toMatchObject([
        { number: 20, inNow: true, reasons: ['unblocks #14', expect.any(String)] },
        { number: 11, inNow: false },
        { number: 10, inNow: false },
      ]);
    });

    it('does not count a pull record as a groom', async () => {
      writeLedger(root, [
        policy('2026-08-01T00:00:00Z'),
        { run: 'pull-2026-09-24', kind: 'pull', picked: [10], sha: 'abc', recordedAt: '2026-09-24T00:00:00Z' },
      ]);

      expect(await runCli(['survey'], context)).toMatchObject({
        groomStale: { stale: true, reasons: ['age'] },
      });
    });

    it('reports a never-groomed backlog when the ledger is empty', async () => {
      const result = await runCli(['survey'], context);

      expect(result).toMatchObject({
        ok: true,
        groomStale: { stale: true, reasons: ['never'] },
      });
      expect(result.ok && result.warnings).toContainEqual({ kind: 'groom-stale', reasons: ['never'] });
      expect(existsSync(ledgerFile(root))).toBe(false);
    });

    it('reports an invalid ticket.pull section as invalid-config', async () => {
      writePreferences(root, 'ticket:\n  pull:\n    staleGroomDays: soon\n    extra: 1\n');

      expect(await runCli(['survey'], context)).toMatchObject({
        ok: false,
        error: 'invalid-config',
        message: expect.stringContaining('ticket.pull.staleGroomDays'),
      });
    });

    it('refuses --ticket and a non-positive --limit', async () => {
      expect(await runCli(['survey', '--ticket', '1'], context)).toMatchObject({ ok: false, error: 'invalid-args' });
      expect(await runCli(['survey', '--limit', '0'], context)).toMatchObject({ ok: false, error: 'invalid-args' });
    });
  });

  describe('record', () => {
    it('appends one pull record naming the picked tickets and the commit', async () => {
      const result = await runCli(['record', '--ticket', '11', '--ticket', '12'], context);

      const record = {
        run: 'pull-2026-10-01',
        kind: 'pull',
        picked: [11, 12],
        sha: 'abc1234',
        recordedAt: '2026-10-01T12:00:00Z',
      };
      expect(result).toStrictEqual({ ok: true, record, ledger: ledgerFile(root) });
      expect(JSON.parse(readFileSync(ledgerFile(root), 'utf8'))).toStrictEqual(record);
    });

    it('requires --ticket and refuses the survey flags', async () => {
      expect(await runCli(['record'], context)).toMatchObject({ ok: false, error: 'invalid-args' });
      expect(await runCli(['record', '--ticket', '1', '--now', 'x'], context)).toMatchObject({
        ok: false,
        error: 'invalid-args',
      });
    });
  });

  it('refuses an unknown command', async () => {
    expect(await runCli(['pick'], context)).toMatchObject({ ok: false, error: 'invalid-args' });
  });
});

// region | Helpers

/** Builds an open issue as `gh issue list` returns it. */
function ghIssue(input: {
  assignees?: string[];
  blockedBy?: number[];
  createdAt?: string;
  labels?: string[];
  milestone?: string;
  number: number;
  title: string;
}): Record<string, unknown> {
  const milestone = MILESTONES.find((candidate) => candidate.title === input.milestone);
  return {
    number: input.number,
    title: input.title,
    body: 'Body',
    url: `https://github.com/owner/repo/issues/${input.number}`,
    state: 'OPEN',
    createdAt: input.createdAt ?? '2026-06-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    closedAt: null,
    labels: (input.labels ?? []).map((name) => ({ name })),
    comments: [],
    assignees: (input.assignees ?? []).map((login) => ({ login })),
    milestone: milestone === undefined ? null : { title: milestone.title, dueOn: milestone.due_on },
    parent: null,
    blockedBy: { nodes: (input.blockedBy ?? []).map((number) => ({ number })) },
    subIssuesSummary: { completed: 0, total: 0 },
  };
}

/** Returns the fixture's ledger path. */
function ledgerFile(root: string): string {
  return path.join(root, 'local', 'ticket-triage', 'ledger.jsonl');
}

/** Builds a groom `policy` record recorded at `recordedAt`. */
function policy(recordedAt: string): Record<string, unknown> {
  return { run: 'groom', kind: 'policy', decisions: {}, decidedBy: 'user', recordedAt };
}

/** Answers the fake runner's calls. */
function respond(call: RunnerCall, root: string): string | undefined {
  const [first, second] = call.args;
  if (call.command === 'git') {
    if (first === 'rev-parse' && second === '--git-common-dir') return path.join(root, '.git');
    if (first === 'rev-parse' && second === '--short') return 'abc1234\n';
    if (first === 'symbolic-ref') return 'refs/remotes/origin/main\n';
    if (first === 'for-each-ref') {
      return 'refs/heads/main\t2026-09-30T00:00:00Z\nrefs/heads/13-branch\t2026-09-01T00:00:00Z\n';
    }
    if (first === 'worktree') return `worktree ${root}\nHEAD abc\nbranch refs/heads/main\n`;
    if (first === 'rev-list') return '2\n';
    return undefined;
  }
  if (first === 'repo') return JSON.stringify({ nameWithOwner: 'owner/repo', defaultBranchRef: { name: 'main' } });
  if (first === 'api' && second === 'user') return 'me\n';
  if (first === 'api') return JSON.stringify([MILESTONES]);
  if (first === 'issue') return JSON.stringify(OPEN);
  return undefined;
}

/** Writes `records` as the fixture's ledger. */
function writeLedger(root: string, records: ReadonlyArray<Record<string, unknown>>): void {
  mkdirSync(path.dirname(ledgerFile(root)), { recursive: true });
  writeFileSync(ledgerFile(root), records.map((record) => `${JSON.stringify(record)}\n`).join(''));
}

/** Writes the fixture's project preferences file. */
function writePreferences(root: string, yaml: string): void {
  mkdirSync(path.join(root, '.agents'), { recursive: true });
  writeFileSync(path.join(root, '.agents', 'preferences.yaml'), yaml);
}

// endregion | Helpers
