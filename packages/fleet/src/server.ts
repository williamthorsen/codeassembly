// The composed server: config → store → watcher → app, plus the publish pipeline. Every trigger — a watch signal or
// a rescan tick — folds and then publishes through one JSON-diff gate, so a staleness threshold crossing broadcasts
// with no new event on disk, and a no-op scan broadcasts nothing.

import { serve } from '@hono/node-server';

import { createApp } from './api/app.ts';
import { buildSnapshot, type FleetSnapshot } from './api/snapshot.ts';
import type { FleetConfig } from './config.ts';
import { createEventStore } from './store/event-store.ts';
import { startWatcher } from './store/watcher.ts';

/** A running server; `port` is the bound port (useful when configured as 0 for an ephemeral one). */
export interface RunningFleetServer {
  port: number;
  stop(): Promise<void>;
}

/**
 * Starts Fleet on `config`, resolving once the port is bound. `log` receives the startup lines — events root, URL,
 * and watch mode — and any later watcher degradation notices.
 */
export async function startFleetServer(input: {
  config: FleetConfig;
  log?: (message: string) => void;
}): Promise<RunningFleetServer> {
  const { config } = input;
  const log = input.log ?? ((message: string) => process.stderr.write(`fleet: ${message}\n`));

  const store = createEventStore({ eventsDir: config.eventsDir });
  const subscribers = new Set<(snapshot: FleetSnapshot) => void>();
  let lastPublishedJson: string;

  function buildCurrentSnapshot(): FleetSnapshot {
    return buildSnapshot(store.listLanes(), {
      closeAfterMs: config.closeAfterMs,
      nowMs: Date.now(),
      staleMs: config.staleMs,
    });
  }

  /** Folds pending events, then broadcasts — only when the snapshot actually changed. */
  function tick(): void {
    store.scanAndFold();
    const snapshot = buildCurrentSnapshot();
    const json = JSON.stringify(snapshot);
    if (json === lastPublishedJson) {
      return;
    }
    lastPublishedJson = json;
    for (const listener of subscribers) {
      listener(snapshot);
    }
  }

  store.scanAndFold();
  lastPublishedJson = JSON.stringify(buildCurrentSnapshot());

  const watcher = startWatcher({
    debounceMs: config.debounceMs,
    dir: config.eventsDir,
    log,
    onDirty: tick,
    rescanMs: config.rescanMs,
  });

  const app = createApp({
    getSnapshot: buildCurrentSnapshot,
    heartbeatMs: config.heartbeatMs,
    subscribe(listener) {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
  });

  const bound = Promise.withResolvers<number>();
  const server = serve({ fetch: app.fetch, port: config.port }, (info) => bound.resolve(info.port));
  const port = await bound.promise;

  log(`watching ${config.eventsDir}`);
  log(`serving http://localhost:${port}`);

  return {
    port,
    stop: async () => {
      watcher.stop();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error === undefined ? resolve() : reject(error)));
        // Open SSE connections would otherwise hold `close` forever.
        if ('closeAllConnections' in server) {
          server.closeAllConnections();
        }
      });
    },
  };
}
