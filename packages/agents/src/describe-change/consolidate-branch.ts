import type { TemplateNode } from '../change-grammar/compile-template.ts';
import { consolidate } from '../change-grammar/consolidate.ts';
import { parse } from '../change-grammar/parse.ts';
import type { ChangeRecord, Taxonomy } from '../change-grammar/types.ts';
import { validate } from '../change-grammar/validate.ts';
import type { RawCommit } from './read-commits.ts';

/**
 * Derives what a branch of commits adds up to: the entries it declares, the record they consolidate to, the subjects no
 * template matched, and the entries whose breaking marker disagrees with their type's policy.
 *
 * A commit carrying `Change:` trailers contributes those entries and not its subject. A condensed commit's subject is
 * the record its trailers already consolidate to, so reading both would count the branch against itself.
 *
 * A subject no template matches is reported rather than dropped, so a mistyped prefix is visible to its author instead
 * of silently shrinking the set the consolidated record is derived from. A violation likewise leaves its entry
 * untouched: the commit is already written, and refusing here would block the pull request behind a rebase.
 *
 * A branch with no entries yields no consolidated record. An empty record would be indistinguishable from a
 * consolidated record that names no scope.
 */
export function consolidateBranch(
  commits: readonly RawCommit[],
  nodes: readonly TemplateNode[],
  taxonomy: Taxonomy,
): BranchConsolidation {
  const entries: BranchEntry[] = [];
  const unmatched: UnmatchedSubject[] = [];
  const violations: EntryViolation[] = [];

  for (const commit of commits) {
    const subjects = commit.trailers.length > 0 ? commit.trailers : [commit.subject];
    for (const subject of subjects) {
      const record = parse(nodes, subject, taxonomy);
      if (record === undefined) {
        unmatched.push({ commit: commit.hash, subject });
        continue;
      }
      entries.push({ commit: commit.hash, record });
      const violation = validate(record, taxonomy);
      if (violation !== undefined) {
        violations.push({ commit: commit.hash, policy: violation.policy, type: violation.type });
      }
    }
  }

  const consolidatedRecord =
    entries.length > 0
      ? consolidate(
          entries.map((entry) => entry.record),
          taxonomy,
        )
      : undefined;
  return { entries, unmatched, violations, ...(consolidatedRecord !== undefined && { consolidatedRecord }) };
}

/** What a branch of commits adds up to. `consolidatedRecord` is absent where no entry was found to derive one from. */
export interface BranchConsolidation {
  consolidatedRecord?: ChangeRecord;
  entries: BranchEntry[];
  unmatched: UnmatchedSubject[];
  violations: EntryViolation[];
}

/** One parsed entry, and the commit that declared it. */
export interface BranchEntry {
  commit: string;
  record: ChangeRecord;
}

/** One entry whose breaking marker disagrees with its type's policy, and the commit that declared it. */
export interface EntryViolation {
  commit: string;
  policy: 'forbidden' | 'required';
  type: string;
}

/** One subject no template matched, and the commit it came from. */
export interface UnmatchedSubject {
  commit: string;
  subject: string;
}
