import { describe, expect, it, vi } from 'vitest';

import { validateRunDirectory } from '../run-directory-validator.js';

const { mockedReadFile } = vi.hoisted(() => ({
  mockedReadFile: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  default: { readFile: mockedReadFile },
  readFile: mockedReadFile,
}));

function mockFileContents(pathContentMap: Record<string, string>): void {
  mockedReadFile.mockImplementation((path: string) => {
    const content = pathContentMap[path];
    if (content !== undefined) {
      return Promise.resolve(content);
    }
    const error = new Error(`ENOENT: no such file or directory, open '${path}'`);
    Object.assign(error, { code: 'ENOENT' });
    return Promise.reject(error);
  });
}

function mockEnoent(): void {
  const error = new Error('ENOENT: no such file or directory');
  Object.assign(error, { code: 'ENOENT' });
  mockedReadFile.mockRejectedValue(error);
}

function minimalV2(): Record<string, unknown> {
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

function minimalV1(): Record<string, unknown> {
  return {
    runId: 'test-run',
    projectSlug: 'test',
    projectRoot: '/test',
    branch: 'main',
    task: 'test task',
    startedAt: '2026-01-01T00:00:00Z',
    status: 'in_progress',
    phases: {},
  };
}

function minimalV3Header(): Record<string, unknown> {
  return {
    version: 3,
    context: {
      runId: 'v3-test-run',
      projectSlug: 'test',
      projectRoot: '/test',
      branch: 'main',
      task: 'test task',
      startedAt: '2026-01-01T00:00:00Z',
    },
    config: { mode: 'orchestrated', model: 'claude-opus-4-6' },
  };
}

describe('validateRunDirectory', () => {
  it('returns valid result for a v2 run directory', async () => {
    mockFileContents({
      '/runs/test-run/run-index.json': JSON.stringify(minimalV2()),
    });

    const result = await validateRunDirectory('/runs/test-run');

    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.status.runId).toBe('test-run');
  });

  it('returns valid result for a v1 run directory', async () => {
    mockFileContents({
      '/runs/test-run/status.json': JSON.stringify(minimalV1()),
    });

    const result = await validateRunDirectory('/runs/test-run');

    expect(result.valid).toBe(true);
  });

  it('returns valid result for a v3 run directory', async () => {
    const logContent = [
      JSON.stringify({ t: '2026-01-01T00:00:00Z', event: 'run_started' }),
      JSON.stringify({ t: '2026-01-01T00:01:00Z', event: 'run_completed', status: 'completed' }),
    ].join('\n');

    mockFileContents({
      '/runs/test-run/run-index.json': JSON.stringify(minimalV3Header()),
      '/runs/test-run/run-log.jsonl': logContent,
    });

    const result = await validateRunDirectory('/runs/test-run');

    expect(result.valid).toBe(true);
  });

  it('returns "missing run-index.json" when neither file exists', async () => {
    mockEnoent();

    const result = await validateRunDirectory('/runs/test-run');

    expect(result).toEqual({ valid: false, reason: 'missing run-index.json' });
  });

  it('returns "missing run-log.jsonl" for v3 without companion log', async () => {
    mockFileContents({
      '/runs/test-run/run-index.json': JSON.stringify(minimalV3Header()),
    });

    const result = await validateRunDirectory('/runs/test-run');

    expect(result).toEqual({ valid: false, reason: 'missing run-log.jsonl' });
  });

  it('returns "corrupt JSON" for invalid JSON in run-index.json', async () => {
    mockFileContents({
      '/runs/test-run/run-index.json': '{ not valid json !!!',
    });

    const result = await validateRunDirectory('/runs/test-run');

    expect(result).toEqual({ valid: false, reason: 'corrupt JSON' });
  });

  it('returns "invalid schema" for valid JSON with wrong schema', async () => {
    mockFileContents({
      '/runs/test-run/run-index.json': JSON.stringify({ version: 2, wrong: 'schema' }),
    });

    const result = await validateRunDirectory('/runs/test-run');

    expect(result).toEqual({ valid: false, reason: 'invalid schema' });
  });

  it('rethrows unexpected errors (non-parse, non-ENOENT)', async () => {
    const permError = new Error('EACCES: permission denied');
    Object.assign(permError, { code: 'EACCES' });
    mockedReadFile.mockRejectedValue(permError);

    await expect(validateRunDirectory('/runs/test-run')).rejects.toThrow('EACCES');
  });
});
