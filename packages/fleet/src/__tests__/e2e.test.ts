import { appendFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, assert, beforeEach, describe, expect, it } from 'vitest';

import type { FleetSnapshot } from '../api/snapshot.ts';
import { type RunningFleetServer, startFleetServer } from '../server.ts';

const SHORT_INTERVALS = { closeAfterMs: 600_000, debounceMs: 10, heartbeatMs: 60_000, port: 0, rescanMs: 50 };

let eventsDir: string;
let running: RunningFleetServer | undefined;

/** Serializes one event envelope as a JSONL line. */
function composeLine(type: string, ts: string): string {
  return `${JSON.stringify({ id: '01ARZ3NDEKTSV4RRFFQ69G5FAV', ts, type, cwd: '/work/repo', payload: {} })}\n`;
}

/** Starts a server on an ephemeral port over the given events root. */
async function startTestServer(overrides: { eventsDir?: string; staleMs?: number } = {}): Promise<void> {
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
