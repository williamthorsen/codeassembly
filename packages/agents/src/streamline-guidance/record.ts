/**
 * The per-repository record of declined cuts, `.agents/streamline-guidance.yaml`.
 *
 * A declined cut stays declined while its file still contains its phrase. A later run proposes no cut that removes or
 * rewords a live declined phrase, which is what lets a run at a small level move on to the next candidates rather than
 * propose the same declined ones on every run.
 *
 * Only {@link composeRecord} and {@link stringifyRecord} produce a record, and the helper's `record` command is its one
 * write path.
 */
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { z } from 'zod';

import { normalizePhrase } from './normalize-phrase.ts';
import type { DeclinedCut, DeclinedPhrase, DeclineFold, DeclineRecord } from './types.ts';

/** Path of the record within a repository. */
export const RECORD_PATH = '.agents/streamline-guidance.yaml';

const CutClassSchema = z.enum(['aggressive', 'conservative', 'moderate']);

const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be an ISO calendar date (YYYY-MM-DD)');

const DeclinedPhraseSchema = z.object({
  file: z.string().min(1),
  phrase: z.string().min(1),
  class: CutClassSchema,
});

const DeclineFoldSchema = z.object({
  declinedAt: DateSchema,
  declined: z.array(DeclinedPhraseSchema),
});

const DeclineRecordSchema = z.object({
  declined: z.array(DeclinedPhraseSchema.extend({ 'declined-at': DateSchema })).default([]),
});

/**
 * Merges one run's declined cuts into the record and drops every entry that is no longer live, so the record contains only
 * cuts that a later run could still propose. A cut declined again replaces the entry that it repeats. `readFile`
 * returns a repository-relative file's content, or undefined where the file no longer exists.
 */
export function composeRecord(
  prior: DeclineRecord,
  fold: DeclineFold,
  readFile: (file: string) => string | undefined,
): DeclineRecord {
  const entries = new Map<string, DeclinedCut>();
  for (const entry of prior.declined) {
    entries.set(composeDeclineKey(entry), entry);
  }
  for (const entry of fold.declined) {
    entries.set(composeDeclineKey(entry), { ...entry, 'declined-at': fold.declinedAt });
  }
  return {
    declined: entries
      .values()
      .filter((entry) => isLive(entry, readFile(entry.file)))
      .toArray(),
  };
}

/** Reports whether a declined cut still applies: its file exists and contains its phrase. */
export function isLive(entry: DeclinedPhrase, content: string | undefined): boolean {
  return content !== undefined && normalizePhrase(content).includes(normalizePhrase(entry.phrase));
}

/** Parses a run's fold from the JSON that the `record` command reads on standard input. */
export function parseFold(json: string): DeclineFold {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error(`Invalid fold: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
  const result = DeclineFoldSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Invalid fold: ${describeIssues(result.error.issues)}`);
  }
  return result.data;
}

/**
 * Parses the record's YAML. Empty content is the empty record; malformed content throws, because treating it as empty
 * would erase every declined cut on the next write.
 */
export function parseRecord(content: string): DeclineRecord {
  const parsed: unknown = content.trim() === '' ? {} : parseYaml(content);
  const result = DeclineRecordSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Invalid record in ${RECORD_PATH}: ${describeIssues(result.error.issues)}`);
  }
  return result.data;
}

/** Renders the record as YAML sorted by file and then phrase, so rewriting unchanged content is byte-identical. */
export function stringifyRecord(record: DeclineRecord): string {
  const declined = record.declined
    .toSorted((a, b) => a.file.localeCompare(b.file) || a.phrase.localeCompare(b.phrase))
    .map((entry) => ({
      file: entry.file,
      phrase: entry.phrase,
      class: entry.class,
      'declined-at': entry['declined-at'],
    }));
  return stringifyYaml({ declined }, { lineWidth: 0 });
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
