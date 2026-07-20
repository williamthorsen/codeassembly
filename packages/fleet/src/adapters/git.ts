// The git adapter: read-only ground truth about each lane's worktree, polled on an interval and held as in-memory
// observations the snapshot layer merges at derivation time. Nothing here writes to disk or the network — git state is
// re-probeable, so persisting it would cache what a probe answers — and a failure inside one lane degrades that lane's
// observation to nulls rather than propagating.

import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { promisify } from 'node:util';

import { isMissingFileError } from '../common/fs-errors.ts';
import { retainKeys } from '../common/maps.ts';

/** Ceiling on any single git invocation, so a wedged repository cannot stall a poll pass indefinitely. */
const GIT_TIMEOUT_MS = 10_000;

const execFileAsync = promisify(execFile);

/** A running adapter; observations are keyed by lane key and refreshed each poll pass. */
export interface GitAdapter {
  getObservations(): ReadonlyMap<string, GitObservation>;
  stop(): void;
}

/**
 * What one poll of a worktree found. Git fields are `null` when the probe could not answer — a missing worktree, a
 * non-repository directory, or a failed command — matching the wire convention that absence is `null`.
 */
export interface GitObservation {
  worktreeExists: boolean;
  /** The checked-out branch; `null` when detached or unreadable. */
  branch: string | null;
  /** Count of working-tree changes (`status --porcelain` lines). */
  dirtyFiles: number | null;
  /** Commits on the lane branch that the base branch lacks. */
  ahead: number | null;
  /** Commits on the base branch that the lane branch lacks; > 0 is base-branch advance. */
  behind: number | null;
  /** The remote-tracking base ref compared against, e.g. `origin/main`. */
  baseBranch: string | null;
}

/** One worktree to poll: the lane it reports to and the directory to probe. */
export interface GitTarget {
  laneKey: string;
  cwd: string;
}

/**
 * Starts polling the targets every `pollMs`, with the first pass scheduled immediately on a microtask, so the call
 * returns before any callback can fire. A pass probes each current target in sequence, drops observations for targets
 * no longer listed, then invokes `onChange`; a tick that fires while a pass is still running is skipped, so passes
 * never overlap. `probe` is injectable for tests and defaults to {@link probeWorktree}.
 */
export function createGitAdapter(input: {
  listTargets: () => GitTarget[];
  onChange: () => void;
  pollMs: number;
  probe?: (cwd: string) => Promise<GitObservation>;
}): GitAdapter {
  const probe = input.probe ?? probeWorktree;
  const observations = new Map<string, GitObservation>();
  let passInFlight = false;
  let stopped = false;

  async function runPass(): Promise<void> {
    if (passInFlight) {
      return;
    }
    passInFlight = true;
    try {
      const targets = input.listTargets();
      retainKeys(observations, new Set(targets.map((target) => target.laneKey)));
      for (const target of targets) {
        const observation = await probe(target.cwd).catch(() => createUnprobedObservation(true));
        if (stopped) {
          return;
        }
        observations.set(target.laneKey, observation);
      }
      input.onChange();
    } finally {
      passInFlight = false;
    }
  }

  const timer = setInterval(() => {
    void runPass();
  }, input.pollMs);
  queueMicrotask(() => {
    void runPass();
  });

  return {
    getObservations: () => observations,
    stop(): void {
      stopped = true;
      clearInterval(timer);
    },
  };
}

/**
 * Probes one worktree with read-only git commands. A gone worktree short-circuits to `worktreeExists: false`; any
 * failing command leaves its fields `null` while the rest of the observation stands.
 */
export async function probeWorktree(cwd: string): Promise<GitObservation> {
  if (!(await directoryExists(cwd))) {
    return createUnprobedObservation(false);
  }
  const branch = await readBranch(cwd);
  const dirtyFiles = await countDirtyFiles(cwd);
  const baseBranch = await resolveBaseBranch(cwd);
  const counts = baseBranch === null ? null : await readAheadBehind(cwd, baseBranch);
  return {
    worktreeExists: true,
    branch,
    dirtyFiles,
    ahead: counts?.ahead ?? null,
    behind: counts?.behind ?? null,
    baseBranch,
  };
}

// region | Helpers

/** Counts the working-tree changes reported by `status --porcelain`, or `null` when the command fails. */
async function countDirtyFiles(cwd: string): Promise<number | null> {
  const output = await runGit(cwd, ['status', '--porcelain']);
  if (output === null) {
    return null;
  }
  return output === '' ? 0 : output.split('\n').filter((line) => line !== '').length;
}

/** An observation whose git fields are all unanswered. */
function createUnprobedObservation(worktreeExists: boolean): GitObservation {
  return { worktreeExists, branch: null, dirtyFiles: null, ahead: null, behind: null, baseBranch: null };
}

/**
 * True when `path` is a directory. Only a missing path counts as gone; an unreadable one is treated as present, so a
 * transient permission error degrades the lane's git data rather than closing the lane.
 */
async function directoryExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch (error) {
    return !isMissingFileError(error);
  }
}

/** Ahead/behind commit counts of `HEAD` against `baseBranch`, or `null` when unreadable. */
async function readAheadBehind(cwd: string, baseBranch: string): Promise<{ ahead: number; behind: number } | null> {
  const output = await runGit(cwd, ['rev-list', '--left-right', '--count', `HEAD...${baseBranch}`]);
  if (output === null) {
    return null;
  }
  const [aheadText, behindText] = output.split(/\s+/);
  if (aheadText === undefined || behindText === undefined) {
    return null;
  }
  const ahead = Number(aheadText);
  const behind = Number(behindText);
  return Number.isInteger(ahead) && Number.isInteger(behind) ? { ahead, behind } : null;
}

/** The checked-out branch name, or `null` when the head is detached or unreadable. */
async function readBranch(cwd: string): Promise<string | null> {
  const branch = await runGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  return branch === null || branch === '' || branch === 'HEAD' ? null : branch;
}

/**
 * The remote-tracking base ref to compare against: what `origin/HEAD` points at, else `origin/main` or
 * `origin/master` when one exists, else `null`.
 */
async function resolveBaseBranch(cwd: string): Promise<string | null> {
  const symbolic = await runGit(cwd, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']);
  if (symbolic !== null && symbolic !== '') {
    return symbolic;
  }
  for (const candidate of ['origin/main', 'origin/master']) {
    const resolved = await runGit(cwd, ['rev-parse', '--verify', '--quiet', `refs/remotes/${candidate}`]);
    if (resolved !== null && resolved !== '') {
      return candidate;
    }
  }
  return null;
}

/** Runs one read-only git command against `cwd`, returning trimmed stdout or `null` on any failure. */
async function runGit(cwd: string, args: readonly string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', cwd, ...args], { timeout: GIT_TIMEOUT_MS });
    return stdout.trim();
  } catch {
    return null;
  }
}

// endregion | Helpers
