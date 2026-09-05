import { silenceConsole } from '@williamthorsen/toolbelt.vitest/candidate';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { findRunIndexFiles, main, reportResults, validateFile, type ValidationResult } from '../validate-run-index.ts';

const { mockedReadFile, mockedReaddir, mockedStat } = vi.hoisted(() => ({
  mockedReadFile: vi.fn(),
  mockedReaddir: vi.fn(),
  mockedStat: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  default: { readFile: mockedReadFile, readdir: mockedReaddir, stat: mockedStat },
  readFile: mockedReadFile,
  readdir: mockedReaddir,
  stat: mockedStat,
}));

function minimalValid(): Record<string, unknown> & { context: Record<string, unknown> } {
  return {
    version: 2,
    context: {
      runId: 'test-run',
      projectSlug: 'test',
      projectRoot: '/test',
      branch: 'main',
      task: 'test task',
      startedAt: '2026-01-01T00:00:00Z',
      status: 'in_progress',
      phases: {},
    },
    config: {},
  };
}

/** Creates a minimal Dirent-like object suitable for mocked readdir results. */
function makeDirent(
  name: string,
  isDir: boolean,
): {
  name: string;
  isDirectory: () => boolean;
  isFile: () => boolean;
} {
  return {
    name,
    isDirectory: () => isDir,
    isFile: () => !isDir,
  };
}

/** Creates a minimal Stats-like object suitable for mocked stat results. */
function makeStats(isDir: boolean): { isDirectory: () => boolean } {
  return { isDirectory: () => isDir };
}

afterEach(() => {
  vi.restoreAllMocks();
});

// -- validateFile --

describe('validateFile', () => {
  it('returns valid result for correct run-index.json', async () => {
    mockedReadFile.mockResolvedValue(JSON.stringify(minimalValid()));

    const result = await validateFile('/path/to/run-index.json');

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.filePath).toBe('/path/to/run-index.json');
  });

  it('returns invalid result with field paths for bad data', async () => {
    const bad = { ...minimalValid(), version: 1 };
    mockedReadFile.mockResolvedValue(JSON.stringify(bad));

    const result = await validateFile('/path/to/run-index.json');

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('includes field path in error message for nested failures', async () => {
    const base = minimalValid();
    const bad = { ...base, context: { ...base.context, status: 'unknown' } };
    mockedReadFile.mockResolvedValue(JSON.stringify(bad));

    const result = await validateFile('/path/to/run-index.json');

    expect(result.valid).toBe(false);
    const joined = result.errors.join('\n');
    expect(joined).toContain('context.status');
  });

  it('throws on invalid JSON', async () => {
    mockedReadFile.mockResolvedValue('not json');

    await expect(validateFile('/path/to/run-index.json')).rejects.toThrow();
  });

  it('formats error without path prefix for top-level failures', async () => {
    mockedReadFile.mockResolvedValue(JSON.stringify(null));

    const result = await validateFile('/path/to/run-index.json');

    expect(result.valid).toBe(false);
    // Top-level error should not have a ":" prefix from an empty path
    for (const error of result.errors) {
      expect(error).not.toMatch(/^\s+:/);
    }
  });
});

// -- findRunIndexFiles --

describe('findRunIndexFiles', () => {
  it('finds run-index.json files in nested subdirectories', async () => {
    // /root
    //   /a/run-index.json
    //   /b/c/run-index.json
    //   /other.json
    mockedReaddir
      .mockResolvedValueOnce([makeDirent('a', true), makeDirent('b', true), makeDirent('other.json', false)])
      .mockResolvedValueOnce([makeDirent('run-index.json', false)])
      .mockResolvedValueOnce([makeDirent('c', true)])
      .mockResolvedValueOnce([makeDirent('run-index.json', false)]);

    const result = await findRunIndexFiles('/root');

    expect(result).toEqual(['/root/a/run-index.json', '/root/b/c/run-index.json']);
  });

  it('returns empty array for directory with no matching files', async () => {
    mockedReaddir.mockResolvedValueOnce([makeDirent('status.json', false), makeDirent('config.yaml', false)]);

    const result = await findRunIndexFiles('/root');

    expect(result).toEqual([]);
  });

  it('returns empty array for empty directory', async () => {
    mockedReaddir.mockResolvedValueOnce([]);

    const result = await findRunIndexFiles('/root');

    expect(result).toEqual([]);
  });

  it('sorts results alphabetically', async () => {
    // /root
    //   /z/run-index.json
    //   /a/run-index.json
    mockedReaddir
      .mockResolvedValueOnce([makeDirent('z', true), makeDirent('a', true)])
      .mockResolvedValueOnce([makeDirent('run-index.json', false)])
      .mockResolvedValueOnce([makeDirent('run-index.json', false)]);

    const result = await findRunIndexFiles('/root');

    expect(result).toEqual(['/root/a/run-index.json', '/root/z/run-index.json']);
  });

  it('logs warning and continues when readdir fails for a subdirectory', async () => {
    using silent = silenceConsole(['error']);

    mockedReaddir
      .mockResolvedValueOnce([makeDirent('accessible', true), makeDirent('denied', true)])
      .mockResolvedValueOnce([makeDirent('run-index.json', false)])
      .mockRejectedValueOnce(new Error('EACCES: permission denied'));

    const result = await findRunIndexFiles('/root');

    expect(result).toEqual(['/root/accessible/run-index.json']);
    expect(silent.error).toHaveBeenCalledWith(expect.stringContaining('cannot read directory /root/denied'));
  });
});

// -- reportResults --

describe('reportResults', () => {
  it('handles empty results array', () => {
    using silent = silenceConsole(['info']);

    const results: ValidationResult[] = [];

    const failCount = reportResults(results);

    expect(failCount).toBe(0);
    expect(silent.info).toHaveBeenCalledWith(expect.stringContaining('0 passed, 0 failed out of 0'));
  });

  it('reports passing files', () => {
    using silent = silenceConsole(['info']);

    const results: ValidationResult[] = [{ filePath: '/a/run-index.json', valid: true, errors: [] }];

    const failCount = reportResults(results);

    expect(failCount).toBe(0);
    expect(silent.info).toHaveBeenCalledWith(expect.stringContaining('PASS'));
    expect(silent.info).toHaveBeenCalledWith(expect.stringContaining('1 passed, 0 failed'));
  });

  it('reports failing files with errors', () => {
    using silent = silenceConsole(['info']);

    const results: ValidationResult[] = [
      { filePath: '/a/run-index.json', valid: false, errors: ['  context.status: bad'] },
    ];

    const failCount = reportResults(results);

    expect(failCount).toBe(1);
    expect(silent.info).toHaveBeenCalledWith(expect.stringContaining('FAIL'));
    expect(silent.info).toHaveBeenCalledWith(expect.stringContaining('0 passed, 1 failed'));
  });

  it('reports correct summary for mixed results', () => {
    using silent = silenceConsole(['info']);

    const results: ValidationResult[] = [
      { filePath: '/a/run-index.json', valid: true, errors: [] },
      { filePath: '/b/run-index.json', valid: false, errors: ['  error'] },
      { filePath: '/c/run-index.json', valid: true, errors: [] },
    ];

    const failCount = reportResults(results);

    expect(failCount).toBe(1);
    expect(silent.info).toHaveBeenCalledWith(expect.stringContaining('2 passed, 1 failed out of 3'));
  });
});

// -- main CLI entry point --

describe('main', () => {
  let originalArgv: string[];

  afterEach(() => {
    process.argv = originalArgv;
    process.exitCode = undefined;
  });

  function setArgs(...args: string[]): void {
    originalArgv = process.argv;
    process.argv = ['node', 'validate-run-index.ts', ...args];
  }

  it('sets exitCode=1 and prints usage when no argument provided', async () => {
    originalArgv = process.argv;
    process.argv = ['node', 'validate-run-index.ts'];
    using silent = silenceConsole(['error']);

    await main();

    expect(process.exitCode).toBe(1);
    expect(silent.error).toHaveBeenCalledWith(expect.stringContaining('Usage'));
  });

  it('sets exitCode=1 when path does not exist', async () => {
    setArgs('/nonexistent');
    mockedStat.mockRejectedValue(new Error('ENOENT: no such file'));
    using silent = silenceConsole(['error']);

    await main();

    expect(process.exitCode).toBe(1);
    expect(silent.error).toHaveBeenCalledWith(expect.stringContaining('Cannot access path /nonexistent'));
  });

  it('includes error message when stat fails with permission error', async () => {
    setArgs('/restricted');
    mockedStat.mockRejectedValue(new Error('EACCES: permission denied'));
    using silent = silenceConsole(['error']);

    await main();

    expect(process.exitCode).toBe(1);
    expect(silent.error).toHaveBeenCalledWith(expect.stringContaining('EACCES'));
  });

  it('exits 0 for directory with no run-index.json files', async () => {
    setArgs('/empty-dir');
    mockedStat.mockResolvedValue(makeStats(true));
    mockedReaddir.mockResolvedValue([]);
    using _silent = silenceConsole(['info']);

    await main();

    expect(process.exitCode).toBeUndefined();
  });

  it('exits 0 for directory with valid files', async () => {
    setArgs('/dir');
    mockedStat.mockResolvedValue(makeStats(true));
    mockedReaddir.mockResolvedValue([makeDirent('run-index.json', false)]);
    mockedReadFile.mockResolvedValue(JSON.stringify(minimalValid()));
    using _silent = silenceConsole(['info']);

    await main();

    expect(process.exitCode).toBeUndefined();
  });

  it('sets exitCode=1 for directory with invalid files', async () => {
    setArgs('/dir');
    mockedStat.mockResolvedValue(makeStats(true));
    mockedReaddir.mockResolvedValue([makeDirent('run-index.json', false)]);
    mockedReadFile.mockResolvedValue(JSON.stringify({ version: 1 }));
    using _silent = silenceConsole(['info']);

    await main();

    expect(process.exitCode).toBe(1);
  });

  it('exits 0 for single valid file', async () => {
    setArgs('/path/run-index.json');
    mockedStat.mockResolvedValue(makeStats(false));
    mockedReadFile.mockResolvedValue(JSON.stringify(minimalValid()));
    using _silent = silenceConsole(['info']);

    await main();

    expect(process.exitCode).toBeUndefined();
  });

  it('sets exitCode=1 for single invalid file', async () => {
    setArgs('/path/run-index.json');
    mockedStat.mockResolvedValue(makeStats(false));
    mockedReadFile.mockResolvedValue(JSON.stringify({ version: 1 }));
    using _silent = silenceConsole(['info']);

    await main();

    expect(process.exitCode).toBe(1);
  });

  it('reports Invalid JSON prefix when file contains malformed JSON', async () => {
    setArgs('/path/run-index.json');
    mockedStat.mockResolvedValue(makeStats(false));
    mockedReadFile.mockResolvedValue('not valid json');
    using silent = silenceConsole(['info']);

    await main();

    expect(process.exitCode).toBe(1);
    const allCalls = silent.info.mock.calls.flat().join(' ');
    expect(allCalls).toContain('Invalid JSON');
  });

  it('reports Read error prefix when readFile throws a non-JSON error', async () => {
    setArgs('/path/run-index.json');
    mockedStat.mockResolvedValue(makeStats(false));
    mockedReadFile.mockRejectedValue(new Error('EACCES: permission denied'));
    using silent = silenceConsole(['info']);

    await main();

    expect(process.exitCode).toBe(1);
    const allCalls = silent.info.mock.calls.flat().join(' ');
    expect(allCalls).toContain('Read error');
  });
});
