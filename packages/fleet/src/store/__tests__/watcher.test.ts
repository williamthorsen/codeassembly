import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startWatcher, type Watcher } from '../watcher.ts';

let dir: string;
let watchers: Watcher[];

/** Starts a watcher on a short rescan interval, registering it for cleanup. */
function startTestWatcher(overrides: { dir?: string } = {}): {
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
