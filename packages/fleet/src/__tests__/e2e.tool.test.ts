import { appendFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { assert, describe, expect, it, onTestFinished } from 'vitest';

import type { GitObservation } from '../adapters/git.ts';
import type { FleetSnapshot } from '../api/snapshot.ts';
import { RETENTION_MS } from '../config.ts';
import { type RunningFleetServer, startFleetServer } from '../server.ts';

const SHORT_INTERVALS = {
  closeAfterMs: 600_000,
  debounceMs: 10,
  // Forge polling is disabled so the suite stays hermetic — no `gh`, no network. Forge derivation is covered by the
  // layer tests; here one assertion confirms the wire serves `forge: null` with polling off.
  forge: 'none' as const,
  forgePollMs: 60_000,
  gitPollMs: 60_000,
  heartbeatMs: 60_000,
  port: 0,
  rescanMs: 50,
  retentionMs: RETENTION_MS,
};

describe('fleet server', () => {
  it('serves an empty fleet when started against a missing events root', async () => {
    const eventsDir = createEventsDir();
    const running = await startTestServer(join(eventsDir, 'never-created'));

    const response = await fetch(`http://localhost:${running.port}/api/lanes`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ lanes: [] });
  });

  it('pushes an SSE frame within a second of an event line landing on disk', async () => {
    const eventsDir = createEventsDir();
    const running = await startTestServer(eventsDir);
    const response = await fetch(`http://localhost:${running.port}/api/stream`);
    assert(response.body !== null, 'The stream response should carry a body');
    const reader = response.body.getReader();
    const pending = { buffer: '' };

    const initial = await readSnapshotFrame(reader, pending);
    expect(initial.lanes).toEqual([]);

    const laneDir = join(eventsDir, 'acme', 'app', '101');
    mkdirSync(laneDir, { recursive: true });
    const appendedAt = Date.now();
    appendFileSync(join(laneDir, 'sess-a.jsonl'), composeLine('turn.started', new Date(appendedAt).toISOString()));

    const pushed = await readSnapshotFrame(reader, pending);
    const elapsedMs = Date.now() - appendedAt;

    await reader.cancel();
    expect(elapsedMs).toBeLessThan(1_000);
    expect(pushed.lanes[0]?.branch).toBe('101');
    expect(pushed.lanes[0]?.sessions[0]?.phase).toBe('working');
    expect(pushed.lanes[0]?.forge).toBeNull();
  });

  it('surfaces git ground truth within a poll interval and closes the lane when the worktree disappears', async () => {
    const eventsDir = createEventsDir();
    const laneDir = join(eventsDir, 'acme', 'app', '101');
    mkdirSync(laneDir, { recursive: true });
    appendFileSync(join(laneDir, 'sess-a.jsonl'), composeLine('turn.started', new Date().toISOString()));
    let observation: GitObservation = {
      worktreeExists: true,
      branch: 'main',
      dirtyFiles: 1,
      ahead: 0,
      behind: 0,
      baseBranch: 'origin/main',
    };
    const running = await startTestServer(eventsDir, { gitPollMs: 50, gitProbe: () => Promise.resolve(observation) });

    const probed = await fetchLaneUntil(running.port, (lane) => lane.git !== null, 2_000);
    expect(probed.git).toEqual({ branch: 'main', dirtyFiles: 1, ahead: 0, behind: 0, baseBranch: 'origin/main' });
    expect(probed.open).toBe(true);

    observation = {
      worktreeExists: false,
      branch: null,
      dirtyFiles: null,
      ahead: null,
      behind: null,
      baseBranch: null,
    };

    const closed = await fetchLaneUntil(running.port, (lane) => !lane.open, 2_000);
    expect(closed.closedReason).toBe('worktree-gone');
  });

  it('broadcasts a staleness crossing with no new event on disk', async () => {
    const eventsDir = createEventsDir();
    const laneDir = join(eventsDir, 'acme', 'app', '101');
    mkdirSync(laneDir, { recursive: true });
    appendFileSync(join(laneDir, 'sess-a.jsonl'), composeLine('turn.started', new Date().toISOString()));
    const running = await startTestServer(eventsDir, { staleMs: 200 });
    const response = await fetch(`http://localhost:${running.port}/api/stream`);
    assert(response.body !== null, 'The stream response should carry a body');
    const reader = response.body.getReader();
    const pending = { buffer: '' };

    const initial = await readSnapshotFrame(reader, pending);
    expect(initial.lanes[0]?.sessions[0]?.stale).toBe(false);

    const crossed = await readSnapshotFrame(reader, pending);

    await reader.cancel();
    expect(crossed.lanes[0]?.sessions[0]?.stale).toBe(true);
  });
});

// region | Helpers

/** Serializes one event envelope as a JSONL line. */
function composeLine(type: string, ts: string, cwd = '/work/repo'): string {
  return `${JSON.stringify({ id: '01ARZ3NDEKTSV4RRFFQ69G5FAV', ts, type, cwd, payload: {} })}\n`;
}

/** Creates a fresh events root, removed when the test finishes. */
function createEventsDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'fleet-e2e-'));
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** Polls `/api/lanes` until the predicate holds on the first lane, failing the test after the timeout. */
async function fetchLaneUntil(
  port: number,
  predicate: (lane: FleetSnapshot['lanes'][number]) => boolean,
  timeoutMs = 3_000,
): Promise<FleetSnapshot['lanes'][number]> {
  const deadline = Date.now() + timeoutMs;
  let lane: FleetSnapshot['lanes'][number] | undefined;
  while (Date.now() < deadline) {
    const response = await fetch(`http://localhost:${port}/api/lanes`);
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- shape is produced by the server under test; test-code carve-out
    const snapshot = (await response.json()) as FleetSnapshot;
    lane = snapshot.lanes[0];
    if (lane !== undefined && predicate(lane)) {
      return lane;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert(lane !== undefined, 'A lane should have appeared before the timeout');
  expect(predicate(lane)).toBe(true);
  return lane;
}

/** Reads SSE frames from `reader`, resolving with the first data frame's parsed snapshot. */
async function readSnapshotFrame(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  pending: { buffer: string },
): Promise<FleetSnapshot> {
  const decoder = new TextDecoder();
  let frameEnd = pending.buffer.indexOf('\n\n');
  while (frameEnd === -1 || !pending.buffer.startsWith('data:')) {
    if (frameEnd !== -1) {
      // Not a data frame (a heartbeat comment): drop it and keep reading.
      pending.buffer = pending.buffer.slice(frameEnd + 2);
    } else {
      const { done, value } = await reader.read();
      assert(!done, 'The stream should stay open while frames are awaited');
      assert(value instanceof Uint8Array, 'The stream should yield byte chunks');
      pending.buffer += decoder.decode(value, { stream: true });
    }
    frameEnd = pending.buffer.indexOf('\n\n');
  }
  const frame = pending.buffer.slice(0, frameEnd);
  pending.buffer = pending.buffer.slice(frameEnd + 2);
  const parsed: unknown = JSON.parse(frame.replace(/^data:\s*/, ''));
  assert(typeof parsed === 'object' && parsed !== null && 'lanes' in parsed, 'A frame should carry a snapshot');
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- narrowed structurally above; test-code carve-out
  return parsed as FleetSnapshot;
}

/** Starts a server on an ephemeral port over `eventsDir`, stopped when the test finishes. */
async function startTestServer(
  eventsDir: string,
  overrides: {
    gitPollMs?: number;
    gitProbe?: (cwd: string) => Promise<GitObservation>;
    staleMs?: number;
  } = {},
): Promise<RunningFleetServer> {
  const { gitProbe, ...configOverrides } = overrides;
  const server = await startFleetServer({
    config: { ...SHORT_INTERVALS, eventsDir, staleMs: 90_000, ...configOverrides },
    gitProbe,
    log: () => {},
  });
  // Registered after the events root, so the reverse-ordered teardown stops the server before the root is removed.
  onTestFinished(() => server.stop());
  return server;
}

// endregion | Helpers
