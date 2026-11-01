import { realpath } from 'node:fs/promises';
import path from 'node:path';

import type { CurateGit } from './git.ts';
import type { Pin, SkippedSource } from './types.ts';

/** Matches an `origin` URL on GitHub, in HTTPS or SSH form, capturing the owner and the repository name. */
const GITHUB_REMOTE =
  /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^/]+)\/([^/]+?)(?:\.git)?\/?$/;

/**
 * Pins the repository of each source directory at the commit of its default branch. Directories in one repository,
 * including those in different worktrees of it, share the pin of the first root that resolved to it; a directory that
 * cannot be pinned is reported in `skipped` rather than failing the rest.
 */
export async function pinSources(
  sources: readonly string[],
  git: CurateGit,
): Promise<{ pins: Pin[]; skipped: SkippedSource[] }> {
  const pins = new Map<string, Pin>();
  const rootRepos = new Map<string, string>();
  const failedRoots = new Map<string, string>();
  const skipped: SkippedSource[] = [];

  for (const source of sources) {
    const dir = await resolveDirectory(source);
    const root = dir === undefined ? undefined : git.findTopLevel(dir);
    if (root === undefined) {
      skipped.push({ source, reason: 'not in a git repository' });
      continue;
    }
    const knownRepo = rootRepos.get(root);
    const known = knownRepo === undefined ? undefined : pins.get(knownRepo);
    if (known !== undefined) {
      known.sources.push(source);
      continue;
    }
    const pinned = failedRoots.get(root) ?? pinRoot(root, git);
    if (typeof pinned === 'string') {
      failedRoots.set(root, pinned);
      skipped.push({ source, reason: pinned });
      continue;
    }
    rootRepos.set(root, pinned.repo);
    const sameRepo = pins.get(pinned.repo);
    if (sameRepo === undefined) {
      pins.set(pinned.repo, { ...pinned, sources: [source] });
    } else {
      sameRepo.sources.push(source);
    }
  }

  return { pins: pins.values().toArray(), skipped };
}

// region | Helpers

/** Pins one repository root, returning the reason as a string when it cannot. */
function pinRoot(root: string, git: CurateGit): Omit<Pin, 'sources'> | string {
  const url = git.readOriginUrl(root);
  if (url === undefined) return `${root} does not have an origin remote`;
  const match = GITHUB_REMOTE.exec(url);
  if (match === null) return `the origin of ${root} is not on GitHub (${url})`;
  const branch = git.findDefaultBranch(root);
  if (branch === undefined) return `the default branch of ${root} could not be resolved`;
  const sha = git.fetchBranchHead(root, branch);
  if (sha === undefined) return `origin/${branch} of ${root} could not be fetched`;
  return { repo: `${match[1]}/${match[2]}`, root, branch, sha };
}

/** Resolves symlinks in `source`, returning `undefined` when it does not exist. */
async function resolveDirectory(source: string): Promise<string | undefined> {
  try {
    return await realpath(path.resolve(source));
  } catch {
    return undefined;
  }
}

// endregion | Helpers
