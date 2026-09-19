import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { DeployedDocument, SizeSnapshot } from './types.ts';

const execFileAsync = promisify(execFile);

/** Default branch assumed when the remote does not name one, which is what `origin/HEAD` records. */
const FALLBACK_DEFAULT_BRANCH = 'origin/main';

/** How long a git lookup may take before the gate answers without it. */
const GIT_LOOKUP_TIMEOUT_MS = 5_000;

/**
 * Decides whether a measured vector enters the record. Two conditions must hold: The vector differs from the previous
 * snapshot, and the source on which the deployment ran is an ancestor of the remote-tracking default branch.
 *
 * The ancestry condition keeps a feature branch's deployment out of the record, so that the record tracks what the
 * default branch costs rather than what each branch under development costs. A source tree that is not a git tree
 * has no branch to be wrong about, and an npm install is exactly that case, so an unanswerable ancestry test lets the
 * append through: Refusing there would stop the record entirely.
 */
export async function shouldAppend(input: {
  documents: Readonly<Record<string, DeployedDocument>>;
  previous: SizeSnapshot | undefined;
  packageRoot: string;
}): Promise<boolean> {
  if (input.previous !== undefined && isUnchanged(input.documents, input.previous.documents)) {
    return false;
  }
  return isOnDefaultBranch(input.packageRoot);
}

// region | Helpers

/**
 * Reports whether the source tree's `HEAD` is an ancestor of the remote-tracking default branch, or whether the
 * question is unanswerable, which the gate treats the same way.
 */
async function isOnDefaultBranch(packageRoot: string): Promise<boolean> {
  const defaultBranch = await resolveDefaultBranch(packageRoot);
  if (defaultBranch === undefined) {
    return true;
  }
  try {
    await execFileAsync('git', ['-C', packageRoot, 'merge-base', '--is-ancestor', 'HEAD', defaultBranch], {
      timeout: GIT_LOOKUP_TIMEOUT_MS,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Reports whether two size vectors state the same thing: the same files, each at the same bytes and the same kind.
 * Compared field by field rather than by serializing, since key order is what a serialized comparison would turn on.
 */
function isUnchanged(
  documents: Readonly<Record<string, DeployedDocument>>,
  previous: Readonly<Record<string, DeployedDocument>>,
): boolean {
  const keys = Object.keys(documents);
  if (keys.length !== Object.keys(previous).length) {
    return false;
  }
  return keys.every((key) => {
    const before = previous[key];
    const after = documents[key];
    return before !== undefined && after !== undefined && before.bytes === after.bytes && before.kind === after.kind;
  });
}

/**
 * Resolves the remote-tracking default branch, preferring what `origin/HEAD` records and falling back to
 * `origin/main`. Returns `undefined` when neither resolves, which is the answer for a source tree that is not a git
 * tree and for a clone whose remote names no default branch.
 */
async function resolveDefaultBranch(packageRoot: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', packageRoot, 'rev-parse', '--abbrev-ref', 'origin/HEAD'], {
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
    await execFileAsync('git', ['-C', packageRoot, 'rev-parse', '--verify', FALLBACK_DEFAULT_BRANCH], {
      timeout: GIT_LOOKUP_TIMEOUT_MS,
    });
    return FALLBACK_DEFAULT_BRANCH;
  } catch {
    return undefined;
  }
}

// endregion | Helpers
