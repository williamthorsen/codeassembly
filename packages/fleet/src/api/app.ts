// The HTTP surface: a snapshot route and an SSE stream pushing full-fleet frames. Routes are chained in one
// expression — splitting the registrations would silently degrade `AppType` to an empty route map and with it the
// typed client consumers build from it. The app owns no state: snapshots and change notifications arrive as
// injected capabilities, so tests drive it without a store or a clock.

import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';

import type { FleetSnapshot } from './snapshot.ts';

/**
 * Creates the Fleet app. `getSnapshot` serves the current frame; `subscribe` registers a listener for pushed frames
 * and returns the disposer the stream calls on client abort.
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- the inferred route map is the contract `AppType` extracts; an explicit annotation would discard it
export function createApp(input: {
  heartbeatMs: number;
  getSnapshot(): FleetSnapshot;
  subscribe(listener: (snapshot: FleetSnapshot) => void): () => void;
}) {
  return new Hono()
    .get('/api/lanes', (context) => context.json(input.getSnapshot()))
    .get('/api/stream', (context) =>
      streamSSE(context, async (stream) => {
        const unsubscribe = input.subscribe((snapshot) => {
          void stream.writeSSE({ data: JSON.stringify(snapshot) });
        });
        const heartbeat = setInterval(() => {
          // An SSE comment: keeps idle connections alive through proxies without waking client handlers.
          void stream.write(':\n\n');
        }, input.heartbeatMs);

        await stream.writeSSE({ data: JSON.stringify(input.getSnapshot()) });
        await new Promise<void>((resolve) => {
          stream.onAbort(() => {
            clearInterval(heartbeat);
            unsubscribe();
            resolve();
          });
        });
      }),
    );
}

/** The route map consumed by `hc` typed clients; kept end-to-end typed by the chained registrations above. */
export type AppType = ReturnType<typeof createApp>;
