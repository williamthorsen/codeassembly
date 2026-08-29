import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { resolveEventsDir } from '@williamthorsen/kb/layout';
import { readNoteContent } from '@williamthorsen/kb/note-io';
import { parseEvent } from '@williamthorsen/kb/records';

import { extractString, readStringList } from '../kb-shared/note-helpers.ts';
import { isLedeQuality, type LedeQuality, meetsQualityFloor } from '../lede-corpus/lede-quality.ts';
import { extractApprovedLede, LEDE_DECISION_TAG } from '../lede-corpus/lede-sections.ts';
import { isMissingFile } from '../lib/type-guards.ts';
import type { WorkType } from '../lib/work-types.ts';
import type { ExemplarSelection, LedeExemplar, Widening } from './types.ts';

/** An exemplar paired with the taxonomy entry its recorded work type resolves to; `null` for an undeclared type. */
interface Candidate {
  exemplar: LedeExemplar;
  resolved: WorkType | null;
  /** The record's rating; `null` for a record carrying none, which fails every floor. */
  quality: LedeQuality | null;
}

/**
 * What reading one event file yielded: a candidate, the reason the record was unreadable, or nothing to report. A
 * candidate carries its own warnings, for a record selectable despite a field that could not be read as written.
 */
type RecordOutcome =
  | { kind: 'candidate'; candidate: Candidate; warnings: readonly string[] }
  | { kind: 'warning'; warning: string }
  | { kind: 'skip' };

/**
 * Selects author-approved ledes of a requested work type from a store's event records, widening to the type's
 * tier-mates and then to any type to make up a shortfall.
 *
 * The scan runs over `content/events/` in descending filename order. Filenames are ULID stems, so that order is
 * newest-first without reading a byte, and the scan stops as soon as the requested type has filled the count: only a
 * type too scarce to fill it pays for a full pass. The assembled result is then ordered by each record's own
 * `captured-at`, so a stem that is not a ULID cannot silently reorder what is emitted.
 *
 * Each of the three buckets is capped at `count`, and the fill takes the exact type first, so widening only ever makes
 * up a shortfall and never displaces an exact match with a newer tier-mate.
 *
 * A `minQuality` floor filters candidates before they reach a bucket, so a type left short by the floor widens exactly
 * as a scarce type does. Filtering the filled buckets instead would return fewer than `count` while qualifying
 * tier-mates went untaken.
 */
export async function selectExemplars(input: {
  storePath: string;
  workTypes: ReadonlyMap<string, WorkType>;
  requested: WorkType;
  count: number;
  minQuality?: LedeQuality;
}): Promise<ExemplarSelection> {
  const eventsDir = resolveEventsDir(input.storePath);
  const filenames = await readEventFilenames(eventsDir);

  const buckets: Record<Widening, LedeExemplar[]> = { none: [], tier: [], any: [] };
  const warnings: string[] = [];

  for (const filename of filenames) {
    // Only the exact-type bucket can satisfy the count on its own, so a full one ends the scan.
    if (buckets.none.length >= input.count) {
      break;
    }
    const outcome = await readDecision({ filePath: path.join(eventsDir, filename), workTypes: input.workTypes });
    if (outcome.kind === 'warning') {
      warnings.push(outcome.warning);
      continue;
    }
    if (outcome.kind === 'skip') {
      continue;
    }
    warnings.push(...outcome.warnings);
    if (!clearsFloor({ candidate: outcome.candidate, floor: input.minQuality })) {
      continue;
    }
    const bucket = buckets[classifyWidening({ candidate: outcome.candidate, requested: input.requested })];
    if (bucket.length < input.count) {
      bucket.push(outcome.candidate.exemplar);
    }
  }

  const exemplars = [...buckets.none];
  let widening: Widening = 'none';
  for (const width of ['tier', 'any'] as const) {
    if (exemplars.length >= input.count) {
      break;
    }
    const taken = buckets[width].slice(0, input.count - exemplars.length);
    if (taken.length > 0) {
      widening = width;
      exemplars.push(...taken);
    }
  }
  exemplars.sort((left, right) => compareDescending(left.capturedAt, right.capturedAt));

  return { exemplars, widening, warnings };
}

// region | Helpers

/** Reports which bucket a candidate belongs to: its own type, a tier-mate of it, or neither. */
function classifyWidening(input: { candidate: Candidate; requested: WorkType }): Widening {
  const { exemplar, resolved } = input.candidate;
  if (resolved?.key === input.requested.key) {
    return 'none';
  }
  return exemplar.tier === input.requested.tier ? 'tier' : 'any';
}

/**
 * Reports whether a candidate is admitted by a floor. A request naming no floor admits every candidate, rated or not;
 * a floor admits only a rating that meets it, so an unrated record is left out whenever one is named.
 */
function clearsFloor(input: { candidate: Candidate; floor: LedeQuality | undefined }): boolean {
  if (input.floor === undefined) {
    return true;
  }
  return (
    input.candidate.quality !== null && meetsQualityFloor({ quality: input.candidate.quality, floor: input.floor })
  );
}

/** Orders two strings greatest-first by code unit, which sorts ULID stems and ISO-8601 timestamps by recency. */
function compareDescending(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left > right ? -1 : 1;
}

/**
 * Reads one event file as an exemplar candidate. A record that parses and carries no `lede-decision` tag belongs to
 * another capture path and is passed over in silence. Everything else that cannot be read as an exemplar is reported
 * so the run goes on without it, unparseable frontmatter included: a record whose tags cannot be read might be a
 * decision.
 */
async function readDecision(input: {
  filePath: string;
  workTypes: ReadonlyMap<string, WorkType>;
}): Promise<RecordOutcome> {
  const basename = path.basename(input.filePath);
  const { fields, body, error } = readNoteContent(await readFile(input.filePath, 'utf8'));
  if (error !== undefined) {
    return {
      kind: 'warning',
      warning: `${basename}: frontmatter does not parse (${error}), so its tags cannot be read`,
    };
  }
  if (!readStringList(fields, 'tags').includes(LEDE_DECISION_TAG)) {
    return { kind: 'skip' };
  }

  const parsed = parseEvent(fields, body);
  if (!parsed.ok) {
    return { kind: 'warning', warning: `${basename}: does not parse as an event record (${parsed.errors.join('; ')})` };
  }

  const lede = extractApprovedLede(parsed.record.body);
  if (lede === null) {
    return { kind: 'warning', warning: `${basename}: carries neither a merged nor an agent lede` };
  }

  const { extra } = parsed.record;
  const type = extractString(extra, 'type');
  const scope = extractString(extra, 'scope');
  const pr = extractString(extra, 'pr');
  if (type === null || scope === null || pr === null) {
    return { kind: 'warning', warning: `${basename}: does not name the change it describes (type, scope, pr)` };
  }

  // The taxonomy decides a candidate's type and tier, so a request and a candidate are matched through one reading of
  // it. A type the taxonomy no longer declares keeps the tier its record carries, which is what the taxonomy said when
  // the change merged.
  const resolved = input.workTypes.get(type) ?? null;
  const tier = resolved?.tier ?? extractString(extra, 'tier');
  if (tier === null) {
    return { kind: 'warning', warning: `${basename}: names work type "${type}", which no taxonomy or record tiers` };
  }

  // A record carrying no rating is the ordinary case for one captured before ratings existed, so only a value outside
  // the scale is worth reporting. Either way the candidate stays selectable by a request that names no floor.
  const rawQuality = extractString(extra, 'quality');
  const quality = isLedeQuality(rawQuality) ? rawQuality : null;
  const warning =
    rawQuality !== null && quality === null
      ? [`${basename}: carries quality "${rawQuality}", which the scale does not declare`]
      : [];

  return {
    kind: 'candidate',
    candidate: {
      exemplar: { lede, type: resolved?.key ?? type, tier, scope, pr, capturedAt: parsed.record.capturedAt },
      resolved,
      quality,
    },
    warnings: warning,
  };
}

/** Lists a store's event filenames newest first; an absent events directory yields none. */
async function readEventFilenames(eventsDir: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(eventsDir);
  } catch (error) {
    if (isMissingFile(error)) {
      return [];
    }
    throw error;
  }
  return entries.filter((entry) => entry.endsWith('.md')).toSorted(compareDescending);
}

// endregion | Helpers
