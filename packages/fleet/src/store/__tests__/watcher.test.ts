import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it, onTestFinished, vi } from 'vitest';

import { startWatcher, type WatchStarter } from '../watcher.ts';

interface WatcherOverrides {
  debounceMs?: number;
  dir?: string;
  rescanMs?: number;
  startWatch?: WatchStarter;
}

describe('startWatcher', () => {
  it('logs the recursive-watch mode when the directory is watchable', () => {
    const { log } = startTestWatcher();

    expect(log).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('recursive watch active'));
  });

  it('fires onDirty on every rescan tick', async () => {
    const { onDirty } = startTestWatcher({ startWatch: createFakeWatch().startWatch });

    await vi.waitFor(() => {
      expect(onDirty.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('collapses a burst of watch events into one onDirty', async () => {
    const fake = createFakeWatch();
    // The rescan interval fires the same callback, so it is pushed past this test's lifetime to leave the count
    // attributable to the burst alone.
    const { onDirty } = startTestWatcher({ rescanMs: 60_000, startWatch: fake.startWatch });

    fake.fireEvent();
    fake.fireEvent();
    fake.fireEvent();
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(onDirty).toHaveBeenCalledOnce();
  });

  it('when the watch emits an error, announces the downgrade and closes the handle', () => {
    const fake = createFakeWatch();
    const { log } = startTestWatcher({ startWatch: fake.startWatch });
    log.mockClear();

    fake.emitError(new Error('EMFILE: too many open files'));

    expect(log).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('downgrading to rescan-only'));
    expect(fake.isClosed()).toBe(true);
  });

  it('when the directory does not exist, announces rescan-only mode and still rescans', async () => {
    const { log, onDirty } = startTestWatcher({ dir: join(createTempDir(), 'missing') });

    expect(log).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('rescan-only'));
    await vi.waitFor(() => {
      expect(onDirty).toHaveBeenCalled();
    });
  });

  it('when the directory does not exist, does not attempt a watch', () => {
    const fake = createFakeWatch();

    startTestWatcher({ dir: join(createTempDir(), 'missing'), startWatch: fake.startWatch });

    expect(fake.isStarted()).toBe(false);
  });

  it('when the watch fails to start, names the target and the reason', () => {
    const dir = createTempDir();

    const { log } = startTestWatcher({
      dir,
      startWatch: () => {
        throw new Error('EPERM: operation not permitted');
      },
    });

    expect(log).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining(`cannot watch ${dir} (EPERM: operation not permitted); rescan-only`),
    );
  });

  it('stops firing after stop()', async () => {
    const { onDirty, stop } = startTestWatcher({ startWatch: createFakeWatch().startWatch });
    await vi.waitFor(() => {
      expect(onDirty).toHaveBeenCalled();
    });

    stop();
    onDirty.mockClear();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(onDirty).not.toHaveBeenCalled();
  });
});

// region | Helpers

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

/** Creates a temp directory for the current test, removed when the test finishes. */
function createTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'watcher-'));
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** Starts a watcher on a short rescan interval, stopped when the current test finishes. */
function startTestWatcher(overrides: WatcherOverrides = {}): {
  log: ReturnType<typeof vi.fn>;
  onDirty: ReturnType<typeof vi.fn>;
  stop: () => void;
} {
  const dir = overrides.dir ?? createTempDir();
  const log = vi.fn();
  const onDirty = vi.fn();
  const watcher = startWatcher({ debounceMs: 5, dir, log, onDirty, rescanMs: 10, ...overrides });
  onTestFinished(() => watcher.stop());
  return { log, onDirty, stop: () => watcher.stop() };
}

// endregion | Helpers
