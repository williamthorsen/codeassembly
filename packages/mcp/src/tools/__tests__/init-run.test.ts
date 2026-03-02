import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { v3RunIndexSchema } from '@codeassembly/run-core';
import { describe, expect, it } from 'vitest';

import { initRun } from '../init-run.js';

describe('initRun', () => {
  async function createTmpDir(): Promise<string> {
    return mkdtemp(join(tmpdir(), 'mcp-test-init-'));
  }

  it('creates runDir and returns runId, ticketId, and timestamp', async () => {
    const projectRoot = await createTmpDir();
    const result = await initRun({
      projectSlug: 'test-project',
      projectRoot,
      branch: 'main',
      task: 'implement feature',
    });

    expect(result.runId).toMatch(/^test-project\.\d{8}-\d{6}Z$/);
    expect(result.runDir).toContain('.ai/runs/');
    expect(result.ticketId).toBeTruthy();
    expect(result.timestamp).toBeTruthy();
  });

  it('nests runDir under ticketId when provided', async () => {
    const projectRoot = await createTmpDir();
    const result = await initRun({
      projectSlug: 'test-project',
      ticketId: 'PROJ-42',
      projectRoot,
      branch: 'main',
      task: 'implement feature',
    });

    expect(result.runDir).toContain('.ai/runs/PROJ-42/');
    expect(result.ticketId).toBe('PROJ-42');
  });

  it('auto-generates ticketId and nests runDir under it when not provided', async () => {
    const projectRoot = await createTmpDir();
    const result = await initRun({
      projectSlug: 'test-project',
      projectRoot,
      branch: 'main',
      task: 'implement feature',
    });

    // Auto-generated format: {YYYYMMDD-HHMM}Z-{4 hex chars}
    expect(result.ticketId).toMatch(/^\d{8}-\d{4}Z-[0-9a-f]{4}$/);
    expect(result.runDir).toContain(`.ai/runs/${result.ticketId}/`);
  });

  it('writes a valid v3 run-index.json', async () => {
    const projectRoot = await createTmpDir();
    const result = await initRun({
      projectSlug: 'test-project',
      ticketId: 'PROJ-42',
      projectRoot,
      branch: 'feature/test',
      task: 'add tests',
    });

    const indexContent = await readFile(join(result.runDir, 'run-index.json'), 'utf8');
    const parsed: unknown = JSON.parse(indexContent);

    const v3Result = v3RunIndexSchema.safeParse(parsed);
    expect(v3Result.success).toBe(true);

    if (v3Result.success) {
      expect(v3Result.data.version).toBe(3);
      expect(v3Result.data.context.runId).toBe(result.runId);
      expect(v3Result.data.context.projectSlug).toBe('test-project');
      expect(v3Result.data.context.ticketId).toBe('PROJ-42');
      expect(v3Result.data.context.branch).toBe('feature/test');
      expect(v3Result.data.context.task).toBe('add tests');
    }
  });

  it('creates run-log.jsonl with a run_started event', async () => {
    const projectRoot = await createTmpDir();
    const result = await initRun({
      projectSlug: 'test-project',
      projectRoot,
      branch: 'main',
      task: 'test task',
    });

    const logContent = await readFile(join(result.runDir, 'run-log.jsonl'), 'utf8');
    const lines = logContent.trim().split('\n');
    expect(lines).toHaveLength(1);

    const firstLine = lines[0];
    if (firstLine === undefined) throw new Error('Expected at least one line');
    const event: unknown = JSON.parse(firstLine);
    expect(event).toMatchObject({ event: 'run_started' });
    expect(event).toHaveProperty('t');
  });

  it('writes pipeline and models into config block', async () => {
    const projectRoot = await createTmpDir();
    const result = await initRun({
      projectSlug: 'test-project',
      projectRoot,
      branch: 'main',
      task: 'test task',
      pipeline: ['plan', 'implement', 'review'],
      models: { primary: 'claude-opus-4-6' },
    });

    const indexContent = await readFile(join(result.runDir, 'run-index.json'), 'utf8');
    const parsed: unknown = JSON.parse(indexContent);
    expect(parsed).toMatchObject({
      config: {
        pipeline: ['plan', 'implement', 'review'],
        models: { primary: 'claude-opus-4-6' },
      },
    });
  });

  it('auto-generates ticketId in run-index.json when not provided', async () => {
    const projectRoot = await createTmpDir();
    const result = await initRun({
      projectSlug: 'test-project',
      projectRoot,
      branch: 'main',
      task: 'test task',
    });

    const indexContent = await readFile(join(result.runDir, 'run-index.json'), 'utf8');
    const parsed: unknown = JSON.parse(indexContent);
    expect(parsed).toHaveProperty('context.ticketId', result.ticketId);
  });

  it('rejects when the project root cannot be written to', async () => {
    // Create a regular file where mkdir expects to create a directory, causing ENOTDIR
    const blocker = join(tmpdir(), 'mcp-test-blocker-' + Date.now().toString());
    await writeFile(blocker, 'not a directory');

    await expect(
      initRun({
        projectSlug: 'test-project',
        projectRoot: blocker,
        branch: 'main',
        task: 'test task',
      }),
    ).rejects.toThrow(/ENOTDIR/);
  });
});
