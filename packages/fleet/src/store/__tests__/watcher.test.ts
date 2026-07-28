import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startWatcher, type Watcher, type WatchStarter } from '../watcher.ts';

interface WatcherOverrides {
  debounceMs?: number;
  dir?: string;
  rescanMs?: number;
  startWatch?: WatchStarter;
}

let dir: string;
let watchers: Watcher[];

/** A `WatchStarter` that records how it was driven, so tests exercise the watch contract without an OS watch. */
function createFakeWatch(): {
  emitError: (error: Error) => void;
  fireEvent: () => void;
  isClosed: () => boolean;
  isStarted: () => boolean;
  startWatch: WatchStarter;
} {
  let closed = false;
  let onError: ((error: Error) => void) | undefined;
  let onEvent: (() => void) | undefined;
  let started = false;

  return {
    emitError: (error) => onError?.(error),
    fireEvent: () => onEvent?.(),
    isClosed: () => closed,
    isStarted: () => started,
    startWatch: (_dir, event) => {
      started = true;
      onEvent = event;
      return {
        close: () => {
          closed = true;
        },
        on: (_event, listener) => {
          onError = listener;
        },
      };
    },
  };
}

/** Starts a watcher on a short rescan interval, registering it for cleanup. */
function startTestWatcher(overrides: WatcherOverrides = {}): {
  log: ReturnType<typeof vi.fn>;
  onDirty: ReturnType<typeof vi.fn>;
} {
  const log = vi.fn();
  const onDirty = vi.fn();
  watchers.push(startWatcher({ debounceMs: 5, dir, log, onDirty, rescanMs: 10, ...overrides }));
  return { log, onDirty };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'watcher-'));
  watchers = [];
});

afterEach(() => {
  for (const watcher of watchers) {
    watcher.stop();
  }
  rmSync(dir, { recursive: true, force: true });
});

describe('startWatcher', () => {
  it('logs the recursive-watch mode when the directory is watchable', () => {
    const { log } = startTestWatcher();

    expect(log).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('recursive watch active'));
  });

  it('fires onDirty on every rescan tick', async () => {
    const { onDirty } = startTestWatcher();

    await vi.waitFor(() => {
      expect(onDirty.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('when the directory does not exist, announces rescan-only mode and still rescans', async () => {
    const { log, onDirty } = startTestWatcher({ dir: join(dir, 'missing') });

    expect(log).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('rescan-only'));
    await vi.waitFor(() => {
      expect(onDirty).toHaveBeenCalled();
    });
  });

  it('when the directory does not exist, does not attempt a watch', () => {
    const fake = createFakeWatch();

    startTestWatcher({ dir: join(dir, 'missing'), startWatch: fake.startWatch });

    expect(fake.isStarted()).toBe(false);
  });

  it('when the watch fails to start, names the target and the reason', () => {
    const { log } = startTestWatcher({
      startWatch: () => {
        throw new Error('EPERM: operation not permitted');
      },
    });

    expect(log).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining(`cannot watch ${dir} (EPERM: operation not permitted); rescan-only`),
    );
  });

  it('stops firing after stop()', async () => {
    const { onDirty } = startTestWatcher();
    await vi.waitFor(() => {
      expect(onDirty).toHaveBeenCalled();
    });

    for (const watcher of watchers.splice(0)) {
      watcher.stop();
    }
    onDirty.mockClear();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(onDirty).not.toHaveBeenCalled();
  });
});
