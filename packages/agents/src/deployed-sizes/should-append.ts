import { type AgentsGit, realGit } from '../lib/git.ts';
import { isRecord } from '../lib/type-guards.ts';
import type { DeploymentMeasurement } from './measure-deployment.ts';
import type { DeployedFile, ExpansionUnit, SizeAggregates, SizeSnapshot } from './types.ts';

/** Default branch assumed when the remote does not name one, which is what `origin/HEAD` records. */
const FALLBACK_DEFAULT_BRANCH = 'origin/main';

/**
 * Decides whether a measured vector enters the record. Two conditions must hold: The vector differs from the previous
 * snapshot, and the tree whose content was deployed is on a commit that the remote-tracking default branch contains.
 *
 * The compared vector is the measurement entire: files, expansions, and aggregates alike. An ambient region is a span
 * inside a guidance file that the deployment does not own outright, so its bytes count toward
 * `aggregates.alwaysLoaded` and not toward any file row; comparing the aggregates lets an edit confined to one be
 * recorded. Any later measured quantity that is not backed by any single file is covered by the same comparison.
 * Comparing the expansions covers a rewiring that moves a partial's reach without moving anyone's bytes, and it makes
 * the first measurement after the block existed differ from a previous snapshot that states none.
 *
 * The ancestry condition keeps a feature branch's deployment out of the record, so that the record tracks the
 * default branch's sizes rather than those of each branch under development. A source tree that is not a git tree
 * does not have a branch to be wrong about, and a published install is exactly that case, so an unanswerable ancestry
 * test lets the append through: Refusing there would stop the record entirely.
 */
export async function shouldAppend(input: {
  measured: DeploymentMeasurement;
  previous: SizeSnapshot | undefined;
  sourceRoot: string;
  git?: AgentsGit;
}): Promise<boolean> {
  if (input.previous !== undefined && isUnchanged(input.measured, input.previous)) {
    return false;
  }
  return isOnDefaultBranch(input.sourceRoot, input.git ?? realGit);
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
 * Reports whether two expansion blocks state the same units, each at the same bytes and the same reach. A previous
 * snapshot stating none differs from any measurement, so that the first run after the block existed records it.
 */
function haveSameExpansions(
  expansions: Readonly<Record<string, ExpansionUnit>>,
  previous: Readonly<Record<string, ExpansionUnit>> | undefined,
): boolean {
  if (previous === undefined) {
    return false;
  }
  const keys = Object.keys(expansions);
  if (keys.length !== Object.keys(previous).length) {
    return false;
  }
  return keys.every((key) => {
    const before = previous[key];
    const after = expansions[key];
    return before !== undefined && after !== undefined && before.bytes === after.bytes && before.reach === after.reach;
  });
}

/**
 * Reports whether two file vectors state the same files, each at the same bytes and the same kind. Compared field by
 * field rather than by serializing, since a serialized comparison would depend on key order.
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
async function isOnDefaultBranch(sourceRoot: string, git: AgentsGit): Promise<boolean> {
  const defaultBranch = await resolveDefaultBranch(sourceRoot, git);
  if (defaultBranch === undefined) {
    return true;
  }
  return await git.isAncestor(sourceRoot, 'HEAD', defaultBranch);
}

/**
 * Reports whether two measurements state the same thing: the same files at the same sizes, the same expansions, and
 * the same aggregates.
 */
function isUnchanged(measured: DeploymentMeasurement, previous: SizeSnapshot): boolean {
  return (
    haveSameFiles(measured.files, previous.files) &&
    haveSameExpansions(measured.expansions, previous.expansions) &&
    haveSameAggregates(measured.aggregates, previous.aggregates)
  );
}

/**
 * Resolves the remote-tracking default branch, preferring what `origin/HEAD` records and falling back to
 * `origin/main`. Returns `undefined` when neither resolves, which is the answer for a source tree that is not a git
 * tree and for a clone whose remote does not name a default branch.
 */
async function resolveDefaultBranch(sourceRoot: string, git: AgentsGit): Promise<string | undefined> {
  // `origin/HEAD` is unset in many clones, so the fallback is probed before the gate gives up.
  const named = await git.readSymbolicRef(sourceRoot, 'origin/HEAD');
  if (named !== undefined) {
    return named;
  }
  return (await git.verifyRef(sourceRoot, FALLBACK_DEFAULT_BRANCH)) ? FALLBACK_DEFAULT_BRANCH : undefined;
}

/** Serializes a nested block of numbers with every object's keys in a fixed order, so that key order decides nothing. */
function stringifyWithSortedKeys(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    isRecord(item) ? Object.fromEntries(Object.entries(item).toSorted(([a], [b]) => a.localeCompare(b))) : item,
  );
}

// endregion | Helpers
