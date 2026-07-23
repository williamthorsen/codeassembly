import path from 'node:path';

import { sanitizeBranch } from '../shared/branch-helpers.ts';

/** The events root, relative to the home directory the helper writes under. */
const EVENTS_ROOT = ['.codeassembly', 'events'];

/**
 * Path segments substituted for an unresolvable field. An event with no resolvable repo, branch, or session is still
 * appended — under these segments — rather than dropped, so a session on a detached HEAD or outside a git repository
 * still produces a readable log.
 */
export const PLACEHOLDERS = {
  repo: '_no-repo',
  branch: '_no-branch',
  session: '_no-session',
} as const;

/**
 * Resolves the JSONL file an event appends to:
 * `{home}/.codeassembly/events/{owner}/{name}/{sanitized-branch}/{session}.jsonl`.
 *
 * The branch goes through the branch-manifest sanitizer, so an event and its branch's artifacts agree on the branch's
 * on-disk spelling. Every segment is then reduced to a single safe path component, which is what keeps a value from
 * redirecting the write outside the events root — the session in particular reaches this function straight from a
 * `--session` flag a relaying harness supplied.
 */
export function resolveEventPath(input: { home: string; repo?: string; branch?: string; session?: string }): string {
  const [owner, name] = splitRepo(input.repo);
  const branch =
    input.branch === undefined ? PLACEHOLDERS.branch : toSafeSegment(sanitizeBranch(input.branch), PLACEHOLDERS.branch);
  const session =
    input.session === undefined ? PLACEHOLDERS.session : toSafeSegment(input.session, PLACEHOLDERS.session);

  return path.join(input.home, ...EVENTS_ROOT, owner, name, branch, `${session}.jsonl`);
}

// region | Helpers

/** Splits an `owner/name` repo into its two path segments, falling back to the placeholder for either half. */
function splitRepo(repo: string | undefined): [owner: string, name: string] {
  const [owner, name] = (repo ?? '').split('/', 2);
  return [toSafeSegment(owner ?? '', PLACEHOLDERS.repo), toSafeSegment(name ?? '', PLACEHOLDERS.repo)];
}

/**
 * Reduces `value` to one path component: separators flatten to hyphens, and a value that names no directory — empty, or
 * dots only, which would traverse upward — falls back to `placeholder`.
 */
function toSafeSegment(value: string, placeholder: string): string {
  const flattened = value.trim().replaceAll(/[/\\]/g, '-');
  return flattened === '' || /^\.+$/.test(flattened) ? placeholder : flattened;
}

// endregion | Helpers
