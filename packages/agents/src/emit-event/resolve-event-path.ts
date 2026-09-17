import path from 'node:path';

import { sanitizeBranch } from '../shared/branch-helpers.ts';

const EVENTS_ROOT = ['.codeassembly', 'events'];

/**
 * Path segments substituted for the context fields that do not resolve, so that an event is still written to a
 * readable log when its context is incomplete.
 */
export const PLACEHOLDERS = {
  repo: '_no-repo',
  branch: '_no-branch',
  session: '_no-session',
} as const;

/**
 * Resolves the JSONL file to which an event is appended:
 * `{home}/.codeassembly/events/{owner}/{name}/{sanitized-branch}/{session}.jsonl`.
 *
 * The branch is passed through the branch-manifest sanitizer, so an event and its branch's artifacts agree on the
 * branch's on-disk spelling. Every segment is then reduced to a single safe path component, which keeps a value from
 * redirecting the write outside the events root. The session in particular is passed to this function directly from a
 * `--session` flag supplied by a relaying harness.
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
 * Reduces `value` to one path component: Separators are flattened to hyphens, and a value that names no directory
 * (empty, or dots only, which would traverse upward) is replaced by `placeholder`.
 */
function toSafeSegment(value: string, placeholder: string): string {
  const flattened = value.trim().replaceAll(/[/\\]/g, '-');
  return flattened === '' || /^\.+$/.test(flattened) ? placeholder : flattened;
}

// endregion | Helpers
