import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { emitEvent } from '../emit-event.js';

describe('emitEvent', () => {
  async function createRunDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'mcp-test-emit-'));
    await writeFile(join(dir, 'run-log.jsonl'), '');
    return dir;
  }

  it('appends a valid event as a JSONL line', async () => {
    const runDir = await createRunDir();
    const result = await emitEvent({
      runDir,
      event: { event: 'run_started' },
    });

    expect(result.success).toBe(true);

    const content = await readFile(join(runDir, 'run-log.jsonl'), 'utf8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(1);

    const firstLine = lines[0];
    if (firstLine === undefined) throw new Error('Expected at least one line');
    const parsed: unknown = JSON.parse(firstLine);
    expect(parsed).toMatchObject({ event: 'run_started' });
  });

  it('injects a timestamp if the event has no t field', async () => {
    const runDir = await createRunDir();
    await emitEvent({
      runDir,
      event: { event: 'run_started' },
    });

    const content = await readFile(join(runDir, 'run-log.jsonl'), 'utf8');
    const parsed: unknown = JSON.parse(content.trim());
    expect(parsed).toMatchObject({ t: expect.any(String) });
  });

  it('overrides a client-provided t with the server timestamp', async () => {
    const runDir = await createRunDir();
    const clientTimestamp = '1970-01-01T00:00:00.000Z';
    await emitEvent({
      runDir,
      event: { event: 'run_started', t: clientTimestamp },
    });

    const content = await readFile(join(runDir, 'run-log.jsonl'), 'utf8');
    const parsed: unknown = JSON.parse(content.trim());
    expect(parsed).toMatchObject({ t: expect.any(String) });
    expect(parsed).not.toMatchObject({ t: clientTimestamp });
  });

  it('returns error for invalid events without writing', async () => {
    const runDir = await createRunDir();
    const result = await emitEvent({
      runDir,
      event: { event: 'not_a_real_event' },
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();

    const content = await readFile(join(runDir, 'run-log.jsonl'), 'utf8');
    expect(content).toBe('');
  });

  it('returns error for non-object events', async () => {
    const runDir = await createRunDir();
    const result = await emitEvent({
      runDir,
      event: 'not an object',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('appends multiple events as separate JSONL lines', async () => {
    const runDir = await createRunDir();

    await emitEvent({ runDir, event: { event: 'run_started' } });
    await emitEvent({ runDir, event: { event: 'phase_started', phase: 'architecture' } });
    await emitEvent({
      runDir,
      event: { event: 'phase_completed', phase: 'architecture', status: 'completed' },
    });

    const content = await readFile(join(runDir, 'run-log.jsonl'), 'utf8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(3);

    const expectedEvents = ['run_started', 'phase_started', 'phase_completed'];
    for (const [i, line] of lines.entries()) {
      const parsed: unknown = JSON.parse(line);
      const expectedEvent = expectedEvents[i];
      if (expectedEvent === undefined) throw new Error(`No expected event for line ${String(i)}`);
      expect(parsed).toMatchObject({ event: expectedEvent });
    }
  });

  it('returns structured error when appendFile fails', async () => {
    // Use a non-existent directory so appendFile fails with ENOENT
    const runDir = join(tmpdir(), 'mcp-test-no-such-dir-' + Date.now().toString());
    const result = await emitEvent({
      runDir,
      event: { event: 'run_started' },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Failed to write event');
  });
});
