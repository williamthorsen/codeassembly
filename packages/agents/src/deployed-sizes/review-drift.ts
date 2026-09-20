import path from 'node:path';

import type { DeployedPath } from '../commands/sync/collect-deployed-paths.ts';
import type { DeployedFile } from './types.ts';

/**
 * Most drift rows that a report lists. A document reviewed long ago drifts slowly, so the block answers which
 * documents drifted most rather than enumerating every one; the rest are counted instead of dropped.
 */
export const DRIFT_ROW_CAP = 20;

/** One review, with the file vector that stood when it ran. */
export interface ReviewBaseline {
  readonly recordedAt: string;
  /** Content-root-relative POSIX paths of the documents that the review read. */
  readonly reviewed: ReadonlyArray<string>;
  /** Files of the snapshot standing at or before the review, which the growth is measured against. */
  readonly files: Readonly<Record<string, DeployedFile>>;
}

/** What a report states about the documents that have grown since the review that last read each. */
export interface ReviewDrift {
  readonly rows: ReadonlyArray<ReviewDriftRow>;
  /** Grown documents past the cap, counted rather than listed. */
  readonly omittedCount: number;
}

/** One document that has grown since the review that last read it. */
export interface ReviewDriftRow {
  readonly key: string;
  /** Bytes that the document deploys now. */
  readonly bytes: number;
  /** Bytes by which it has grown since the review. */
  readonly growth: number;
  /** Instant of the review that the growth counts from. */
  readonly reviewedAt: string;
}

/**
 * Builds the rows stating how far each document has grown since the review that last read it, ranked by growth and
 * capped.
 *
 * The join runs through the current deployment's `authored` provenance, which names each document's authored file
 * and the content root against which its includes resolved. A marker names what it read by content-root-relative
 * path alone, so a document that this deployment does not carry `authored` for takes no row: an asset, a delivered
 * support entry, and a manifest-contributed file.
 *
 * Growth alone is reported. A document at or below the bytes it held at its review has not drifted, and a review
 * whose baseline snapshot did not hold the document has nothing to measure against.
 *
 * Pure, and takes no I/O: The caller resolved each review's baseline snapshot.
 */
export function buildReviewDrift(input: {
  current: ReadonlyMap<string, number>;
  files: ReadonlyArray<DeployedPath>;
  reviews: ReadonlyArray<ReviewBaseline>;
}): ReviewDrift {
  const { current, files, reviews } = input;
  const keysByAuthored = mapAuthoredPathsToKeys(files);

  // Per document, the newest review naming it wins, since an older one states a baseline that a later review reset.
  const newestReview = new Map<string, ReviewBaseline>();
  for (const review of reviews) {
    for (const reviewed of review.reviewed) {
      const keys = keysByAuthored.get(reviewed) ?? [];
      for (const key of keys) {
        const held = newestReview.get(key);
        if (held === undefined || toInstant(held.recordedAt) <= toInstant(review.recordedAt)) {
          newestReview.set(key, review);
        }
      }
    }
  }

  const grown: Array<ReviewDriftRow> = [];
  for (const [key, review] of newestReview) {
    const bytes = current.get(key);
    const reviewBytes = review.files[key]?.bytes;
    if (bytes === undefined || reviewBytes === undefined || bytes <= reviewBytes) {
      continue;
    }
    grown.push({ key, bytes, growth: bytes - reviewBytes, reviewedAt: review.recordedAt });
  }

  const ranked = grown.toSorted((left, right) => right.growth - left.growth || left.key.localeCompare(right.key));
  return { rows: ranked.slice(0, DRIFT_ROW_CAP), omittedCount: Math.max(0, ranked.length - DRIFT_ROW_CAP) };
}

// region | Helpers

/**
 * Maps each authored document's content-root-relative POSIX path to the deployed keys that render from it. One
 * authored body deploys once per targeted harness, so a path reaches several keys.
 */
function mapAuthoredPathsToKeys(files: ReadonlyArray<DeployedPath>): ReadonlyMap<string, ReadonlyArray<string>> {
  const keys = new Map<string, Array<string>>();
  for (const file of files) {
    if (file.authored === undefined) {
      continue;
    }
    const relative = toPosixPath(path.relative(file.authored.contentRoot, file.authored.file));
    const held = keys.get(relative);
    if (held === undefined) {
      keys.set(relative, [file.key]);
    } else {
      held.push(file.key);
    }
  }
  return keys;
}

/** The instant that a review's timestamp names, and zero for one that does not parse. */
function toInstant(recordedAt: string): number {
  const parsed = Date.parse(recordedAt);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** Renders a path with POSIX separators, which is how a marker names what it read. */
function toPosixPath(relative: string): string {
  return relative.split(path.sep).join('/');
}

// endregion | Helpers
