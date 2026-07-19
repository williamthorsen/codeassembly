// The in-memory fold of the events tree: lifecycle `LaneState` per lane, accumulated incrementally via per-file byte
// offsets. The whole store is a rebuildable cache — restarting the server re-folds from disk — so it is never a
// writer concern. Derivation to wire shapes lives in the snapshot layer, not here.

import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  applyLaneEvent,
  createLaneState,
  type LanePath,
  type LaneState,
  parseEventLine,
  parseLanePath,
} from '@codeassembly/lifecycle';

import { isMissingFileError } from '../common/fs-errors.ts';
import { readAppendedLines } from '../common/jsonl-tail.ts';

/** The folded event tree, refreshed by idempotent scans. */
export interface EventStore {
  /** The current folded state of every lane. */
  listLanes(): LaneState[];
  /** Walks the tree and folds newly appended lines; safe to call from any trigger, any number of times. */
  scanAndFold(): void;
}

/**
 * Creates a store folding the session files under `eventsDir`. `onChange` fires after a scan that changed the fold —
 * new lines applied or a truncated file re-folded — and stays quiet on no-op scans. A missing root is an empty
 * fleet, not an error.
 */
export function createEventStore(input: { eventsDir: string; onChange?: () => void }): EventStore {
  const lanes = new Map<string, LaneState>();
  const offsets = new Map<string, number>();

  function scanAndFold(): void {
    let entries: string[];
    try {
      entries = readdirSync(input.eventsDir, { encoding: 'utf8', recursive: true });
    } catch (error) {
      if (isMissingFileError(error)) {
        return;
      }
      throw error;
    }

    let changed = false;
    for (const relative of entries) {
      const lanePath = parseLanePath(relative);
      if (lanePath === null) {
        continue;
      }
      if (foldSessionFile(relative, lanePath)) {
        changed = true;
      }
    }
    if (changed) {
      input.onChange?.();
    }
  }

  /** Folds one session file's newly appended lines; returns whether the fold changed. */
  function foldSessionFile(relative: string, lanePath: LanePath): boolean {
    const filePath = join(input.eventsDir, relative);
    const laneKey = `${lanePath.repo}/${lanePath.branch}`;
    let changed = false;

    let result = readAppendedLines({ filePath, offset: offsets.get(relative) ?? 0 });
    if (result.kind === 'truncated') {
      // Append-only files should not shrink; when one does, the accumulated state is stale — discard the session's
      // fold and re-read from the start.
      resetSessionFold(laneKey, lanePath.session);
      offsets.set(relative, 0);
      changed = true;
      result = readAppendedLines({ filePath, offset: 0 });
    }
    if (result.kind !== 'appended') {
      return changed;
    }

    offsets.set(relative, result.offset);
    let lane = lanes.get(laneKey) ?? createLaneState({ repo: lanePath.repo, branch: lanePath.branch });
    for (const line of result.lines) {
      const envelope = parseEventLine(line);
      if (envelope === null) {
        continue;
      }
      lane = applyLaneEvent(lane, { sessionId: lanePath.session, envelope });
      changed = true;
    }
    if (changed) {
      lanes.set(laneKey, lane);
    }
    return changed;
  }

  /** Drops a session's accumulated state so the next fold starts fresh. */
  function resetSessionFold(laneKey: string, sessionId: string): void {
    const lane = lanes.get(laneKey);
    if (lane === undefined) {
      return;
    }
    const { [sessionId]: _dropped, ...remaining } = lane.sessions;
    lanes.set(laneKey, { ...lane, sessions: remaining });
  }

  return { listLanes: () => [...lanes.values()], scanAndFold };
}
