import path from 'node:path';

import type { DeployedPathSet } from '../commands/sync/collect-deployed-paths.ts';
import type { DeploymentMeasurement } from './measure-deployment.ts';
import type { DeployedFile, SizeAggregates, SizeSnapshot } from './types.ts';

/** Size at or above which a document that has just grown past it draws a warning. */
export const GROWTH_CEILING_BYTES = 5 * 1_024;

/** Directory name whose presence in a source's path marks it as an installed dependency rather than the reader's own. */
const VENDOR_DIR = 'node_modules';

/** What this deployment did to one document, and by how many bytes. */
export interface DocumentChange {
  readonly kind: 'added' | 'removed' | 'resized';
  readonly key: string;
  /** Bytes after this deployment; zero for a removed document. */
  readonly bytes: number;
  readonly delta: number;
}

/** One document that has just reached the growth ceiling, and whether the reader can edit the source behind it. */
export interface GrowthWarning {
  readonly key: string;
  readonly bytes: number;
  readonly mayStreamline: boolean;
}

/** What a live sync reports about the deployment that it just measured. */
export interface SizeReport {
  readonly changes: ReadonlyArray<DocumentChange>;
  readonly warnings: ReadonlyArray<GrowthWarning>;
  readonly aggregates: SizeAggregates;
  readonly documentCount: number;
  /** Whether the record held no previous snapshot, which leaves this deployment with nothing to compare against. */
  readonly isFirstRecorded: boolean;
}

/**
 * Builds what a live sync reports from the measurement, the previous snapshot, and the collected paths: every
 * document that this deployment added, removed, or resized, ordered by the size of the change, and a warning for
 * each document that has just reached the growth ceiling.
 *
 * Assets contribute no change, matching what the `sizes` command ranks: A helper bundle loads into no context, so
 * its growth says nothing about what a session costs.
 *
 * A warning fires on a crossing rather than on a standing comparison, so that a document keeps warning no more than
 * once per record. A first recorded deployment has no crossing to observe, and warns not at all rather than warning
 * on every document that is already large.
 *
 * Pure, and takes no I/O: `repoRoot` and each file's `sourceRoot` are canonical paths that the caller resolved, so
 * containment here is lexical.
 */
export function buildSizeReport(input: {
  measured: DeploymentMeasurement;
  previous: SizeSnapshot | undefined;
  set: DeployedPathSet;
  repoRoot: string | undefined;
}): SizeReport {
  const { measured, previous, set, repoRoot } = input;
  const current = selectDocuments(measured.files);
  const before = selectDocuments(previous?.files ?? {});
  const isFirstRecorded = previous === undefined;

  const changes: Array<DocumentChange> = [];
  for (const [key, bytes] of current) {
    const previousBytes = before.get(key);
    if (previousBytes === undefined) {
      changes.push({ kind: 'added', key, bytes, delta: bytes });
      continue;
    }
    if (previousBytes !== bytes) {
      changes.push({ kind: 'resized', key, bytes, delta: bytes - previousBytes });
    }
  }
  for (const [key, previousBytes] of before) {
    if (!current.has(key)) {
      changes.push({ kind: 'removed', key, bytes: 0, delta: -previousBytes });
    }
  }

  const sourceRoots = new Map(set.files.map((file) => [file.key, file.sourceRoot]));
  const warnings: Array<GrowthWarning> = [];
  if (!isFirstRecorded) {
    for (const [key, bytes] of current) {
      const previousBytes = before.get(key);
      if (bytes < GROWTH_CEILING_BYTES || (previousBytes !== undefined && previousBytes >= GROWTH_CEILING_BYTES)) {
        continue;
      }
      warnings.push({ key, bytes, mayStreamline: isReaderOwned(sourceRoots.get(key), repoRoot) });
    }
  }

  return {
    changes: changes.toSorted(compareChanges),
    warnings: warnings.toSorted((left, right) => right.bytes - left.bytes || left.key.localeCompare(right.key)),
    aggregates: measured.aggregates,
    documentCount: current.size,
    isFirstRecorded,
  };
}

// region | Helpers

/**
 * Orders two changes by the size of the change, largest first, and by key where two are equal. A removal's delta is
 * its previous bytes negated, which puts a large removal where a large addition would be.
 */
function compareChanges(left: DocumentChange, right: DocumentChange): number {
  return Math.abs(right.delta) - Math.abs(left.delta) || left.key.localeCompare(right.key);
}

/**
 * Reports whether the reader of this repository can edit the source at `sourceRoot`: It sits inside the repository
 * and outside `node_modules`. The vendor exclusion is what keeps an installed dependency's artifact from being named
 * as the reader's to reduce, since it resolves under the repository root and is not theirs.
 */
function isReaderOwned(sourceRoot: string | undefined, repoRoot: string | undefined): boolean {
  if (sourceRoot === undefined || repoRoot === undefined) {
    return false;
  }
  const relative = path.relative(repoRoot, sourceRoot);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return false;
  }
  return !sourceRoot.split(path.sep).includes(VENDOR_DIR);
}

/** The documents of one file vector, keyed by deployed path, with the assets left out. */
function selectDocuments(files: Readonly<Record<string, DeployedFile>>): ReadonlyMap<string, number> {
  return new Map(
    Object.entries(files)
      .filter(([, file]) => file.kind === 'document')
      .map(([key, file]) => [key, file.bytes]),
  );
}

// endregion | Helpers
