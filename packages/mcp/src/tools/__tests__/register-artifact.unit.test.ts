import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { registerArtifact } from '../register-artifact.ts';

describe('registerArtifact', () => {
  async function createRunDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'mcp-test-artifact-'));
    await writeFile(join(dir, 'run-log.jsonl'), '');
    return dir;
  }

  it('appends an artifact_written event to JSONL', async () => {
    const runDir = await createRunDir();
    const result = await registerArtifact({
      runDir,
      filename: 'architecture.md',
      role: 'architect',
      roleType: 'analyst',
      agent: 'orchestrated-architect',
      type: 'architecture',
      phase: 'architecture',
    });

    expect(result.success).toBe(true);

    const content = await readFile(join(runDir, 'run-log.jsonl'), 'utf8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(1);

    const firstLine = lines[0];
    if (firstLine === undefined) throw new Error('Expected at least one line');
    const event: unknown = JSON.parse(firstLine);
    expect(event).toMatchObject({
      event: 'artifact_written',
      filename: 'architecture.md',
      role: 'architect',
      roleType: 'analyst',
      agent: 'orchestrated-architect',
      type: 'architecture',
      phase: 'architecture',
      t: expect.any(String),
    });
  });

  it('includes optional iteration and note when provided', async () => {
    const runDir = await createRunDir();
    await registerArtifact({
      runDir,
      filename: 'fix-summary.md',
      role: 'coder',
      roleType: 'implementer',
      agent: 'orchestrated-coder',
      type: 'change-summary',
      phase: 'review',
      iteration: 2,
      note: 'revised after review',
    });

    const content = await readFile(join(runDir, 'run-log.jsonl'), 'utf8');
    const event: unknown = JSON.parse(content.trim());
    expect(event).toMatchObject({
      iteration: 2,
      note: 'revised after review',
    });
  });
});
