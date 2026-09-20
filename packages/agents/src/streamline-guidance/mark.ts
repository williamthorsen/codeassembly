/**
 * The review marker that one streamlining run appends to the deployed-size records.
 *
 * The marker names each reviewed document by its content-root-relative POSIX path, which is the join that a size
 * report runs against the current deployment's authored provenance. It carries no source name, because a source's
 * name comes from the consumer's declaration rather than from the content root.
 */
import path from 'node:path';

import { z } from 'zod';

import { appendReviewMarker } from '../deployed-sizes/append-snapshot.ts';
import { resolveRecordPath } from '../deployed-sizes/resolve-record-path.ts';
import { REVIEW_MARKER_SCHEMA_VERSION } from '../deployed-sizes/schema.ts';
import type { ReviewMarker } from '../deployed-sizes/types.ts';
import { resolveRepo } from '../shared/resolve-repo.ts';
import { findContentRoot, listContentRoots } from './resolve.ts';
import type { MarkInput, MarkSuccess } from './types.ts';

/**
 * Appends one run's review marker to the repository's record and to the home record, and reports what it named.
 *
 * Both records receive the same marker. A marker names what it reviewed, so one landing in a record whose snapshots
 * hold none of those documents matches nothing, which is what makes writing to both safe.
 */
export async function markReviewed(input: { home: string; root: string; mark: MarkInput }): Promise<MarkSuccess> {
  const contentRoots = listContentRoots(input.root);
  const named: string[] = [];
  const unrooted: string[] = [];
  for (const file of input.mark.files) {
    const relative = relativizeToContentRoot(path.resolve(input.root, file), contentRoots);
    if (relative === undefined) {
      unrooted.push(file);
    } else if (!named.includes(relative)) {
      named.push(relative);
    }
  }
  const reviewed = named.toSorted((left, right) => left.localeCompare(right));

  const marker: ReviewMarker = {
    schemaVersion: REVIEW_MARKER_SCHEMA_VERSION,
    kind: 'review',
    recordedAt: input.mark.reviewedAt,
    reviewed,
  };
  const records = [
    resolveRecordPath({ home: input.home, domain: 'repo', repo: await resolveRepo(input.root) }),
    resolveRecordPath({ home: input.home, domain: 'home' }),
  ];
  for (const record of records) {
    await appendReviewMarker(record, marker);
  }

  return { ok: true, recordedAt: marker.recordedAt, reviewed, records, unrooted };
}

/** Parses the run's marker from the JSON that the `mark` command reads on standard input. */
export function parseMarkInput(json: string): MarkInput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error(`Invalid mark input: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
  const result = MarkInputSchema.safeParse(parsed);
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.map(String).join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid mark input: ${detail}`);
  }
  return result.data;
}

// region | Helpers

const MarkInputSchema = z.object({
  reviewedAt: z.iso.datetime(),
  files: z.array(z.string().min(1)),
});

/** The POSIX path of a file within its innermost content root, or undefined for one in no content root. */
function relativizeToContentRoot(file: string, contentRoots: readonly string[]): string | undefined {
  const contentRoot = findContentRoot(file, contentRoots);
  return contentRoot === undefined ? undefined : path.relative(contentRoot, file).split(path.sep).join('/');
}

// endregion | Helpers
