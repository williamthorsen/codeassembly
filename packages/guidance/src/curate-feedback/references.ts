import path from 'node:path';

import { resolveEventsDir } from '@williamthorsen/kb/layout';

import { parseTriageReferenceDate } from '../lesson-clusters/deferral.ts';
import { buildExcerpt, listEventFiles, loadEvent } from '../lesson-clusters/inventory.ts';
import type { ReferenceEntry } from './types.ts';

/** A reference that a covered mark writes: a GitHub permalink to a file at a full commit SHA. */
const COVERED_PERMALINK = /^https:\/\/github\.com\/[^/]+\/[^/]+\/blob\/[0-9a-f]{40}\/.+$/;

/** The standard disposition tags that take an event out of consideration for good. */
const CLOSED_TAGS: ReadonlySet<string> = new Set(['obsolete', 'rejected']);

/**
 * Reads every event in the store and returns the addressed feedback events that a duplicate can point to: those with
 * at least one eligible reference. Each entry lists only its eligible references.
 */
export async function buildReferences(input: { storePath: string }): Promise<ReferenceEntry[]> {
  const eventsDir = resolveEventsDir(input.storePath);
  const files = await listEventFiles(eventsDir);
  const entries: ReferenceEntry[] = [];
  for (const file of files) {
    const loaded = await loadEvent(path.join(eventsDir, file));
    if (!loaded.ok) continue;
    const event = loaded.event;
    if (!event.tags.includes('feedback') || event.tags.some((tag) => CLOSED_TAGS.has(tag))) continue;
    const references = event.addressedBy.filter((reference) => isEligibleReference(reference));
    if (references.length === 0) continue;
    entries.push({ id: event.id, summary: event.summary, excerpt: buildExcerpt(event.body), references });
  }
  return entries;
}

/** Reports whether `reference` is a covered-guidance permalink. */
export function isCoveredPermalink(reference: string): boolean {
  return COVERED_PERMALINK.test(reference);
}

/**
 * Reports whether a duplicate may copy `reference`: Neither a triage artifact, which only defers an event, nor a
 * covered permalink, whose lesson the covered bin catches, addresses the lesson.
 */
export function isEligibleReference(reference: string): boolean {
  return parseTriageReferenceDate(reference) === null && !isCoveredPermalink(reference);
}
