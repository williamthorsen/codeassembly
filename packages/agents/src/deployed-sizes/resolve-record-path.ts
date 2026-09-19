import path from 'node:path';

import { splitRepo } from '../shared/repo-segments.ts';

const RECORD_ROOT = ['.codeassembly', 'deployed-sizes'];

/** Filename of the home domain's record, which belongs to no repo. */
const HOME_RECORD_FILENAME = '_home.jsonl';

/**
 * Resolves the JSONL file to which a domain's snapshots are appended:
 * `{home}/.codeassembly/deployed-sizes/{owner}/{name}.jsonl` for a repo, and `_home.jsonl` for the home domain.
 *
 * The record is stored under the home directory rather than inside the repo that it describes, which keeps it from
 * becoming a commit candidate in every consumer repo.
 */
export function resolveRecordPath(input: { home: string; repo?: string | undefined }): string {
  if (input.repo === undefined) {
    return path.join(input.home, ...RECORD_ROOT, HOME_RECORD_FILENAME);
  }
  const [owner, name] = splitRepo(input.repo);
  return path.join(input.home, ...RECORD_ROOT, owner, `${name}.jsonl`);
}
