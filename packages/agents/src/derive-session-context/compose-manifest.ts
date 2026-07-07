/**
 * Pure function composing the branch-manifest JSON from preferences, branch name, working
 * directory, and timestamp. No I/O.
 */
import path from 'node:path';

import { parseRemoteToOwnerRepo } from '../shared/parse-remote-url.ts';
import { extractPrNumber, extractTicketId, isPrIdentifier } from './extract-ticket-id.ts';
import type { BranchManifest, ResolvedPreferences } from './types.ts';

/** Default values when not set in preferences. */
const DEFAULT_SCM = 'github';
const DEFAULT_BASE_DIR = '~/ai-artifacts';
/** Default remote name, used when preferences don't configure one. */
export const DEFAULT_REMOTE_NAME = 'origin';
const DEFAULT_REMOTE_BRANCH = 'main';
const DEFAULT_ARTIFACT_PATHS: Readonly<Record<string, string>> = Object.freeze({
  chats: 'chats',
  devlogs: 'devlogs',
  plans: 'plans',
});

/**
 * Per-`scm` pull-request URL shape: the canonical Cloud host and the path segment. Mirrors the
 * shapes documented in `pr-resolution.md`; only `owner/repo` is taken from the git remote.
 */
const PR_URL_SHAPES: Readonly<Record<'github' | 'bitbucket', { host: string; prPath: string }>> = Object.freeze({
  github: { host: 'github.com', prPath: 'pull' },
  bitbucket: { host: 'bitbucket.org', prPath: 'pull-requests' },
});

/**
 * Composes the full manifest object. `cwd` is the working directory (used for `~` expansion,
 * relative-path resolution, and the project-slug fallback). `home` is used for `~` expansion when
 * supplied; it defaults to `os.homedir()` via the caller. `now` is the moment to stamp into
 * `created_at`. `remoteUrl` is the git remote's fetch URL (or `null`), used to seed `pr_url` for a
 * `PR-<n>` identity; absent or unresolvable leaves `pr_url` null.
 */
export function composeManifest(input: {
  preferences: ResolvedPreferences;
  branchName: string;
  cwd: string;
  home: string;
  now: Date;
  remoteUrl?: string | null;
}): BranchManifest {
  const { preferences, branchName, cwd, home, now, remoteUrl = null } = input;

  const ticketRefPrefix = preferences.project?.ticket_ref_prefix;
  const ticketResult =
    ticketRefPrefix === undefined ? extractTicketId({ branchName }) : extractTicketId({ branchName, ticketRefPrefix });

  const projectSlug = preferences.project?.slug ?? preferences.repository?.slug ?? path.basename(cwd);

  const scm = preferences.scm ?? DEFAULT_SCM;

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

  const { ticketBaseUrl, ticketUrl } = resolveTicketUrls(preferences, ticketResult.ticket_id);
  const prUrl = resolvePrUrl(scm, ticketResult.ticket_id, remoteUrl);

  return {
    ticket_id: ticketResult.ticket_id,
    ticket_ref: ticketResult.ticket_ref,
    project_slug: projectSlug,
    scm,
    default_branch: defaultBranch,
    branch_name: branchName,
    artifact_base_dir: artifactBaseDir,
    artifact_paths: artifactPaths,
    created_at: formatIsoUtc(now),
    ticket_url: ticketUrl,
    ticket_base_url: ticketBaseUrl,
    pr_url: prUrl,
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

/**
 * Resolves the ticket base URL from preferences and, when a ticket id is also known, the full
 * ticket URL built from base and id. Either is null when its inputs are absent, leaving `ticketUrl`
 * for a skill to resolve and store (e.g. GitHub, which fetches the URL via `gh`). A PR-sentinel id
 * (`PR-<n>`) is not a ticket, so no ticket URL is built for it. An explicitly stored URL overrides
 * the constructed default through `carryForwardStoredUrls`.
 */
function resolveTicketUrls(
  preferences: ResolvedPreferences,
  ticketId: string | null,
): { ticketBaseUrl: string | null; ticketUrl: string | null } {
  const ticketBaseUrl = preferences.ticket?.base_url ?? null;
  const ticketUrl =
    ticketBaseUrl !== null && ticketId !== null && !isPrIdentifier(ticketId)
      ? joinTicketUrl(ticketBaseUrl, ticketId)
      : null;
  return { ticketBaseUrl, ticketUrl };
}

/**
 * Joins a ticket base URL and a bare ticket id with exactly one `/` at the boundary, so a trailing
 * slash on the base is optional (`.../browse` and `.../browse/` both yield `.../browse/{id}`).
 */
function joinTicketUrl(baseUrl: string, ticketId: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${ticketId}`;
}

/**
 * Builds the pull-request URL for a `PR-<n>` sentinel id from the git remote's `owner/repo` and the
 * `scm`-selected URL shape. Returns null for a non-PR id, when no remote is known, or when the
 * remote cannot be parsed to `owner/repo`. The host and path segment come from `scm`; only the
 * `owner/repo` is taken from the remote. An explicitly stored `pr_url` overrides this seeded default.
 */
function resolvePrUrl(scm: 'github' | 'bitbucket', ticketId: string | null, remoteUrl: string | null): string | null {
  const prNumber = extractPrNumber(ticketId);
  if (prNumber === null || remoteUrl === null) {
    return null;
  }
  const ownerRepo = parseRemoteToOwnerRepo(remoteUrl);
  if (ownerRepo === null) {
    return null;
  }
  const { host, prPath } = PR_URL_SHAPES[scm];
  return `https://${host}/${ownerRepo}/${prPath}/${prNumber}`;
}

/** Formats a `Date` as an ISO 8601 UTC string trimmed to second precision (e.g., `2026-05-26T02:07:41Z`). */
function formatIsoUtc(date: Date): string {
  // `toISOString()` returns `YYYY-MM-DDTHH:mm:ss.sssZ`. Strip the fractional milliseconds.
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

// endregion | Helpers
