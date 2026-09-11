/**
 * The per-repository record of declined cuts, `.agents/streamline-guidance.yaml`.
 *
 * A declined cut stays declined while its file still contains its phrase. A later run proposes no cut that removes or
 * rewords a live declined phrase, which is what lets a run at a small level move on to the next candidates rather than
 * propose the same declined ones on every run.
 */
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import { normalizePhrase } from './normalize-phrase.ts';
import type { DeclinedPhrase, DeclineRecord } from './types.ts';

/** Path of the record within a repository. */
export const RECORD_PATH = '.agents/streamline-guidance.yaml';

const CutClassSchema = z.enum(['aggressive', 'conservative', 'moderate']);

const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be an ISO calendar date (YYYY-MM-DD)');

const DeclinedPhraseSchema = z.object({
  file: z.string().min(1),
  phrase: z.string().min(1),
  class: CutClassSchema,
});

const DeclineRecordSchema = z.object({
  declined: z.array(DeclinedPhraseSchema.extend({ 'declined-at': DateSchema })).default([]),
});

/** Reports whether a declined cut still applies: its file exists and contains its phrase. */
export function isLive(entry: DeclinedPhrase, content: string | undefined): boolean {
  return content !== undefined && normalizePhrase(content).includes(normalizePhrase(entry.phrase));
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

// region | Helpers

/** Renders Zod issues as one line, each prefixed by the path to the offending value. */
function describeIssues(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>): string {
  return issues.map((issue) => `${issue.path.map(String).join('.') || '(root)'}: ${issue.message}`).join('; ');
}

// endregion | Helpers
