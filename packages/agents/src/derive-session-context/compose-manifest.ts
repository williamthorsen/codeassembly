/**
 * Pure function composing the branch-manifest JSON from preferences, branch name, working
 * directory, and timestamp. No I/O.
 */
import path from 'node:path';

import { extractTicketId } from './extract-ticket-id.ts';
import type { BranchManifest, ResolvedPreferences } from './types.ts';

/** Default values when not set in preferences. */
const DEFAULT_PLATFORM = 'github';
const DEFAULT_BASE_DIR = '~/ai-artifacts';
const DEFAULT_REMOTE_NAME = 'origin';
const DEFAULT_REMOTE_BRANCH = 'main';
const DEFAULT_ARTIFACT_PATHS: Readonly<Record<string, string>> = Object.freeze({
  chats: 'chats',
  devlogs: 'devlogs',
  plans: 'plans',
});

/**
 * Composes the full manifest object. `cwd` is the working directory (used for `~` expansion,
 * relative-path resolution, and the project-slug fallback). `home` is used for `~` expansion when
 * supplied; it defaults to `os.homedir()` via the caller. `now` is the moment to stamp into
 * `created_at`.
 */
export function composeManifest(input: {
  preferences: ResolvedPreferences;
  branchName: string;
  cwd: string;
  home: string;
  now: Date;
}): BranchManifest {
  const { preferences, branchName, cwd, home, now } = input;

  const ticketRefPrefix = preferences.project?.ticket_ref_prefix;
  const ticketResult =
    ticketRefPrefix === undefined ? extractTicketId({ branchName }) : extractTicketId({ branchName, ticketRefPrefix });

  const projectSlug = preferences.project?.slug ?? preferences.repository?.slug ?? path.basename(cwd);

  const platform = preferences.platform ?? DEFAULT_PLATFORM;

  const remoteName = preferences.repository?.default_remote?.name ?? DEFAULT_REMOTE_NAME;
  const remoteBranch = preferences.repository?.default_remote?.default_branch ?? DEFAULT_REMOTE_BRANCH;
  const defaultBranch = `${remoteName}/${remoteBranch}`;

  const rawBaseDir = preferences.artifacts?.base_dir ?? DEFAULT_BASE_DIR;
  const artifactBaseDir = resolveBaseDir(rawBaseDir, cwd, home);

  const artifactPaths: Record<string, string> = { ...DEFAULT_ARTIFACT_PATHS };
  const configuredPaths = preferences.artifacts?.paths;
  if (configuredPaths !== undefined) {
    for (const [key, value] of Object.entries(configuredPaths)) {
      artifactPaths[key] = value;
    }
  }

  return {
    ticket_id: ticketResult.ticket_id,
    ticket_ref: ticketResult.ticket_ref,
    project_slug: projectSlug,
    platform,
    default_branch: defaultBranch,
    branch_name: branchName,
    artifact_base_dir: artifactBaseDir,
    artifact_paths: artifactPaths,
    created_at: formatIsoUtc(now),
    ticket_url: null,
    pr_url: null,
  };
}

// region | Helpers

/**
 * Resolves `~`/`~/...` against `home` and resolves relative paths against `cwd`. Absolute paths
 * are returned unchanged.
 */
function resolveBaseDir(rawBaseDir: string, cwd: string, home: string): string {
  let expanded = rawBaseDir;
  if (rawBaseDir === '~') {
    expanded = home;
  } else if (rawBaseDir.startsWith('~/')) {
    expanded = path.join(home, rawBaseDir.slice(2));
  }
  if (path.isAbsolute(expanded)) {
    return expanded;
  }
  return path.resolve(cwd, expanded);
}

/** Formats a `Date` as an ISO 8601 UTC string trimmed to second precision (e.g., `2026-05-26T02:07:41Z`). */
function formatIsoUtc(date: Date): string {
  // `toISOString()` returns `YYYY-MM-DDTHH:mm:ss.sssZ`. Strip the fractional milliseconds.
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

// endregion | Helpers
