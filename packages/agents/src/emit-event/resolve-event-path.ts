import path from 'node:path';

import { sanitizeBranch } from '../shared/branch-helpers.ts';
import { REPO_SEGMENT_PLACEHOLDER, splitRepo, toSafeSegment } from '../shared/repo-segments.ts';

const EVENTS_ROOT = ['.codeassembly', 'events'];

/**
 * Path segments substituted for the context fields that do not resolve, so that an event is still written to a
 * readable log when its context is incomplete.
 */
export const PLACEHOLDERS = {
  repo: REPO_SEGMENT_PLACEHOLDER,
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
