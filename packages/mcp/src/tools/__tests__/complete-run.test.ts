import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { completeRun } from '../complete-run.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

describe('completeRun', () => {
  async function createRunDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'mcp-test-complete-'));
    const runIndex = {
      version: 3,
      context: {
        runId: 'test.20260101-000000Z',
        projectSlug: 'test',
        projectRoot: '/test',
        branch: 'main',
        task: 'test task',
        startedAt: '2026-01-01T00:00:00Z',
      },
      config: {},
    };
    await writeFile(join(dir, 'run-index.json'), JSON.stringify(runIndex, null, 2));
    await writeFile(join(dir, 'run-log.jsonl'), '');
    return dir;
  }

  it('appends a run_completed event to JSONL', async () => {
    const runDir = await createRunDir();
    const result = await completeRun({ runDir, status: 'completed' });

    expect(result.success).toBe(true);

    const content = await readFile(join(runDir, 'run-log.jsonl'), 'utf8');
    const event: unknown = JSON.parse(content.trim());
    expect(isRecord(event)).toBe(true);
    if (!isRecord(event)) return;
    expect(event.event).toBe('run_completed');
    expect(event.status).toBe('completed');
  });

  it('stamps completedAt on run-index.json', async () => {
    const runDir = await createRunDir();
    await completeRun({ runDir, status: 'completed' });

    const indexContent = await readFile(join(runDir, 'run-index.json'), 'utf8');
    const parsed: unknown = JSON.parse(indexContent);
    expect(isRecord(parsed)).toBe(true);
    if (!isRecord(parsed)) return;
    expect(typeof parsed.completedAt).toBe('string');
  });

  it('rejects in_progress status', async () => {
    const runDir = await createRunDir();
    const result = await completeRun({ runDir, status: 'in_progress' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('must be one of');
  });

  it('accepts failed status', async () => {
    const runDir = await createRunDir();
    const result = await completeRun({ runDir, status: 'failed' });

    expect(result.success).toBe(true);

    const content = await readFile(join(runDir, 'run-log.jsonl'), 'utf8');
    const event: unknown = JSON.parse(content.trim());
    expect(isRecord(event)).toBe(true);
    if (!isRecord(event)) return;
    expect(event.status).toBe('failed');
  });

  it('accepts needs_manual_review status', async () => {
    const runDir = await createRunDir();
    const result = await completeRun({ runDir, status: 'needs_manual_review' });

    expect(result.success).toBe(true);

    const content = await readFile(join(runDir, 'run-log.jsonl'), 'utf8');
    const event: unknown = JSON.parse(content.trim());
    expect(isRecord(event)).toBe(true);
    if (!isRecord(event)) return;
    expect(event.status).toBe('needs_manual_review');
  });

  it('rejects when run-index.json is missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mcp-test-complete-'));
    // Create run-log.jsonl but not run-index.json
    await writeFile(join(dir, 'run-log.jsonl'), '');

    await expect(completeRun({ runDir: dir, status: 'completed' })).rejects.toThrow();
  });
});
