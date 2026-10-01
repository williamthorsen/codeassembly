/**
 * Detects tickets that someone is working on, from local state alone: a worktree's branch manifest, a local branch
 * name, or a remote-tracking branch name, in that order of precedence. Nothing is fetched, so a remote branch is as
 * fresh as the last fetch.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { extractTicketId } from '../derive-session-context/extract-ticket-id.ts';
import { sanitizeBranch } from '../shared/branch-helpers.ts';
import type { CommandRunner, InProgress, InProgressSignal } from './types.ts';

const HEADS_PREFIX = 'refs/heads/';
const REMOTES_PREFIX = 'refs/remotes/';

/** A branch tip that names a ticket. */
interface Candidate {
  lastCommitAt: string;
  number: number;
  /** The full ref of the branch. */
  ref: string;
  /** The branch as the digest shows it. */
  shortRef: string;
  signal: InProgressSignal;
}

/** Returns the in-progress signal for each of `numbers` that has one. */
export async function detectInProgress(input: {
  defaultBranch: string;
  numbers: ReadonlySet<number>;
  root: string;
  run: CommandRunner;
}): Promise<Map<number, InProgress>> {
  const { defaultBranch, numbers, root, run } = input;
  const tips = parseRefs(
    await run(
      'git',
      ['for-each-ref', '--format=%(refname)%09%(committerdate:iso-strict)', HEADS_PREFIX, REMOTES_PREFIX],
      root,
    ),
  );
  /** Returns the full ref of the default branch against which a branch's commits ahead are counted. */
  function resolveBase(ref: string): string | undefined {
    const remote = ref.startsWith(REMOTES_PREFIX) ? ref.slice(REMOTES_PREFIX.length).split('/', 1)[0] : undefined;
    const candidates =
      remote === undefined
        ? [`${HEADS_PREFIX}${defaultBranch}`, `${REMOTES_PREFIX}origin/${defaultBranch}`]
        : [`${REMOTES_PREFIX}${remote}/${defaultBranch}`];
    return candidates.find((candidate) => tips.has(candidate));
  }

  const candidates = [
    ...readManifestCandidates(await run('git', ['worktree', 'list', '--porcelain'], root)),
    ...readBranchCandidates(tips, defaultBranch),
  ];

  const found = new Map<number, Candidate>();
  for (const candidate of candidates) {
    if (!numbers.has(candidate.number) || found.has(candidate.number)) continue;
    found.set(candidate.number, candidate);
  }

  const signals = new Map<number, InProgress>();
  for (const [number, candidate] of found) {
    const base = resolveBase(candidate.ref);
    const commitsAhead =
      base === undefined
        ? 0
        : Number((await run('git', ['rev-list', '--count', `${base}..${candidate.ref}`], root)).trim());
    signals.set(number, {
      commitsAhead,
      lastCommitAt: tips.get(candidate.ref) ?? candidate.lastCommitAt,
      ref: candidate.shortRef,
      signal: candidate.signal,
    });
  }
  return signals;
}

// region | Helpers

/** Returns the candidates of local branches, then of remote-tracking branches, whose names parse to a ticket. */
function readBranchCandidates(tips: ReadonlyMap<string, string>, defaultBranch: string): Candidate[] {
  const local: Candidate[] = [];
  const remote: Candidate[] = [];
  for (const [ref, lastCommitAt] of tips) {
    const isLocal = ref.startsWith(HEADS_PREFIX);
    const shortRef = ref.slice(isLocal ? HEADS_PREFIX.length : REMOTES_PREFIX.length);
    const branch = isLocal ? shortRef : shortRef.slice(shortRef.indexOf('/') + 1);
    if (branch === defaultBranch || branch === 'HEAD') continue;
    const number = parseTicketNumber(extractTicketId({ branchName: branch }).ticket_id);
    if (number === undefined) continue;
    (isLocal ? local : remote).push({
      lastCommitAt,
      number,
      ref,
      shortRef,
      signal: isLocal ? 'branch' : 'remote-branch',
    });
  }
  return [...local, ...remote];
}

/** Returns the manifest candidates of every worktree whose branch manifest names a numeric ticket. */
function readManifestCandidates(porcelain: string): Candidate[] {
  const result: Candidate[] = [];
  for (const block of porcelain.split('\n\n')) {
    const worktree = /^worktree (.+)$/m.exec(block)?.[1];
    const branchRef = /^branch (.+)$/m.exec(block)?.[1];
    if (worktree === undefined || branchRef?.startsWith(HEADS_PREFIX) !== true) continue;
    const branch = branchRef.slice(HEADS_PREFIX.length);
    const number = readManifestTicket(worktree, branch);
    if (number === undefined) continue;
    result.push({
      lastCommitAt: '',
      number,
      ref: branchRef,
      shortRef: branch,
      signal: 'manifest',
    });
  }
  return result;
}

/** Reads the ticket id from a worktree's branch manifest, or `undefined` when it has none or none is numeric. */
function readManifestTicket(worktree: string, branch: string): number | undefined {
  const manifestPath = path.join(worktree, '.agents', `${sanitizeBranch(branch)}.branch-manifest.json`);
  try {
    const manifest: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (typeof manifest !== 'object' || manifest === null || !('ticket_id' in manifest)) return undefined;
    return parseTicketNumber(typeof manifest.ticket_id === 'string' ? manifest.ticket_id : null);
  } catch {
    return undefined;
  }
}

/** Parses `for-each-ref` output into each ref's tip commit date, by full ref name. */
function parseRefs(output: string): Map<string, string> {
  const tips = new Map<string, string>();
  for (const line of output.split('\n')) {
    const [ref, date] = line.split('\t', 2);
    if (ref !== undefined && ref !== '' && date !== undefined) tips.set(ref, date);
  }
  return tips;
}

/** Returns a ticket id as a GitHub issue number, or `undefined` when it is not numeric. */
function parseTicketNumber(ticketId: string | null): number | undefined {
  return ticketId !== null && /^\d+$/.test(ticketId) ? Number(ticketId) : undefined;
}

// endregion | Helpers
