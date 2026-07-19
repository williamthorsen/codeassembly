import { serve } from '@hono/node-server';
import { hc } from 'hono/client';
import { assert, describe, expect, it, vi } from 'vitest';

import { type AppType, createApp } from '../app.ts';
import type { FleetSnapshot } from '../snapshot.ts';

const EMPTY_SNAPSHOT: FleetSnapshot = { lanes: [] };

/** Creates an app over stub capabilities, returning the mocks alongside it. */
function composeApp(snapshot: FleetSnapshot = EMPTY_SNAPSHOT) {
  const unsubscribe = vi.fn();
  const subscribe = vi.fn(() => unsubscribe);
  const app = createApp({ getSnapshot: () => snapshot, heartbeatMs: 60_000, subscribe });
  return { app, subscribe, unsubscribe };
}

/** Reads the next SSE chunk from a stream response as text. */
async function readChunk(response: Response): Promise<string> {
  assert(response.body !== null, 'The stream response should carry a body');
  const reader = response.body.getReader();
  const { value } = await reader.read();
  await reader.cancel();
  assert(value instanceof Uint8Array, 'The stream should yield a byte chunk');
  return new TextDecoder().decode(value);
}

describe('createApp', () => {
  it('serves the current snapshot on /api/lanes', async () => {
    const snapshot: FleetSnapshot = {
      lanes: [
        {
          repo: 'acme/app',
          branch: '101',
          ticketRef: { ticketId: '101', revisit: null },
          open: true,
          closedReason: null,
          lastEventTs: '2026-07-19T05:00:00.000Z',
          sessions: [],
        },
      ],
    };
    const { app } = composeApp(snapshot);

    const response = await app.request('/api/lanes');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(snapshot);
  });

  it('opens /api/stream as SSE and sends the current snapshot as the initial frame', async () => {
    const { app } = composeApp();

    const response = await app.request('/api/stream');

    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(await readChunk(response)).toContain(`data: ${JSON.stringify(EMPTY_SNAPSHOT)}`);
  });

  it('subscribes each stream connection for pushed frames', async () => {
    const { app, subscribe } = composeApp();

    const response = await app.request('/api/stream');
    await readChunk(response);

    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it('disposes the subscription when the client aborts the stream', async () => {
    // Abort propagation needs a real socket; an in-memory `app.request` cancellation never reaches `onAbort`.
    const { app, unsubscribe } = composeApp();
    const bound = Promise.withResolvers<number>();
    const server = serve({ fetch: app.fetch, port: 0 }, (info) => bound.resolve(info.port));
    try {
      const response = await fetch(`http://localhost:${await bound.promise}/api/stream`);
      await readChunk(response);

      await vi.waitFor(() => {
        expect(unsubscribe).toHaveBeenCalledTimes(1);
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error === undefined ? resolve() : reject(error)));
        if ('closeAllConnections' in server) {
          server.closeAllConnections();
        }
      });
    }
  });

  it('exposes both routes to an hc typed client', () => {
    // Compile-time proof of the typed-client contract: these property accesses only typecheck while `AppType`
    // carries the chained route map.
    const client = hc<AppType>('http://localhost');

    expect(typeof client.api.lanes.$get).toBe('function');
    expect(typeof client.api.stream.$get).toBe('function');
  });
});
