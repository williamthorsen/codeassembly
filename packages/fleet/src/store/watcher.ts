// Dirty-signal source for the store: a recursive `fs.watch` for low latency, debounced so a burst signals once, with
// an always-on rescan interval as the correctness backstop. Watching is best-effort — recursive support varies by
// platform, and a watch can fail mid-run — so degradation to rescan-only is announced, never silent, and never fatal.

import { statSync, watch } from 'node:fs';

import { describeError } from '@williamthorsen/toolbelt.errors';

/** A running watcher; `stop` releases the watch handle and every timer. */
export interface Watcher {
  stop(): void;
}

/** The subset of a watch handle this module uses: stopping it, and learning that it failed. */
export interface WatchHandle {
  close(): void;
  on(event: 'error', listener: (error: Error) => void): unknown;
}

/** Starts a recursive watch on `dir`, invoking `onEvent` for every filesystem event. */
export type WatchStarter = (dir: string, onEvent: () => void) => WatchHandle;

/**
 * Starts watching `dir`, invoking `onDirty` on debounced watch events and on every rescan tick. `log` receives one
 * startup line naming the active mode — recursive watch or rescan-only, with the reason — and a line on any later
 * downgrade. `startWatch` is injectable for tests and defaults to {@link startRecursiveWatch}.
 */
export function startWatcher(input: {
  debounceMs: number;
  dir: string;
  log: (message: string) => void;
  onDirty: () => void;
  rescanMs: number;
  startWatch?: WatchStarter;
}): Watcher {
  const startWatch = input.startWatch ?? startRecursiveWatch;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let watcher: WatchHandle | undefined;

  function handleWatchEvent(): void {
    if (debounce !== undefined) {
      return;
    }
    debounce = setTimeout(() => {
      debounce = undefined;
      input.onDirty();
    }, input.debounceMs);
  }

  try {
    // `fs.watch` reports a missing target inconsistently across platforms, returning an inert watcher on Linux, so its
    // not throwing is no evidence that the watch is live.
    statSync(input.dir);
    watcher = startWatch(input.dir, handleWatchEvent);
    watcher.on('error', (error) => {
      // A mid-run watch error — the tree removed, an OS watch limit — must not crash the server; the rescan
      // interval keeps state current.
      input.log(`watch error (${error.message}); downgrading to rescan-only every ${input.rescanMs}ms`);
      watcher?.close();
      watcher = undefined;
    });
    input.log(`recursive watch active on ${input.dir}; rescan backstop every ${input.rescanMs}ms`);
  } catch (error) {
    input.log(`cannot watch ${input.dir} (${describeError(error)}); rescan-only every ${input.rescanMs}ms`);
  }

  const rescanTimer = setInterval(() => input.onDirty(), input.rescanMs);

  return {
    stop(): void {
      clearInterval(rescanTimer);
      if (debounce !== undefined) {
        clearTimeout(debounce);
      }
      watcher?.close();
    },
  };
}

// region | Helpers

/** Starts Node's recursive watch on `dir`. */
function startRecursiveWatch(dir: string, onEvent: () => void): WatchHandle {
  return watch(dir, { recursive: true }, onEvent);
}

// endregion | Helpers
