/**
 * The per-repository sweep record, `.agents/revise-prose.yaml`.
 *
 * The record answers two questions on a later run: which paths a unit has already been swept over at its current
 * version, and which sites an adjudicator has already rejected. A rejected site need not be one a detector reports,
 * so the second answer reaches a rule whose sites no candidate nominates. A version bump marks a unit's rejections stale
 * rather than deleting them, so a rule's revision re-opens its rejections for review instead of discarding the
 * judgment behind them.
 *
 * A rejection resolves to a site by containment rather than by an exact string: see {@link applyRejections}. The record
 * and the detector describe one site in spans of different lengths, so a phrase is what a reader locates the site by
 * and never a key that either side must reproduce character for character.
 *
 * Only {@link composeRecord} and {@link stringifyRecord} produce a record. The helper's `record` command is the one
 * write path, which is what keeps the YAML deterministic rather than hand-edited into drift.
 */
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { z } from 'zod';

import { maskCodeSpans } from './mask-code-spans.ts';
import { flattenWhitespace } from './span-text.ts';
import type { Candidate, PriorRejection, ProseRecord, RecordedRejection, RunFold } from './types.ts';

/** Path of the record within a repository. */
export const RECORD_PATH = '.agents/revise-prose.yaml';

/**
 * A rule name. Any rule a bound rulebook declares is recordable, detected or not, so the shape is all that is held
 * here: pinning the detector registry's names would make a unit's coverage of the record depend on holding a detector.
 */
const RuleNameSchema = z.string().regex(/^[a-z][a-z0-9-]*$/, 'rule must be a lowercase kebab-case name');

/** An ISO date, which is the precision a sweep is dated to; a sweep is not an event with a time of day. */
const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be an ISO calendar date (YYYY-MM-DD)');

/** A unit's coverage: the version swept, when it was last swept, and the path roots covered at that version. */
const UnitCoverageSchema = z.object({
  version: z.string().min(1),
  'swept-at': DateSchema,
  roots: z.array(z.string().min(1)).min(1),
});

/** One rejection, resolved to a site by its rule, its file, and its phrase. */
const RejectionSchema = z.object({
  rule: RuleNameSchema,
  unit: z.string().min(1),
  'unit-version': z.string().min(1),
  file: z.string().min(1),
  phrase: z.string().min(1),
  ground: z.string().min(1),
});

/** The whole record. Both keys default to empty, so a record naming one of them parses. */
export const ProseRecordSchema = z.object({
  units: z.record(z.string(), UnitCoverageSchema).default({}),
  rejections: z.array(RejectionSchema).default([]),
});

/** One rejection as a run reports it: no version, which the helper derives from the unit covered by the fold. */
const FoldRejectionSchema = z.object({
  rule: RuleNameSchema,
  unit: z.string().min(1),
  file: z.string().min(1),
  phrase: z.string().min(1),
  ground: z.string().min(1),
});

/** What one run reports back for recording. */
export const RunFoldSchema = z.object({
  sweptAt: DateSchema,
  units: z.record(z.string(), z.object({ version: z.string().min(1), roots: z.array(z.string().min(1)).min(1) })),
  rejections: z.array(FoldRejectionSchema).default([]),
});

/**
 * Applies the record's rejections to a candidate set: a candidate matching a rejection at its unit's current version
 * is dropped, and one matching a rejection recorded at an older version is kept and marked stale, which re-opens the
 * judgment for review rather than discarding it.
 *
 * A candidate can match both, a version bump carrying the earlier rejection forward beside the one that the run
 * re-recorded under a phrase of its own. The live rejection decides, so whether the site is suppressed follows from
 * the record's content rather than from its order.
 */
export function applyRejections(
  candidates: readonly Candidate[],
  record: ProseRecord,
  unitVersions: ReadonlyMap<string, string>,
): Candidate[] {
  const bySite = new Map<string, RecordedRejection[]>();
  for (const rejection of record.rejections) {
    const site = composeKey(rejection.rule, rejection.file);
    const held = bySite.get(site);
    if (held === undefined) bySite.set(site, [rejection]);
    else held.push(rejection);
  }

  const applied: Candidate[] = [];

  for (const candidate of candidates) {
    const matched = (bySite.get(composeKey(candidate.rule, candidate.file)) ?? []).filter((rejection) =>
      coversPhrase(rejection.phrase, candidate.phrase),
    );
    if (matched.length === 0) {
      applied.push(candidate);
      continue;
    }
    if (matched.every((rejection) => isStaleRejection(rejection, unitVersions))) {
      applied.push({ ...candidate, stale: true });
    }
  }

  return applied;
}

/**
 * Merges a run's fold into the prior record and returns the result.
 *
 * A unit that the run did not name keeps its coverage and its rejections untouched, so a narrowed run never retracts what a
 * wider one recorded. For a unit that the run did name at the version already recorded, the run's roots join the recorded
 * ones, both sweeps having happened; a version bump replaces them, the earlier sweep having been taken against a rule
 * that has since changed.
 *
 * That unit's rejections under the roots swept by the run are replaced by the run's own: an adjudicator who did not
 * re-reject a site at this version has withdrawn it. A rejection outside those roots was never revisited, so it is
 * carried forward, which is what keeps a run narrowed to one directory from retracting the judgment recorded
 * everywhere else. Rejections recorded at an older version survive both, which is what makes a version bump a review
 * rather than a deletion.
 */
export function composeRecord(prior: ProseRecord, fold: RunFold): ProseRecord {
  const units = { ...prior.units };
  for (const [unit, coverage] of Object.entries(fold.units)) {
    const priorCoverage = prior.units[unit];
    const keptRoots =
      priorCoverage !== undefined && priorCoverage.version === coverage.version ? priorCoverage.roots : [];
    units[unit] = { version: coverage.version, 'swept-at': fold.sweptAt, roots: mergeRoots(keptRoots, coverage.roots) };
  }

  const recorded: RecordedRejection[] = fold.rejections.map((rejection) => {
    const version = fold.units[rejection.unit]?.version;
    if (version === undefined) {
      throw new Error(`rejection names unit "${rejection.unit}", which the fold does not cover`);
    }
    return { ...rejection, 'unit-version': version };
  });

  // A key the run re-recorded supersedes whatever the record held for it. Without this, a version bump followed by a
  // re-rejection leaves the record holding two entries for one site, the withdrawn version alongside the standing one.
  const rerecorded = new Set(recorded.map((rejection) => rejectionKey(rejection)));
  const carried = prior.rejections.filter((rejection) => {
    if (rerecorded.has(rejectionKey(rejection))) return false;

    const coverage = fold.units[rejection.unit];
    if (coverage === undefined || rejection['unit-version'] !== coverage.version) return true;

    return coverage.roots.every((root) => !isUnderRoot(rejection.file, root));
  });

  return { units, rejections: sortRejections([...carried, ...recorded]) };
}

/**
 * Reports whether every named unit covers `file` at the version the run holds for it. A unit whose recorded version
 * differs covers nothing, its sweep having been taken against a rule that has since changed.
 */
export function isCoveredAt(record: ProseRecord, unitVersions: ReadonlyMap<string, string>, file: string): boolean {
  if (unitVersions.size === 0) return false;

  for (const [unit, version] of unitVersions) {
    const coverage = record.units[unit];
    if (coverage === undefined || coverage.version !== version) return false;
    if (coverage.roots.every((root) => !isUnderRoot(file, root))) return false;
  }

  return true;
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
 * Parses a run's fold from the JSON the `record` command reads on standard input. A malformed fold throws rather than
 * writing a partial record, the record being the only durable trace of what a sweep adjudicated.
 */
export function parseRunFold(json: string): RunFold {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error(`Invalid run fold: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }

  const result = RunFoldSchema.safeParse(parsed);
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid run fold: ${detail}`);
  }

  return result.data;
}

/**
 * Selects the rejections a run inherits: those recorded against a file it read, under a unit the run names, at a
 * version of that unit that still stands. A stale one is withheld, so its site reaches the sweeper with no prior
 * verdict attached and is adjudicated afresh, which is what makes a version bump a review rather than a deletion.
 *
 * A rejection whose unit the run does not name is withheld on the same ground: no version stands to hold it against,
 * so nothing could ever re-open it.
 *
 * The projection drops the record's own bookkeeping. A settled site needs no argument, and the ground behind it would
 * seed the judgment of a sweeper who meets the site again once the rejection goes stale.
 */
export function selectPriorRejections(
  record: ProseRecord,
  unitVersions: ReadonlyMap<string, string>,
  files: readonly string[],
): PriorRejection[] {
  const read = new Set(files);

  return record.rejections
    .filter(
      (rejection) =>
        read.has(rejection.file) && unitVersions.has(rejection.unit) && !isStaleRejection(rejection, unitVersions),
    )
    .map(({ rule, file, phrase }) => ({ rule, file, phrase }));
}

/**
 * Renders a record as YAML, with units keyed in sorted order and rejections sorted by rule, file, and phrase.
 * Re-writing an unchanged record is byte-identical, which is what keeps the file out of a diff it did not earn.
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

/** Joins the parts of a key on a delimiter that no rule, path, or phrase can contain. */
function composeKey(...parts: readonly string[]): string {
  return parts.join('\u{0}');
}

/**
 * Reports whether a recorded phrase and a candidate's phrase name one site: either normalized form containing the
 * other.
 *
 * The two come from different producers. The record holds the span reported by an adjudicator, readable enough to
 * locate the site by eye; the candidate holds the span emitted by its detector, which is shorter and carries a
 * placeholder where an inline code span stood. Normalizing both through the detector's own pipeline puts them in one
 * form, and containment then resolves the length difference that remains. It runs both ways because an em-dash
 * candidate's phrase is its whole sentence, which a recorded phrase sits inside rather than around.
 */
function coversPhrase(recorded: string, detected: string): boolean {
  const left = normalizeForMatch(recorded);
  const right = normalizeForMatch(detected);
  return left.includes(right) || right.includes(left);
}

/** Reports whether a repository-relative path lies under a recorded root, `.` covering the whole repository. */
function isUnderRoot(file: string, root: string): boolean {
  return root === '.' || file === root || file.startsWith(`${root}/`);
}

/**
 * Joins two root sets into the smallest set covering both, dropping a root that another one already contains, and
 * returns it sorted. Without the containment drop, every narrowed sweep would append a root that `.` already covers.
 */
function mergeRoots(recorded: readonly string[], swept: readonly string[]): string[] {
  const roots = [...new Set([...recorded, ...swept])];
  return roots.filter((root) => roots.every((other) => other === root || !isUnderRoot(root, other))).toSorted();
}

/**
 * Renders a phrase in the form in which the two sides are compared: inline code spans masked, NFC, and whitespace
 * collapsed. This is the pipeline through which a detector's phrase already passed, applied to a recorded phrase too,
 * so a reflow or a backticked token cannot separate one from the other.
 */
function normalizeForMatch(phrase: string): string {
  return flattenWhitespace(maskCodeSpans(phrase.normalize('NFC')));
}

/** One rejection's identity within the record: its rule, its file, and its phrase. */
function rejectionKey(rejection: RecordedRejection): string {
  return composeKey(rejection.rule, rejection.file, rejection.phrase);
}

/** Orders rejections by rule, file, and phrase, which is what makes a rewrite of unchanged content byte-identical. */
function sortRejections(rejections: readonly RecordedRejection[]): RecordedRejection[] {
  return [...rejections].toSorted(
    (a, b) => a.rule.localeCompare(b.rule) || a.file.localeCompare(b.file) || a.phrase.localeCompare(b.phrase),
  );
}

// endregion | Helpers
