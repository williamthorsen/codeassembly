import { foldEvents } from '../../shared/event-folder.js';
import type { CanonicalRunStatus } from '../../shared/types/canonical.js';
import type { RunEvent, RunHeader } from '../../shared/types/run-log.js';

/**
 * Generate playback snapshots by folding events up to each position.
 * When `indices` is provided, only those 0-based event positions produce snapshots.
 * When omitted, every event produces a snapshot.
 */
export function generateSnapshots(
  header: RunHeader,
  events: ReadonlyArray<RunEvent>,
  indices?: ReadonlyArray<number>,
): CanonicalRunStatus[] {
  if (indices !== undefined) {
    return indices.map((idx) => foldEvents(header, events.slice(0, idx + 1)));
  }
  return events.map((_, idx) => foldEvents(header, events.slice(0, idx + 1)));
}
