/**
 * The per-repository sweep record, `.agents/revise-prose.yaml`.
 *
 * The record answers two questions on a later run: which paths a unit has already been swept over at its current
 * version, and which candidates an adjudicator has already rejected. A version bump marks a unit's rejections stale
 * rather than deleting them, so a rule's revision re-opens its rejections for review instead of discarding the
 * judgment behind them.
 *
 * Only {@link composeRecord} and {@link stringifyRecord} produce a record. The helper's `record` command is the one
 * write path, which is what keeps the YAML deterministic rather than hand-edited into drift.
 */
import { createHash } from 'node:crypto';

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { z } from 'zod';

import { RULE_IDS } from './rules.ts';
import type { ProseRecord, RecordedRejection, RunFold } from './types.ts';

/** Path of the record within a repository. */
export const RECORD_PATH = '.agents/revise-prose.yaml';

/** An ISO date, which is the precision a sweep is dated to; a sweep is not an event with a time of day. */
const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be an ISO calendar date (YYYY-MM-DD)');

/** A unit's coverage: the version swept, when, and the path roots the sweep covered. */
const UnitCoverageSchema = z.object({
  version: z.string().min(1),
  'swept-at': DateSchema,
  roots: z.array(z.string().min(1)).min(1),
});

/** One rejection, keyed on its rule, its file, and the hash of its phrase. */
const RejectionSchema = z.object({
  rule: z.enum(RULE_IDS),
  unit: z.string().min(1),
  'unit-version': z.string().min(1),
  file: z.string().min(1),
  phrase: z.string().min(1),
  hash: z.string().regex(/^[0-9a-f]{16}$/, 'hash must be 16 lowercase hex characters'),
  ground: z.string().min(1),
});

/** The whole record. Both keys default to empty, so a record naming one of them parses. */
export const ProseRecordSchema = z.object({
  units: z.record(z.string(), UnitCoverageSchema).default({}),
  rejections: z.array(RejectionSchema).default([]),
});

/**
 * Merges a run's fold into the prior record and returns the result.
 *
 * A unit the run did not name keeps its coverage and its rejections untouched, so a narrowed run never retracts what a
 * wider one recorded. For a unit the run did name, coverage is replaced with what the run covered, and its rejections
 * are replaced by the run's own: an adjudicator who did not re-reject a site at this version has withdrawn it.
 * Rejections recorded at an older version survive both, which is what makes a version bump a review rather than a
 * deletion.
 */
export function composeRecord(prior: ProseRecord, fold: RunFold): ProseRecord {
  const units = { ...prior.units };
  for (const [unit, coverage] of Object.entries(fold.units)) {
    units[unit] = { version: coverage.version, 'swept-at': fold.sweptAt, roots: [...coverage.roots].toSorted() };
  }

  const swept = new Set(Object.keys(fold.units));
  const carried = prior.rejections.filter(
    (rejection) => !swept.has(rejection.unit) || rejection['unit-version'] !== units[rejection.unit]?.version,
  );

  return { units, rejections: sortRejections([...carried, ...fold.rejections]) };
}

/**
 * Hashes a phrase into a rejection's key. The phrase is normalized to NFC and its whitespace collapsed first, so a
 * repair that only reflows the line does not invalidate the rejection recorded against it.
 *
 * The hash is taken after the run's edits, not before: a phrase repaired under another rule in the same run is
 * recorded as it now reads, which is what a later run will find there.
 */
export function hashPhrase(phrase: string): string {
  const normalized = phrase.normalize('NFC').replaceAll(/\s+/g, ' ').trim();
  return createHash('sha256').update(normalized, 'utf8').digest('hex').slice(0, 16);
}

/** Reports whether a rejection was recorded at a version older than the one a run holds for its unit. */
export function isStaleRejection(rejection: RecordedRejection, unitVersions: ReadonlyMap<string, string>): boolean {
  const current = unitVersions.get(rejection.unit);
  return current !== undefined && current !== rejection['unit-version'];
}

/**
 * Parses a record's YAML. An absent record is the empty one, since a repository never swept has recorded nothing;
 * malformed YAML throws, because silently treating it as empty would erase every rejection on the next write.
 */
export function parseRecord(content: string, sourceLabel: string = RECORD_PATH): ProseRecord {
  const parsed: unknown = content.trim() === '' ? {} : parseYaml(content);
  const result = ProseRecordSchema.safeParse(parsed);

  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid sweep record in ${sourceLabel}: ${detail}`);
  }

  return result.data;
}

/**
 * Renders a record as YAML, with units keyed in sorted order and rejections sorted by rule, file, and hash. Re-writing
 * an unchanged record is byte-identical, which is what keeps the file out of a diff it did not earn.
 */
export function stringifyRecord(record: ProseRecord): string {
  const units = Object.fromEntries(
    Object.entries(record.units)
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(([unit, coverage]) => [
        unit,
        { version: coverage.version, 'swept-at': coverage['swept-at'], roots: coverage.roots },
      ]),
  );

  return stringifyYaml({ units, rejections: sortRejections(record.rejections) }, { lineWidth: 0 });
}

// region | Helpers

/** Orders rejections by rule, file, and hash, which is what makes a rewrite of unchanged content byte-identical. */
function sortRejections(rejections: readonly RecordedRejection[]): RecordedRejection[] {
  return [...rejections].toSorted(
    (a, b) => a.rule.localeCompare(b.rule) || a.file.localeCompare(b.file) || a.hash.localeCompare(b.hash),
  );
}

// endregion | Helpers
