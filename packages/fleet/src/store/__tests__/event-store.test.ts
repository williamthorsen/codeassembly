import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, assert, beforeEach, describe, expect, it, vi } from 'vitest';

import { createEventStore } from '../event-store.ts';

let eventsDir: string;

/** Serializes one event envelope as a JSONL line. */
function composeLine(type: string, overrides: Record<string, unknown> = {}): string {
  return `${JSON.stringify({
    id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    ts: '2026-07-19T05:00:00.000Z',
    type,
    cwd: '/work/repo',
    payload: {},
    ...overrides,
  })}\n`;
}

/** Resolves a session file's path under the events root, creating its lane directories. */
function composeSessionPath(repo: string, branch: string, session: string): string {
  const dir = join(eventsDir, ...repo.split('/'), branch);
  mkdirSync(dir, { recursive: true });
  return join(dir, `${session}.jsonl`);
}

beforeEach(() => {
  eventsDir = mkdtempSync(join(tmpdir(), 'event-store-'));
});

afterEach(() => {
  rmSync(eventsDir, { recursive: true, force: true });
});

describe('createEventStore', () => {
  it('backfills every lane and session on the first scan', () => {
    writeFileSync(composeSessionPath('acme/app', '101', 'sess-a'), composeLine('turn.started'));
    writeFileSync(
      composeSessionPath('acme/app', '102', 'sess-b'),
      composeLine('turn.started') + composeLine('turn.completed'),
    );
    const store = createEventStore({ eventsDir });

    store.scanAndFold();

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

  it('folds appended lines incrementally without double-counting on repeated scans', () => {
    const filePath = composeSessionPath('acme/app', '101', 'sess-a');
    writeFileSync(filePath, composeLine('turn.started'));
    const onChange = vi.fn();
    const store = createEventStore({ eventsDir, onChange });

    store.scanAndFold();
    store.scanAndFold();
    expect(onChange).toHaveBeenCalledTimes(1);

    appendFileSync(filePath, composeLine('turn.completed', { ts: '2026-07-19T05:01:00.000Z' }));
    store.scanAndFold();
    expect(onChange).toHaveBeenCalledTimes(2);

    const lane = store.listLanes()[0];
    assert(lane !== undefined, 'The lane should be folded');
    expect(lane.sessions['sess-a']?.phase).toBe('waiting');
    expect(lane.sessions['sess-a']?.lastEventTs).toBe('2026-07-19T05:01:00.000Z');
  });

  it('serves an empty fleet when the events root does not exist', () => {
    const store = createEventStore({ eventsDir: join(eventsDir, 'not-created-yet') });

    store.scanAndFold();

    expect(store.listLanes()).toEqual([]);
  });

  it('skips malformed lines while folding valid ones from the same file', () => {
    writeFileSync(
      composeSessionPath('acme/app', '101', 'sess-a'),
      `not json at all\n${composeLine('turn.started')}{"missing":"envelope fields"}\n`,
    );
    const store = createEventStore({ eventsDir });

    store.scanAndFold();

    expect(store.listLanes()[0]?.sessions['sess-a']?.phase).toBe('working');
  });

  it('ignores files that are not lane-path leaves', () => {
    writeFileSync(join(eventsDir, 'stray.jsonl'), composeLine('turn.started'));
    mkdirSync(join(eventsDir, 'acme', 'app', '101', 'too-deep'), { recursive: true });
    writeFileSync(join(eventsDir, 'acme', 'app', '101', 'too-deep', 'sess.jsonl'), composeLine('turn.started'));
    const store = createEventStore({ eventsDir });

    store.scanAndFold();

    expect(store.listLanes()).toEqual([]);
  });

  it('re-folds a truncated file from scratch instead of keeping stale state', () => {
    const filePath = composeSessionPath('acme/app', '101', 'sess-a');
    writeFileSync(filePath, composeLine('turn.started') + composeLine('session.ended'));
    const store = createEventStore({ eventsDir });
    store.scanAndFold();
    expect(store.listLanes()[0]?.sessions['sess-a']?.phase).toBe('ended');

    writeFileSync(filePath, composeLine('turn.started'));
    store.scanAndFold();

    expect(store.listLanes()[0]?.sessions['sess-a']?.phase).toBe('working');
  });
});
