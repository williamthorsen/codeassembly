// The composed server: config → store → watcher → app, plus the publish pipeline. Every trigger — a watch signal or
// a rescan tick — folds and then publishes through one JSON-diff gate, so a staleness threshold crossing broadcasts
// with no new event on disk, and a no-op scan broadcasts nothing.

import { resolveLaneCwd } from 'codeassembly-lifecycle';
import { serve } from '@hono/node-server';

import { createGitAdapter, type GitObservation, type GitTarget } from './adapters/git.ts';
import { createApp } from './api/app.ts';
import { buildSnapshot, type FleetSnapshot } from './api/snapshot.ts';
import { buildLaneKey } from './common/lane-key.ts';
import type { FleetConfig } from './config.ts';
import { createGithubAdapter } from './forge/github-adapter.ts';
import { startForgePoller } from './forge/poller.ts';
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
  /** Git-probe override; defaults to the real worktree probe. Tests inject it to drive observations deterministically. */
  gitProbe?: ((cwd: string) => Promise<GitObservation>) | undefined;
  log?: (message: string) => void;
}): Promise<RunningFleetServer> {
  const { config } = input;
  const log = input.log ?? ((message: string) => process.stderr.write(`fleet: ${message}\n`));

  const store = createEventStore({ eventsDir: config.eventsDir, retentionMs: config.retentionMs });
  const subscribers = new Set<(snapshot: FleetSnapshot) => void>();
  let lastPublishedJson: string;

  function buildCurrentSnapshot(): FleetSnapshot {
    return buildSnapshot(store.listLanes(), {
      closeAfterMs: config.closeAfterMs,
      nowMs: Date.now(),
      observations: gitAdapter.getObservations(),
      staleMs: config.staleMs,
      forge: (repo, branch) => poller.getFacts(repo, branch),
    });
  }

  /** The worktree of every lane that names one — what the git adapter polls. */
  function listGitTargets(): GitTarget[] {
    return store.listLanes().flatMap((lane) => {
      const cwd = resolveLaneCwd(lane);
      return cwd === undefined ? [] : [{ laneKey: buildLaneKey(lane), cwd }];
    });
  }

  /** Folds pending events, then broadcasts — only when the snapshot actually changed. */
  function tick(): void {
    store.scanAndFold(Date.now());
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

  // A disabled forge yields no adapter; the poller is then inert and every lane's `forge` stays null.
  const adapter = config.forge === 'none' ? undefined : createGithubAdapter();
  const poller = startForgePoller({
    adapter,
    intervalMs: config.forgePollMs,
    listLanes: () => store.listLanes(),
    log,
    now: () => Date.now(),
    onUpdate: tick,
  });

  store.scanAndFold(Date.now());
  const gitAdapter = createGitAdapter({
    listTargets: listGitTargets,
    onChange: tick,
    pollMs: config.gitPollMs,
    // Omit rather than pass undefined, so createGitAdapter applies its probeWorktree default on the production path.
    ...(input.gitProbe !== undefined && { probe: input.gitProbe }),
  });
  lastPublishedJson = JSON.stringify(buildCurrentSnapshot());
  // Kick an initial round so forge facts populate promptly rather than after the first interval.
  void poller.tick();

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
      gitAdapter.stop();
      poller.stop();
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
