import type { FleetSnapshot } from 'codeassembly-fleet';
import { useEffect, useState } from 'react';

import { fleetClient } from '../api/client.ts';

/** The SSE subscription's current state. `EventSource` reconnects on its own; this only mirrors it. */
export type ConnectionState = 'connecting' | 'live' | 'reconnecting';

/** The latest full-fleet frame plus the subscription's connection state; `snapshot` is `null` until a frame arrives. */
export interface FleetSnapshotState {
  connection: ConnectionState;
  snapshot: FleetSnapshot | null;
}

/**
 * Subscribes to the fleet: one typed snapshot fetch for a fast first paint, then wholesale frame replacement from
 * the SSE stream. A fetch that resolves after the first stream frame is discarded, never applied on top.
 */
export function useFleetSnapshot(): FleetSnapshotState {
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [snapshot, setSnapshot] = useState<FleetSnapshot | null>(null);

  useEffect(() => {
    let sawStreamFrame = false;

    /** Fetches the snapshot once and applies it unless a stream frame has already arrived. */
    async function applyInitialSnapshot(): Promise<void> {
      try {
        const response = await fleetClient.api.lanes.$get();
        const fetched = await response.json();
        setSnapshot((current) => (sawStreamFrame ? current : fetched));
      } catch {
        // First-paint optimization only; the stream is the durable channel and reports its own failures.
      }
    }
    void applyInitialSnapshot();

    const source = new EventSource('/api/stream');
    source.addEventListener('open', () => setConnection('live'));
    source.addEventListener('error', () => setConnection('reconnecting'));
    source.addEventListener('message', (message: MessageEvent<string>) => {
      const frame = parseFrame(message.data);
      if (frame === null) {
        return;
      }
      sawStreamFrame = true;
      setSnapshot(frame);
      setConnection('live');
    });

    return () => source.close();
  }, []);

  return { connection, snapshot };
}

// region | Helpers

/**
 * A shallow guard: The server is this workspace's own typed contract, so the guard treats an array-valued `lanes` as
 * proof that the whole `FleetSnapshot` shape is present.
 */
function isFleetSnapshot(value: unknown): value is FleetSnapshot {
  return typeof value === 'object' && value !== null && 'lanes' in value && Array.isArray(value.lanes);
}

/** Parses one SSE frame, returning `null` for malformed data. */
function parseFrame(data: string): FleetSnapshot | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  return isFleetSnapshot(parsed) ? parsed : null;
}

// endregion | Helpers
