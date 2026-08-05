import { appendFileSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, assert, describe, expect, it, vi } from 'vitest';

import { createEventStore } from '../event-store.ts';

const BASE_TS = '2026-07-19T05:00:00.000Z';
const NOW = Date.parse(BASE_TS);
const RETENTION_MS = 1_800_000;

const tempDirs: string[] = [];

afterEach(() => {
  const pending = [...tempDirs];
  tempDirs.length = 0;
  for (const dir of pending) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('createEventStore', () => {
  it('backfills every lane and session on the first scan', () => {
    const eventsDir = createEventsDir();
    writeFileSync(composeSessionPath(eventsDir, 'acme/app', '101', 'sess-a'), composeLine('turn.started'));
    writeFileSync(
      composeSessionPath(eventsDir, 'acme/app', '102', 'sess-b'),
      composeLine('turn.started') + composeLine('turn.completed'),
    );
    const store = createEventStore({ eventsDir, retentionMs: RETENTION_MS });

    store.scanAndFold(NOW);

    const lanes = store.listLanes();
    expect(lanes).toHaveLength(2);
    const lane101 = lanes.find((lane) => lane.branch === '101');
    assert(lane101 !== undefined, 'Lane 101 should be folded');
    expect(lane101.repo).toBe('acme/app');
    expect(lane101.sessions['sess-a']?.phase).toBe('working');
    const lane102 = lanes.find((lane) => lane.branch === '102');
    assert(lane102 !== undefined, 'Lane 102 should be folded');
    expect(lane102.sessions['sess-b']?.phase).toBe('waiting');
  });

  it('folds two session files under one branch into a single lane', () => {
    const eventsDir = createEventsDir();
    writeFileSync(composeSessionPath(eventsDir, 'acme/app', '101', 'sess-a'), composeLine('turn.started'));
    writeFileSync(
      composeSessionPath(eventsDir, 'acme/app', '101', 'sess-b'),
      composeLine('turn.started') + composeLine('turn.completed'),
    );
    const store = createEventStore({ eventsDir, retentionMs: RETENTION_MS });

    store.scanAndFold(NOW);

    const lanes = store.listLanes();
    expect(lanes).toHaveLength(1);
    expect(lanes[0]?.branch).toBe('101');
    expect(lanes[0]?.sessions['sess-a']?.phase).toBe('working');
    expect(lanes[0]?.sessions['sess-b']?.phase).toBe('waiting');
  });

  it('folds appended lines incrementally without double-counting on repeated scans', () => {
    const eventsDir = createEventsDir();
    const filePath = composeSessionPath(eventsDir, 'acme/app', '101', 'sess-a');
    writeFileSync(filePath, composeLine('turn.started'));
    const onChange = vi.fn();
    const store = createEventStore({ eventsDir, retentionMs: RETENTION_MS, onChange });

    store.scanAndFold(NOW);
    store.scanAndFold(NOW);
    expect(onChange).toHaveBeenCalledTimes(1);

    appendFileSync(filePath, composeLine('turn.completed', { ts: '2026-07-19T05:01:00.000Z' }));
    store.scanAndFold(NOW);
    expect(onChange).toHaveBeenCalledTimes(2);

    const lane = store.listLanes()[0];
    assert(lane !== undefined, 'The lane should be folded');
    expect(lane.sessions['sess-a']?.phase).toBe('waiting');
    expect(lane.sessions['sess-a']?.lastEventTs).toBe('2026-07-19T05:01:00.000Z');
  });

  it('serves an empty fleet when the events root does not exist', () => {
    const eventsDir = createEventsDir();
    const store = createEventStore({ eventsDir: join(eventsDir, 'not-created-yet'), retentionMs: RETENTION_MS });

    store.scanAndFold(NOW);

    expect(store.listLanes()).toEqual([]);
  });

  it('skips malformed lines while folding valid ones from the same file', () => {
    const eventsDir = createEventsDir();
    writeFileSync(
      composeSessionPath(eventsDir, 'acme/app', '101', 'sess-a'),
      `not json at all\n${composeLine('turn.started')}{"missing":"envelope fields"}\n`,
    );
    const store = createEventStore({ eventsDir, retentionMs: RETENTION_MS });

    store.scanAndFold(NOW);

    expect(store.listLanes()[0]?.sessions['sess-a']?.phase).toBe('working');
  });

  it('ignores files that are not lane-path leaves', () => {
    const eventsDir = createEventsDir();
    writeFileSync(join(eventsDir, 'stray.jsonl'), composeLine('turn.started'));
    mkdirSync(join(eventsDir, 'acme', 'app', '101', 'too-deep'), { recursive: true });
    writeFileSync(join(eventsDir, 'acme', 'app', '101', 'too-deep', 'sess.jsonl'), composeLine('turn.started'));
    const store = createEventStore({ eventsDir, retentionMs: RETENTION_MS });

    store.scanAndFold(NOW);

    expect(store.listLanes()).toEqual([]);
  });

  it('re-folds a truncated file from scratch instead of keeping stale state', () => {
    const eventsDir = createEventsDir();
    const filePath = composeSessionPath(eventsDir, 'acme/app', '101', 'sess-a');
    writeFileSync(filePath, composeLine('turn.started') + composeLine('session.ended'));
    const store = createEventStore({ eventsDir, retentionMs: RETENTION_MS });
    store.scanAndFold(NOW);
    expect(store.listLanes()[0]?.sessions['sess-a']?.phase).toBe('ended');

    writeFileSync(filePath, composeLine('turn.started'));
    store.scanAndFold(NOW);

    expect(store.listLanes()[0]?.sessions['sess-a']?.phase).toBe('working');
  });

  it('evicts a lane once its newest event ages past the retention window', () => {
    const eventsDir = createEventsDir();
    writeFileSync(composeSessionPath(eventsDir, 'acme/app', '101', 'sess-a'), composeLine('turn.started'));
    const onChange = vi.fn();
    const store = createEventStore({ eventsDir, retentionMs: RETENTION_MS, onChange });

    store.scanAndFold(NOW);
    expect(store.listLanes()).toHaveLength(1);

    store.scanAndFold(NOW + RETENTION_MS + 1);

    expect(store.listLanes()).toEqual([]);
    expect(onChange).toHaveBeenCalledTimes(2); // once for the fold, once for the eviction
  });

  it('retains a lane whose newest event is still within the window', () => {
    const eventsDir = createEventsDir();
    writeFileSync(composeSessionPath(eventsDir, 'acme/app', '101', 'sess-a'), composeLine('turn.started'));
    const store = createEventStore({ eventsDir, retentionMs: RETENTION_MS });

    store.scanAndFold(NOW);
    store.scanAndFold(NOW + RETENTION_MS - 1);

    expect(store.listLanes()).toHaveLength(1);
  });

  it('rediscovers a branch that starts a new session after eviction', () => {
    const eventsDir = createEventsDir();
    writeFileSync(composeSessionPath(eventsDir, 'acme/app', '101', 'sess-a'), composeLine('turn.started'));
    const store = createEventStore({ eventsDir, retentionMs: RETENTION_MS });

    store.scanAndFold(NOW);
    store.scanAndFold(NOW + RETENTION_MS + 1);
    expect(store.listLanes()).toEqual([]);

    // A resumed branch means a new session file, whose creation bumps the branch directory's mtime.
    writeFileSync(
      composeSessionPath(eventsDir, 'acme/app', '101', 'sess-b'),
      composeLine('turn.started', { ts: '2026-07-19T05:30:00.000Z' }),
    );
    store.scanAndFold(NOW + RETENTION_MS + 1);

    const lanes = store.listLanes();
    expect(lanes).toHaveLength(1);
    expect(lanes[0]?.sessions['sess-b']?.phase).toBe('working');
  });

  it('does not tail a retired branch whose directory has aged out', () => {
    const eventsDir = createEventsDir();
    const filePath = composeSessionPath(eventsDir, 'acme/app', '101', 'sess-a');
    writeFileSync(filePath, composeLine('turn.started'));
    const store = createEventStore({ eventsDir, retentionMs: RETENTION_MS });

    store.scanAndFold(NOW);
    store.scanAndFold(NOW + RETENTION_MS + 1);
    expect(store.listLanes()).toEqual([]);

    // Append to the retired session and age the branch directory before it: the append bumps only the file's mtime,
    // so the directory stays outside the window and the scan skips it — the append is never tailed.
    appendFileSync(filePath, composeLine('turn.completed', { ts: '2026-07-19T05:01:00.000Z' }));
    utimesSync(join(eventsDir, 'acme', 'app', '101'), new Date(NOW), new Date(NOW));
    store.scanAndFold(NOW + RETENTION_MS + 1);

    expect(store.listLanes()).toEqual([]);
  });
});

// region | Helpers

/** Serializes one event envelope as a JSONL line. */
function composeLine(type: string, overrides: Record<string, unknown> = {}): string {
  return `${JSON.stringify({
    id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    ts: BASE_TS,
    type,
    cwd: '/work/repo',
    payload: {},
    ...overrides,
  })}\n`;
}

/** Resolves a session file's path under `eventsDir`, creating its lane directories. */
function composeSessionPath(eventsDir: string, repo: string, branch: string, session: string): string {
  const dir = join(eventsDir, ...repo.split('/'), branch);
  mkdirSync(dir, { recursive: true });
  return join(dir, `${session}.jsonl`);
}

/** Creates a fresh events root, registered for removal once the test ends. */
function createEventsDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'event-store-'));
  tempDirs.push(dir);
  return dir;
}

// endregion | Helpers
