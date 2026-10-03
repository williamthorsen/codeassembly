import path from 'node:path';

import type { DeployedPathSet } from '../commands/sync/collect-deployed-paths.ts';
import type { DeploymentMeasurement } from './measure-deployment.ts';
import type { DeployedFile, ExpansionUnit, SizeAggregates, SizeSnapshot } from './types.ts';

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
  /**
   * Bytes of `delta` that the changed expansions in this document's closure account for. The whole `delta` stays on
   * the record and a reader derives the residual, which keeps the field honest about what was measured.
   */
  readonly explained: number;
}

/** What this deployment did to one expansion unit: how its own bytes moved, and across how many documents. */
export interface ExpansionChange {
  readonly kind: 'expansion';
  readonly key: string;
  /** The unit's own bytes after this deployment. */
  readonly bytes: number;
  /** Change in the unit's own bytes. */
  readonly delta: number;
  /**
   * Resized documents whose delta this unit's own delta accounts for, across which `delta` applies once each. It is
   * the unit's deployed reach less the documents that the collapse never reduces: one whose bytes did not move, and
   * one that this deployment added or removed.
   */
  readonly explainedDocumentCount: number;
}

/** One entry of the change list: a document's own change, or the fan-out of one expansion unit. */
export type SizeChange = DocumentChange | ExpansionChange;

/** One unit whose own bytes this deployment moved: the bytes that it now holds, and by how much they moved. */
interface ChangedUnit {
  readonly bytes: number;
  readonly delta: number;
}

/** What the collapse produced: the surviving document changes, and what each unit explained across them. */
interface DocumentCollapse {
  readonly changes: ReadonlyArray<DocumentChange>;
  /** Resized documents whose delta each unit's own delta accounts for, keyed as the unit is. */
  readonly explainedDocumentCounts: ReadonlyMap<string, number>;
}

/** One document that has just reached the growth ceiling, and whether the reader can edit the source behind it. */
export interface GrowthWarning {
  readonly key: string;
  readonly bytes: number;
  readonly mayStreamline: boolean;
}

/** What a live sync reports about the deployment that it just measured. */
export interface SizeReport {
  readonly changes: ReadonlyArray<SizeChange>;
  readonly warnings: ReadonlyArray<GrowthWarning>;
  readonly aggregates: SizeAggregates;
  readonly documentCount: number;
  /** Whether the record held no previous snapshot, which leaves this deployment with nothing to compare against. */
  readonly isFirstRecorded: boolean;
}

/**
 * Builds what a live sync reports from the measurement, the previous snapshot, and the collected paths: every
 * document that this deployment added, removed, or resized, ordered by the bytes that each change accounts for, and a
 * warning for each document that has just reached the growth ceiling.
 *
 * Assets contribute no change, matching what the `sizes` command ranks: A helper bundle loads into no context, so
 * its growth says nothing about what a session costs.
 *
 * A changed expansion unit enters the list once and accounts for its own delta across the resized documents whose
 * delta it explains. A resized document's delta is reduced by what the changed units in its closure explain, and a
 * document explained in full contributes no entry, which is what keeps a one-byte partial edit from printing one line
 * per includer. A unit that explains no document's delta contributes no entry either: Extracting a partial from text
 * that already stood in its includers leaves every deployed document byte-identical, and a line claiming the
 * extracted bytes as growth would head a block that states what a deployment cost. A previous snapshot stating no
 * `expansions` suppresses the whole pass, leaving every document to report its own change.
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

  const changedUnits = listChangedUnits(measured.expansions, previous?.expansions);
  const collapsed = collapseDocuments({
    current,
    before,
    changedUnits,
    documentExpansions: measured.documentExpansions,
  });
  const changes: ReadonlyArray<SizeChange> = [
    ...collapsed.changes,
    ...listExpansionChanges(changedUnits, collapsed.explainedDocumentCounts),
  ];

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

/**
 * The bytes that one change accounts for: a unit's own delta across the documents whose delta it explains, or a
 * document's delta less what those units explain. A removal's figure is its previous bytes negated, which puts a
 * large removal where a large addition would be.
 *
 * The two sum to the deployment's whole document delta, since every byte that one kind accounts for is a byte that
 * the other does not.
 */
export function countAccountedBytes(change: SizeChange): number {
  return change.kind === 'expansion' ? change.delta * change.explainedDocumentCount : change.delta - change.explained;
}

// region | Helpers

/**
 * Reduces each resized document's delta by what the changed units in its closure explain, dropping a document that
 * they explain in full, and counts the documents that each unit explained. An added or removed document is passed
 * through: Its whole bytes are not a change for a unit to explain.
 */
function collapseDocuments(input: {
  current: ReadonlyMap<string, number>;
  before: ReadonlyMap<string, number>;
  changedUnits: ReadonlyMap<string, ChangedUnit>;
  documentExpansions: Readonly<Record<string, ReadonlyArray<string>>>;
}): DocumentCollapse {
  const { current, before, changedUnits, documentExpansions } = input;
  const changes: Array<DocumentChange> = [];
  const explainedDocumentCounts = new Map<string, number>();

  for (const [key, bytes] of current) {
    const previousBytes = before.get(key);
    if (previousBytes === undefined) {
      changes.push({ kind: 'added', key, bytes, delta: bytes, explained: 0 });
      continue;
    }
    if (previousBytes === bytes) {
      continue;
    }
    const unitKeys = documentExpansions[key] ?? [];
    let explained = 0;
    for (const unitKey of unitKeys) {
      const unit = changedUnits.get(unitKey);
      if (unit !== undefined) {
        explained += unit.delta;
        explainedDocumentCounts.set(unitKey, (explainedDocumentCounts.get(unitKey) ?? 0) + 1);
      }
    }
    const delta = bytes - previousBytes;
    if (delta !== explained) {
      changes.push({ kind: 'resized', key, bytes, delta, explained });
    }
  }
  for (const [key, previousBytes] of before) {
    if (!current.has(key)) {
      changes.push({ kind: 'removed', key, bytes: 0, delta: -previousBytes, explained: 0 });
    }
  }

  return { changes, explainedDocumentCounts };
}

/**
 * Orders two changes by the bytes that each accounts for, largest first, and by key where two are equal. A partial
 * therefore sorts by the deployment that its edit caused rather than by the edit's own size.
 */
function compareChanges(left: SizeChange, right: SizeChange): number {
  return (
    Math.abs(countAccountedBytes(right)) - Math.abs(countAccountedBytes(left)) || left.key.localeCompare(right.key)
  );
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

/**
 * The units whose own bytes this deployment changed, each with the bytes that it now holds, keyed as the snapshot
 * keys them. A unit that the previous snapshot did not hold counts its whole bytes as its delta, which the documents
 * that it grew then attribute; a unit that grew no document is dropped by the caller rather than here.
 *
 * A previous snapshot stating no `expansions` suppresses the pass: The block did not exist when that line was
 * written, so nothing can be attributed against it. A key that the previous snapshot held and this one does not is
 * skipped, because attributing a deleted unit needs each document's previous closure, which no snapshot records, and
 * crediting it against the current closures would count the same bytes twice.
 */
function listChangedUnits(
  expansions: Readonly<Record<string, ExpansionUnit>>,
  previous: Readonly<Record<string, ExpansionUnit>> | undefined,
): ReadonlyMap<string, ChangedUnit> {
  const changed = new Map<string, ChangedUnit>();
  if (previous === undefined) {
    return changed;
  }
  for (const [key, unit] of Object.entries(expansions)) {
    const delta = unit.bytes - (previous[key]?.bytes ?? 0);
    if (delta !== 0) {
      changed.set(key, { bytes: unit.bytes, delta });
    }
  }
  return changed;
}

/** The changed units that explained at least one document's delta, one entry each. */
function listExpansionChanges(
  changedUnits: ReadonlyMap<string, ChangedUnit>,
  explainedDocumentCounts: ReadonlyMap<string, number>,
): ReadonlyArray<ExpansionChange> {
  const changes: Array<ExpansionChange> = [];
  for (const [key, unit] of changedUnits) {
    const explainedDocumentCount = explainedDocumentCounts.get(key) ?? 0;
    if (explainedDocumentCount > 0) {
      changes.push({ kind: 'expansion', key, bytes: unit.bytes, delta: unit.delta, explainedDocumentCount });
    }
  }
  return changes;
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
