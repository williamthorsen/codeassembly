import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { silencedConsole } from '../../../test-utils.js';
import { ProjectWatcher } from '../project-watcher.js';

// Mock fs.watch
const mockClose = vi.fn();
const mockWatcher = {
  close: mockClose,
  on: vi.fn().mockReturnThis(),
};

type WatchCallback = (event: string, filename: string) => void;

const { mockedWatch } = vi.hoisted(() => ({
  mockedWatch: vi.fn<(path: string, options: { recursive: boolean }, cb: WatchCallback) => typeof mockWatcher>(),
}));

vi.mock('node:fs', () => ({
  default: { watch: mockedWatch },
  watch: mockedWatch,
}));

function getWatchCallback(): WatchCallback {
  const call = mockedWatch.mock.calls[0];
  if (!call) {
    throw new TypeError('Expected fs.watch to have been called');
  }
  return call[2];
}

function createMockScanner() {
  return {
    scan: vi.fn<() => Promise<{ projects: [] }>>().mockResolvedValue({ projects: [] }),
    getIndex: vi.fn().mockReturnValue(null),
    getBasePath: vi.fn().mockReturnValue('/test/projects'),
  };
}

describe('ProjectWatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockedWatch.mockReturnValue(mockWatcher);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls fs.watch with recursive option on start()', () => {
    using _silent = silencedConsole();
    const scanner = createMockScanner();
    const watcher = new ProjectWatcher(scanner);

    watcher.start();

    expect(mockedWatch).toHaveBeenCalledWith('/test/projects', { recursive: true }, expect.any(Function));

    watcher.stop();
  });

  it('triggers scanner.scan() after debounce delay on change event', async () => {
    using _silent = silencedConsole();
    const scanner = createMockScanner();
    const watcher = new ProjectWatcher(scanner);

    watcher.start();

    const watchCallback = getWatchCallback();
    watchCallback('rename', 'new-ticket');

    // Before debounce: scan should not have been called
    expect(scanner.scan).not.toHaveBeenCalled();

    // Advance past the 1-second debounce
    await vi.advanceTimersByTimeAsync(1000);

    expect(scanner.scan).toHaveBeenCalledOnce();

    watcher.stop();
  });

  it('debounces rapid changes into a single scan', async () => {
    using _silent = silencedConsole();
    const scanner = createMockScanner();
    const watcher = new ProjectWatcher(scanner);

    watcher.start();

    const watchCallback = getWatchCallback();

    // Fire multiple events in quick succession
    watchCallback('rename', 'file-1');
    await vi.advanceTimersByTimeAsync(200);
    watchCallback('rename', 'file-2');
    await vi.advanceTimersByTimeAsync(200);
    watchCallback('rename', 'file-3');

    // Advance past the debounce (1s from last event)
    await vi.advanceTimersByTimeAsync(1000);

    expect(scanner.scan).toHaveBeenCalledOnce();

    watcher.stop();
  });

  it('closes the watcher on stop()', () => {
    using _silent = silencedConsole();
    const scanner = createMockScanner();
    const watcher = new ProjectWatcher(scanner);

    watcher.start();
    watcher.stop();

    expect(mockClose).toHaveBeenCalledOnce();
  });

  it('handles stop() when not started', () => {
    const scanner = createMockScanner();
    const watcher = new ProjectWatcher(scanner);

    // Should not throw
    watcher.stop();
    expect(mockClose).not.toHaveBeenCalled();
  });

  it('logs error and continues when scanner.scan() rejects', async () => {
    using silent = silencedConsole();
    const scanner = createMockScanner();
    vi.mocked(scanner.scan).mockRejectedValueOnce(new Error('scan failed'));

    const watcher = new ProjectWatcher(scanner);
    watcher.start();

    const watchCallback = getWatchCallback();
    watchCallback('rename', 'new-file');

    await vi.advanceTimersByTimeAsync(1000);

    expect(silent.error).toHaveBeenCalledWith(expect.stringContaining('rescan'), expect.any(Error));

    watcher.stop();
  });
});
