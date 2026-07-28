// Dirty-signal source for the store: a recursive `fs.watch` for low latency, debounced so a burst signals once, with
// an always-on rescan interval as the correctness backstop. Watching is best-effort — recursive support varies by
// platform, and a watch can fail mid-run — so degradation to rescan-only is announced, never silent, and never fatal.

import { type FSWatcher, statSync, watch } from 'node:fs';

/** A running watcher; `stop` releases the watch handle and every timer. */
export interface Watcher {
  stop(): void;
}

/**
 * Starts watching `dir`, invoking `onDirty` on debounced watch events and on every rescan tick. `log` receives one
 * startup line naming the active mode — recursive watch or rescan-only, with the reason — and a line on any later
 * downgrade.
 */
export function startWatcher(input: {
  debounceMs: number;
  dir: string;
  log: (message: string) => void;
  onDirty: () => void;
  rescanMs: number;
}): Watcher {
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let watcher: FSWatcher | undefined;

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
    watcher = watch(input.dir, { recursive: true }, handleWatchEvent);
    watcher.on('error', (error) => {
      // A mid-run watch error — the tree removed, an OS watch limit — must not crash the server; the rescan
      // interval keeps state current.
      input.log(`watch error (${error.message}); downgrading to rescan-only every ${input.rescanMs}ms`);
      watcher?.close();
      watcher = undefined;
    });
    input.log(`recursive watch active on ${input.dir}; rescan backstop every ${input.rescanMs}ms`);
  } catch (error) {
    input.log(`cannot watch ${input.dir} (${readMessage(error)}); rescan-only every ${input.rescanMs}ms`);
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

/** The human-readable message carried by a thrown value. */
function readMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// endregion | Helpers
