import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { completeRun } from '../complete-run.js';

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
    expect(event).toMatchObject({ event: 'run_completed', status: 'completed' });
  });

  it('stamps completedAt on run-index.json', async () => {
    const runDir = await createRunDir();
    await completeRun({ runDir, status: 'completed' });

    const indexContent = await readFile(join(runDir, 'run-index.json'), 'utf8');
    const parsed: unknown = JSON.parse(indexContent);
    expect(parsed).toMatchObject({ completedAt: expect.any(String) });
  });

  it('rejects in_progress status', async () => {
    const runDir = await createRunDir();
    const result = await completeRun({ runDir, status: 'in_progress' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('must be one of');
  });

  it('emits run_failed event when status is failed', async () => {
    const runDir = await createRunDir();
    const result = await completeRun({ runDir, status: 'failed' });

    expect(result.success).toBe(true);

    const content = await readFile(join(runDir, 'run-log.jsonl'), 'utf8');
    const event: unknown = JSON.parse(content.trim());
    expect(event).toMatchObject({ event: 'run_failed', status: 'failed' });
    expect(event).not.toHaveProperty('reason');
  });

  it('includes reason in run_failed event', async () => {
    const runDir = await createRunDir();
    const result = await completeRun({ runDir, status: 'failed', reason: 'TypeScript compilation errors' });

    expect(result.success).toBe(true);

    const content = await readFile(join(runDir, 'run-log.jsonl'), 'utf8');
    const event: unknown = JSON.parse(content.trim());
    expect(event).toMatchObject({ event: 'run_failed', status: 'failed', reason: 'TypeScript compilation errors' });
  });

  it('ignores reason when status is not failed', async () => {
    const runDir = await createRunDir();
    const result = await completeRun({ runDir, status: 'completed', reason: 'should be ignored' });

    expect(result.success).toBe(true);

    const content = await readFile(join(runDir, 'run-log.jsonl'), 'utf8');
    const event: unknown = JSON.parse(content.trim());
    expect(event).toMatchObject({ event: 'run_completed', status: 'completed' });
    expect(event).not.toHaveProperty('reason');
  });

  it('accepts needs_manual_review status', async () => {
    const runDir = await createRunDir();
    const result = await completeRun({ runDir, status: 'needs_manual_review' });

    expect(result.success).toBe(true);

    const content = await readFile(join(runDir, 'run-log.jsonl'), 'utf8');
    const event: unknown = JSON.parse(content.trim());
    expect(event).toMatchObject({ event: 'run_completed', status: 'needs_manual_review' });
  });

  it('rejects when run-index.json is missing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mcp-test-complete-'));
    // Create run-log.jsonl but not run-index.json
    await writeFile(join(dir, 'run-log.jsonl'), '');

    await expect(completeRun({ runDir: dir, status: 'completed' })).rejects.toThrow(/ENOENT/);
  });
});
