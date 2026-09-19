import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { isRecord } from '../lib/type-guards.ts';
import type { DeploymentMeasurement } from './measure-deployment.ts';
import type { DeployedFile, SizeAggregates, SizeSnapshot } from './types.ts';

const execFileAsync = promisify(execFile);

/** Default branch assumed when the remote does not name one, which is what `origin/HEAD` records. */
const FALLBACK_DEFAULT_BRANCH = 'origin/main';

/** How long a git lookup may take before the gate answers without it. */
const GIT_LOOKUP_TIMEOUT_MS = 5_000;

/**
 * Decides whether a measured vector enters the record. Two conditions must hold: The vector differs from the previous
 * snapshot, and the tree whose content was deployed is on a commit that the remote-tracking default branch contains.
 *
 * The compared vector is the measurement entire, files and aggregates alike. An ambient region is a span inside a
 * guidance file that the deployment does not own outright, so it reaches `aggregates.alwaysLoaded` and no file row;
 * comparing the aggregates is what lets an edit confined to one be recorded. Any later measured quantity that no
 * single file backs is covered by the same comparison.
 *
 * The ancestry condition keeps a feature branch's deployment out of the record, so that the record tracks what the
 * default branch costs rather than what each branch under development costs. A source tree that is not a git tree
 * has no branch to be wrong about, and a published install is exactly that case, so an unanswerable ancestry test
 * lets the append through: Refusing there would stop the record entirely.
 */
export async function shouldAppend(input: {
  measured: DeploymentMeasurement;
  previous: SizeSnapshot | undefined;
  sourceRoot: string;
}): Promise<boolean> {
  if (input.previous !== undefined && isUnchanged(input.measured, input.previous)) {
    return false;
  }
  return isOnDefaultBranch(input.sourceRoot);
}

// region | Helpers

/**
 * Reports whether two aggregate blocks state the same totals. Compared as text with every key in a fixed order, so
 * that an aggregate or an always-loaded component added later is compared without an edit here: What the gate covers
 * then follows from the type rather than from a list kept in step with it. `haveSameFiles` takes the other route
 * because its keys are hundreds of deployed paths, which this one would sort on every comparison.
 */
function haveSameAggregates(aggregates: SizeAggregates, previous: SizeAggregates): boolean {
  return stringifyWithSortedKeys(aggregates) === stringifyWithSortedKeys(previous);
}

/**
 * Reports whether two file vectors state the same files, each at the same bytes and the same kind. Compared field by
 * field rather than by serializing, since key order is what a serialized comparison would turn on.
 */
function haveSameFiles(
  files: Readonly<Record<string, DeployedFile>>,
  previous: Readonly<Record<string, DeployedFile>>,
): boolean {
  const keys = Object.keys(files);
  if (keys.length !== Object.keys(previous).length) {
    return false;
  }
  return keys.every((key) => {
    const before = previous[key];
    const after = files[key];
    return before !== undefined && after !== undefined && before.bytes === after.bytes && before.kind === after.kind;
  });
}

/**
 * Reports whether the source tree's `HEAD` is an ancestor of the remote-tracking default branch, or whether the
 * question is unanswerable, which the gate treats the same way.
 */
async function isOnDefaultBranch(sourceRoot: string): Promise<boolean> {
  const defaultBranch = await resolveDefaultBranch(sourceRoot);
  if (defaultBranch === undefined) {
    return true;
  }
  try {
    await execFileAsync('git', ['-C', sourceRoot, 'merge-base', '--is-ancestor', 'HEAD', defaultBranch], {
      timeout: GIT_LOOKUP_TIMEOUT_MS,
    });
    return true;
  } catch {
    return false;
  }
}

/** Reports whether two measurements state the same thing: the same files at the same sizes, and the same aggregates. */
function isUnchanged(measured: DeploymentMeasurement, previous: SizeSnapshot): boolean {
  return haveSameFiles(measured.files, previous.files) && haveSameAggregates(measured.aggregates, previous.aggregates);
}

/**
 * Resolves the remote-tracking default branch, preferring what `origin/HEAD` records and falling back to
 * `origin/main`. Returns `undefined` when neither resolves, which is the answer for a source tree that is not a git
 * tree and for a clone whose remote names no default branch.
 */
async function resolveDefaultBranch(sourceRoot: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', sourceRoot, 'rev-parse', '--abbrev-ref', 'origin/HEAD'], {
      timeout: GIT_LOOKUP_TIMEOUT_MS,
    });
    const named = stdout.trim();
    if (named !== '') {
      return named;
    }
  } catch {
    // `origin/HEAD` is unset in many clones; the fallback below is probed before the gate gives up.
  }
  try {
    await execFileAsync('git', ['-C', sourceRoot, 'rev-parse', '--verify', FALLBACK_DEFAULT_BRANCH], {
      timeout: GIT_LOOKUP_TIMEOUT_MS,
    });
    return FALLBACK_DEFAULT_BRANCH;
  } catch {
    return undefined;
  }
}

/** Serializes a nested block of numbers with every object's keys in a fixed order, so that key order decides nothing. */
function stringifyWithSortedKeys(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    isRecord(item) ? Object.fromEntries(Object.entries(item).toSorted(([a], [b]) => a.localeCompare(b))) : item,
  );
}

// endregion | Helpers
