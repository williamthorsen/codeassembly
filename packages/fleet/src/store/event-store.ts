// The in-memory fold of the events tree: lifecycle `LaneState` per lane, accumulated incrementally via per-session byte
// offsets. The whole store is a rebuildable cache — restarting the server re-folds from disk — so it is never a writer
// concern. Derivation to wire shapes lives in the snapshot layer, not here.
//
// Resident state and per-scan filesystem work are bounded by a retention window: a lane idle past `retentionMs` is
// evicted, and the scan does not walk or stat a non-resident branch unless its directory changed within the window —
// the cheap signal that a new session appeared. A resumed branch (a new session file) is rediscovered and reappears.

import { type Dirent, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  applyLaneEvent,
  createLaneState,
  type LaneState,
  parseEventLine,
  resolveLaneRecency,
} from '@codeassembly/lifecycle';

import { isMissingFileError } from '../common/fs-errors.ts';
import { readAppendedLines } from '../common/jsonl-tail.ts';

const JSONL_EXT = '.jsonl';

/** The folded event tree, refreshed by idempotent scans. */
export interface EventStore {
  /** The current folded state of every resident lane. */
  listLanes(): LaneState[];
  /** Walks the tree at `nowMs`, folds newly appended lines, and evicts idle lanes; safe to call any number of times. */
  scanAndFold(nowMs: number): void;
}

/** A resident lane: its folded state and the per-session byte offsets that drive incremental tailing. */
interface LaneEntry {
  state: LaneState;
  offsets: Map<string, number>;
}

/** One `{owner}/{name}/{branch}` directory: its repo key, branch, and absolute path. */
interface BranchLocation {
  repo: string;
  branch: string;
  dir: string;
}

/**
 * Creates a store folding the session files under `eventsDir`, retaining a lane while its newest event is within
 * `retentionMs` of the scan time. `onChange` fires after a scan that changed the fold — lines applied, a truncated file
 * re-folded, or a lane evicted — and stays quiet on no-op scans. A missing root is an empty fleet, not an error.
 */
export function createEventStore(input: { eventsDir: string; retentionMs: number; onChange?: () => void }): EventStore {
  const lanes = new Map<string, LaneEntry>();

  function scanAndFold(nowMs: number): void {
    const cutoff = nowMs - input.retentionMs;
    let changed = false;

    for (const location of enumerateBranches(input.eventsDir)) {
      const laneKey = `${location.repo}/${location.branch}`;
      if (!lanes.has(laneKey)) {
        const mtime = dirMtimeMs(location.dir);
        // A non-resident branch is walked only when its directory changed within the window; otherwise its files are
        // retired and skipped, so per-scan work tracks active lanes rather than the events root's lifetime size.
        if (mtime === null || mtime < cutoff) {
          continue;
        }
      }
      for (const session of listSessions(location.dir)) {
        if (foldSessionFile(laneKey, location, session)) {
          changed = true;
        }
      }
    }

    for (const [laneKey, entry] of lanes) {
      const recencyMs = toEpochMs(resolveLaneRecency(entry.state));
      if (recencyMs > 0 && recencyMs < cutoff) {
        lanes.delete(laneKey);
        changed = true;
      }
    }

    if (changed) {
      input.onChange?.();
    }
  }

  /** Folds one session file's newly appended lines into its lane entry; returns whether the fold changed. */
  function foldSessionFile(laneKey: string, location: BranchLocation, session: string): boolean {
    const filePath = join(location.dir, `${session}${JSONL_EXT}`);
    const entry = lanes.get(laneKey) ?? {
      state: createLaneState({ repo: location.repo, branch: location.branch }),
      offsets: new Map<string, number>(),
    };
    let changed = false;

    let result = readAppendedLines({ filePath, offset: entry.offsets.get(session) ?? 0 });
    if (result.kind === 'truncated') {
      // Append-only files should not shrink; when one does, the accumulated state is stale — discard the session's
      // fold and re-read from the start.
      resetSessionFold(entry, session);
      entry.offsets.set(session, 0);
      changed = true;
      result = readAppendedLines({ filePath, offset: 0 });
    }
    if (result.kind !== 'appended') {
      if (changed) {
        lanes.set(laneKey, entry);
      }
      return changed;
    }

    entry.offsets.set(session, result.offset);
    for (const line of result.lines) {
      const envelope = parseEventLine(line);
      if (envelope === null) {
        continue;
      }
      entry.state = applyLaneEvent(entry.state, { sessionId: session, envelope });
      changed = true;
    }
    if (changed) {
      lanes.set(laneKey, entry);
    }
    return changed;
  }

  return { listLanes: () => [...lanes.values()].map((entry) => entry.state), scanAndFold };
}

// region | Helpers

/** Yields every `{owner}/{name}/{branch}` directory under the events root; an absent root yields none. */
function enumerateBranches(eventsDir: string): BranchLocation[] {
  const locations: BranchLocation[] = [];
  for (const owner of listDirs(eventsDir)) {
    const ownerDir = join(eventsDir, owner);
    for (const name of listDirs(ownerDir)) {
      const nameDir = join(ownerDir, name);
      for (const branch of listDirs(nameDir)) {
        locations.push({ repo: `${owner}/${name}`, branch, dir: join(nameDir, branch) });
      }
    }
  }
  return locations;
}

/** The directory's modification time in epoch milliseconds, or `null` when it is gone. */
function dirMtimeMs(dir: string): number | null {
  try {
    return statSync(dir).mtimeMs;
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }
    throw error;
  }
}

/** The subdirectory names directly under `dir`; an empty list when it is absent or vanished mid-walk. */
function listDirs(dir: string): string[] {
  return readEntries(dir)
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

/** The session ids (`.jsonl` basenames without the suffix) directly under a branch directory. */
function listSessions(dir: string): string[] {
  return readEntries(dir)
    .filter((entry) => entry.isFile() && entry.name.length > JSONL_EXT.length && entry.name.endsWith(JSONL_EXT))
    .map((entry) => entry.name.slice(0, -JSONL_EXT.length));
}

/** Directory entries of `dir`, or an empty list when it is absent or vanished mid-walk. */
function readEntries(dir: string): Dirent[] {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    if (isMissingFileError(error)) {
      return [];
    }
    throw error;
  }
}

/** Drops a session's accumulated state from its entry so the next fold starts fresh. */
function resetSessionFold(entry: LaneEntry, session: string): void {
  const { [session]: _dropped, ...remaining } = entry.state.sessions;
  entry.state = { ...entry.state, sessions: remaining };
}

/** Parses an ISO timestamp to epoch milliseconds, returning 0 when absent or unparseable. */
function toEpochMs(ts: string | undefined): number {
  if (ts === undefined) {
    return 0;
  }
  const ms = Date.parse(ts);
  return Number.isFinite(ms) ? ms : 0;
}

// endregion | Helpers
