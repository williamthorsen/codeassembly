import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, assert, beforeEach, describe, expect, it } from 'vitest';

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

let eventsDir: string;
let repoDir: string | undefined;
let running: RunningFleetServer | undefined;

/** Serializes one event envelope as a JSONL line. */
function composeLine(type: string, ts: string, cwd = '/work/repo'): string {
  return `${JSON.stringify({ id: '01ARZ3NDEKTSV4RRFFQ69G5FAV', ts, type, cwd, payload: {} })}\n`;
}

/** Initializes a repository with one commit on `main` and its remote-tracking base ref in a fresh temp directory. */
function createRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'fleet-e2e-repo-'));
  execFileSync('git', ['-C', dir, 'init', '--initial-branch=main'], { stdio: 'ignore' });
  execFileSync(
    'git',
    [
      '-C',
      dir,
      '-c',
      'user.name=fleet-test',
      '-c',
      'user.email=fleet@test.invalid',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '--allow-empty',
      '--message',
      'one',
    ],
    { stdio: 'ignore' },
  );
  execFileSync('git', ['-C', dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD'], { stdio: 'ignore' });
  return dir;
}

/** Polls `/api/lanes` until the predicate holds on the first lane, failing the test after the timeout. */
async function fetchLaneUntil(
  port: number,
  predicate: (lane: FleetSnapshot['lanes'][number]) => boolean,
  timeoutMs = 3000,
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

/** Starts a server on an ephemeral port over the given events root. */
async function startTestServer(
  overrides: { eventsDir?: string; gitPollMs?: number; staleMs?: number } = {},
): Promise<void> {
  running = await startFleetServer({
    config: { ...SHORT_INTERVALS, eventsDir, staleMs: 90_000, ...overrides },
    log: () => {},
  });
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

beforeEach(() => {
  eventsDir = mkdtempSync(join(tmpdir(), 'fleet-e2e-'));
});

afterEach(async () => {
  await running?.stop();
  running = undefined;
  rmSync(eventsDir, { recursive: true, force: true });
  if (repoDir !== undefined) {
    rmSync(repoDir, { recursive: true, force: true });
    repoDir = undefined;
  }
});

describe('fleet server', () => {
  it('serves an empty fleet when started against a missing events root', async () => {
    await startTestServer({ eventsDir: join(eventsDir, 'never-created') });
    assert(running !== undefined, 'The server should be running');

    const response = await fetch(`http://localhost:${running.port}/api/lanes`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ lanes: [] });
  });

  it('pushes an SSE frame within a second of an event line landing on disk', async () => {
    await startTestServer();
    assert(running !== undefined, 'The server should be running');
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
    expect(elapsedMs).toBeLessThan(1000);
    expect(pushed.lanes[0]?.branch).toBe('101');
    expect(pushed.lanes[0]?.sessions[0]?.phase).toBe('working');
    expect(pushed.lanes[0]?.forge).toBeNull();
  });

  it('surfaces git ground truth within a poll interval and closes the lane when the worktree disappears', async () => {
    repoDir = createRepo();
    writeFileSync(join(repoDir, 'wip.txt'), 'wip');
    const laneDir = join(eventsDir, 'acme', 'app', '101');
    mkdirSync(laneDir, { recursive: true });
    appendFileSync(join(laneDir, 'sess-a.jsonl'), composeLine('turn.started', new Date().toISOString(), repoDir));
    await startTestServer({ gitPollMs: 50 });
    assert(running !== undefined, 'The server should be running');

    const probed = await fetchLaneUntil(running.port, (lane) => lane.git !== null);
    expect(probed.git).toEqual({ branch: 'main', dirtyFiles: 1, ahead: 0, behind: 0, baseBranch: 'origin/main' });
    expect(probed.open).toBe(true);

    rmSync(repoDir, { recursive: true, force: true });

    const closed = await fetchLaneUntil(running.port, (lane) => !lane.open);
    expect(closed.closedReason).toBe('worktree-gone');
  });

  it('broadcasts a staleness crossing with no new event on disk', async () => {
    const laneDir = join(eventsDir, 'acme', 'app', '101');
    mkdirSync(laneDir, { recursive: true });
    appendFileSync(join(laneDir, 'sess-a.jsonl'), composeLine('turn.started', new Date().toISOString()));
    await startTestServer({ staleMs: 200 });
    assert(running !== undefined, 'The server should be running');
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
