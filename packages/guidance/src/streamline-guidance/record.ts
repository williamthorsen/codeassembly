/**
 * The per-repository record of declined cuts and reviews, `.agents/streamline-guidance.yaml`.
 *
 * A declined cut stays declined while its file still contains its phrase. A later run does not propose any cut that
 * removes or rewords a live declined phrase, which lets a run at a small level move on to the next candidates.
 *
 * A review states the date of the run that last read a file and the bytes that the file deployed once that run's cuts
 * were applied, which is the baseline against which a later run reports the file's growth.
 *
 * Only {@link composeRecord} and {@link stringifyRecord} produce a record, and the helper's `record` command is its one
 * write path.
 */
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { z } from 'zod';

import { normalizePhrase } from './normalize-phrase.ts';
import type { DeclinedCut, DeclinedPhrase, GuidanceRecord, RecordFold, ReviewEntry } from './types.ts';

/** Path of the record within a repository. */
export const RECORD_PATH = '.agents/streamline-guidance.yaml';

const CutClassSchema = z.enum(['aggressive', 'conservative', 'moderate']);

const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be an ISO calendar date (YYYY-MM-DD)');

const DeclinedPhraseSchema = z.object({
  file: z.string().min(1),
  phrase: z.string().min(1),
  class: CutClassSchema,
});

const RecordFoldSchema = z.object({
  date: DateSchema,
  declined: z.array(DeclinedPhraseSchema),
  reviewed: z.array(z.string().min(1)),
});

const GuidanceRecordSchema = z.object({
  declined: z.array(DeclinedPhraseSchema.extend({ 'declined-at': DateSchema })).default([]),
  reviewed: z
    .array(
      z.object({
        file: z.string().min(1),
        'reviewed-at': DateSchema,
        'deployed-bytes': z.number().int().nonnegative().optional(),
      }),
    )
    .default([]),
});

/**
 * Merges one run's declined cuts and reviews into the record and drops every entry that is no longer live: a declined
 * cut whose file no longer contains its phrase, and a review of a file that no longer exists. A cut declined again
 * replaces the entry that it repeats, and a file reviewed again replaces its earlier review. `readFile` returns a
 * repository-relative file's content, or undefined when the file no longer exists; `deployedBytes` holds the measured
 * bytes of the run's reviewed files.
 */
export function composeRecord(
  prior: GuidanceRecord,
  fold: RecordFold,
  readFile: (file: string) => string | undefined,
  deployedBytes: ReadonlyMap<string, number>,
): GuidanceRecord {
  const declined = new Map<string, DeclinedCut>();
  for (const entry of prior.declined) {
    declined.set(composeDeclineKey(entry), entry);
  }
  for (const entry of fold.declined) {
    declined.set(composeDeclineKey(entry), { ...entry, 'declined-at': fold.date });
  }

  const reviewed = new Map<string, ReviewEntry>(prior.reviewed.map((entry) => [entry.file, entry]));
  for (const file of fold.reviewed) {
    const bytes = deployedBytes.get(file);
    reviewed.set(file, { file, 'reviewed-at': fold.date, ...(bytes !== undefined && { 'deployed-bytes': bytes }) });
  }

  return {
    declined: declined
      .values()
      .filter((entry) => isLive(entry, readFile(entry.file)))
      .toArray(),
    reviewed: reviewed
      .values()
      .filter((entry) => readFile(entry.file) !== undefined)
      .toArray(),
  };
}

/** Reports whether a declined cut still applies: Its file exists and contains its phrase. */
export function isLive(entry: DeclinedPhrase, content: string | undefined): boolean {
  return content !== undefined && normalizePhrase(content).includes(normalizePhrase(entry.phrase));
}

/** Parses a run's fold from the JSON that the `record` command reads on standard input. */
export function parseFold(json: string): RecordFold {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error(`Invalid fold: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
  const result = RecordFoldSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Invalid fold: ${describeIssues(result.error.issues)}`);
  }
  return result.data;
}

/**
 * Parses the record's YAML. Empty content is the empty record; malformed content throws, because treating it as empty
 * would erase every declined cut on the next write.
 */
export function parseRecord(content: string): GuidanceRecord {
  const parsed: unknown = content.trim() === '' ? {} : parseYaml(content);
  const result = GuidanceRecordSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Invalid record in ${RECORD_PATH}: ${describeIssues(result.error.issues)}`);
  }
  return result.data;
}

/**
 * Renders the record as YAML, each section sorted by file and declined cuts then by phrase, so that rewriting unchanged
 * content is byte-identical.
 */
export function stringifyRecord(record: GuidanceRecord): string {
  const declined = record.declined
    .toSorted((a, b) => a.file.localeCompare(b.file) || a.phrase.localeCompare(b.phrase))
    .map((entry) => ({
      file: entry.file,
      phrase: entry.phrase,
      class: entry.class,
      'declined-at': entry['declined-at'],
    }));
  const reviewed = record.reviewed
    .toSorted((a, b) => a.file.localeCompare(b.file))
    .map((entry) => ({
      file: entry.file,
      'reviewed-at': entry['reviewed-at'],
      ...(entry['deployed-bytes'] !== undefined && { 'deployed-bytes': entry['deployed-bytes'] }),
    }));
  return stringifyYaml({ declined, reviewed }, { lineWidth: 0 });
}

// region | Helpers

/** Identifies a declined cut by its file and normalized phrase, the identity under which a re-decline replaces it. */
function composeDeclineKey(entry: DeclinedPhrase): string {
  return `${entry.file}\u{0}${normalizePhrase(entry.phrase)}`;
}

/** Renders Zod issues as one line, each prefixed by the path to the offending value. */
function describeIssues(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>): string {
  return issues.map((issue) => `${issue.path.map(String).join('.') || '(root)'}: ${issue.message}`).join('; ');
}

// endregion | Helpers
