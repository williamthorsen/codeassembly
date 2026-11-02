import path from 'node:path';

import type { Assignment, BinsFile, CurationRecord } from './schemas.ts';
import type { BinViolation } from './types.ts';

/** One judge's assignment paired with the bins file that it wrote, each named by its path. */
export interface JudgedAssignment {
  assignment: Assignment;
  bins: BinsFile;
  file: string;
}

/** A failure of the bins check, carrying every violation so that a caller reports them all at once. */
export class BinsError extends Error {
  constructor(
    message: string,
    readonly violations: BinViolation[],
  ) {
    super(message);
  }
}

/** Returns a file's content at a pinned commit, relative to the pinned repository's root, or `undefined` when absent. */
export type ReadFileAtPin = (root: string, sha: string, file: string) => string | undefined;

/**
 * Builds the curation record from judged assignments that {@link checkBins} accepts: each event's bin, the covered
 * permalinks, and the marks grouped by the references that they add.
 */
export function buildRecord(judged: readonly JudgedAssignment[]): CurationRecord {
  const first = judged[0];
  const events: CurationRecord['events'] = [];
  const groups = new Map<string, { references: string[]; eventIds: string[]; result: null }>();
  const obsolete: string[] = [];
  const counts = { covered: 0, duplicate: 0, obsolete: 0, kept: 0 };

  for (const { assignment, bins, file } of judged) {
    const summaries = new Map(assignment.clusters.flatMap((cluster) => cluster.events.map((e) => [e.id, e.summary])));
    const pins = new Map(assignment.pins.map((pin) => [pin.repo, pin]));
    const references = new Map(assignment.references.map((entry) => [entry.id, entry.references]));
    for (const entry of bins.events) {
      counts[entry.bin] += 1;
      const base = {
        id: entry.id,
        summary: summaries.get(entry.id) ?? '',
        bin: entry.bin,
        ...(entry.reason !== undefined && { reason: entry.reason }),
        file,
      };
      if (entry.bin === 'covered') {
        const pin = pins.get(entry.source ?? '');
        if (pin === undefined || entry.path === undefined) throw new Error(`covered entry ${entry.id} was not checked`);
        const reference = `https://github.com/${pin.repo}/blob/${pin.sha}/${entry.path}`;
        events.push({ ...base, ...(entry.quote !== undefined && { quote: entry.quote }), reference });
        addToGroup(groups, [reference], entry.id);
      } else if (entry.bin === 'duplicate') {
        const copied = references.get(entry.duplicateOf ?? '') ?? [];
        events.push({ ...base, ...(entry.duplicateOf !== undefined && { duplicateOf: entry.duplicateOf }) });
        addToGroup(groups, copied, entry.id);
      } else {
        events.push(base);
        if (entry.bin === 'obsolete') obsolete.push(entry.id);
      }
    }
  }

  return {
    store: first?.assignment.store ?? '',
    pins: first?.assignment.pins ?? [],
    events,
    counts,
    marks: { addressedBy: groups.values().toArray(), obsolete: { eventIds: obsolete, result: null } },
  };
}

/**
 * Checks one judge's bins file against its assignment and reports every violation: an event missing, placed twice, or
 * not in the assignment; a covered entry without a pinned source, a path that exists at the pin, or a quote that the
 * file contains; a duplicate that does not name a reference entry; and a non-kept entry without a reason.
 */
export function checkBins(judged: JudgedAssignment, readFileAtPin: ReadFileAtPin): BinViolation[] {
  const { assignment, bins, file } = judged;
  const violations: BinViolation[] = [];
  function report(event: string | null, message: string): void {
    violations.push({ file, event, message });
  }

  const expected = new Set(assignment.clusters.flatMap((cluster) => cluster.events.map((event) => event.id)));
  const pins = new Map(assignment.pins.map((pin) => [pin.repo, pin]));
  const referenceIds = new Set(assignment.references.map((entry) => entry.id));
  const seen = new Set<string>();

  for (const entry of bins.events) {
    if (!expected.has(entry.id)) {
      report(entry.id, 'the event is not in the assignment');
    } else if (seen.has(entry.id)) {
      report(entry.id, 'the event is placed more than once');
    }
    seen.add(entry.id);

    if (entry.bin !== 'kept' && (entry.reason === undefined || entry.reason.trim() === '')) {
      report(entry.id, `an entry in the ${entry.bin} bin needs a reason`);
    }
    const coveredDefect = entry.bin === 'covered' ? findCoveredDefect(entry, pins, readFileAtPin) : undefined;
    if (coveredDefect !== undefined) report(entry.id, coveredDefect);
    if (entry.bin === 'duplicate' && !referenceIds.has(entry.duplicateOf ?? '')) {
      report(entry.id, `a duplicate must name a reference entry (got "${entry.duplicateOf ?? ''}")`);
    }
  }

  for (const id of expected) {
    if (!seen.has(id)) report(id, 'the event is not placed in any bin');
  }
  return violations;
}

// region | Helpers

/** Adds an event to the mark group for its reference set, creating the group on first use. */
function addToGroup(
  groups: Map<string, { references: string[]; eventIds: string[]; result: null }>,
  references: readonly string[],
  id: string,
): void {
  const sorted = references.toSorted();
  const key = sorted.join('\n');
  const group = groups.get(key);
  if (group === undefined) {
    groups.set(key, { references: sorted, eventIds: [id], result: null });
  } else {
    group.eventIds.push(id);
  }
}

/**
 * Returns what is wrong with a covered entry's source, path, or quote, or `undefined` when all three check out at the
 * pin.
 */
function findCoveredDefect(
  entry: BinsFile['events'][number],
  pins: ReadonlyMap<string, Assignment['pins'][number]>,
  readFileAtPin: ReadFileAtPin,
): string | undefined {
  const pin = pins.get(entry.source ?? '');
  if (pin === undefined) return `a covered entry must name a pinned source (got "${entry.source ?? ''}")`;
  if (entry.path === undefined || entry.path === '' || path.isAbsolute(entry.path)) {
    return 'a covered entry needs a path relative to the repository root';
  }
  const content = readFileAtPin(pin.root, pin.sha, entry.path);
  if (content === undefined) return `${entry.path} does not exist in ${pin.repo} at ${pin.sha}`;
  const quote = normalizeForQuote(entry.quote ?? '');
  if (quote === '') return 'a covered entry needs a quote of the sentence that states the lesson';
  return normalizeForQuote(content).includes(quote)
    ? undefined
    : `the quote does not appear in ${entry.path} in ${pin.repo} at ${pin.sha}`;
}

/** Strips emphasis and code markers and collapses whitespace, so that a faithful quote of formatted text matches. */
function normalizeForQuote(text: string): string {
  return text.replaceAll(/[*_`]/g, '').replaceAll(/\s+/g, ' ').trim();
}

// endregion | Helpers
