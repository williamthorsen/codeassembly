import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { getRunState } from '../get-run-state.js';

describe('getRunState', () => {
  function makeRunIndex() {
    return {
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
  }

  async function createRunDir(events: unknown[] = []): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'mcp-test-getstate-'));
    await writeFile(join(dir, 'run-index.json'), JSON.stringify(makeRunIndex(), null, 2));
    const jsonl = events.map((e) => JSON.stringify(e)).join('\n') + (events.length > 0 ? '\n' : '');
    await writeFile(join(dir, 'run-log.jsonl'), jsonl);
    return dir;
  }

  it('returns in_progress status after init with no events', async () => {
    const runDir = await createRunDir([]);
    const state = await getRunState({ runDir });

    expect(state.status).toBe('in_progress');
    expect(state.runId).toBe('test.20260101-000000Z');
    expect(state.completedAt).toBeUndefined();
  });

  it('returns in_progress status with run_started event', async () => {
    const runDir = await createRunDir([{ t: '2026-01-01T00:00:01Z', event: 'run_started' }]);
    const state = await getRunState({ runDir });

    expect(state.status).toBe('in_progress');
  });

  it('folds events correctly to produce CanonicalRunStatus', async () => {
    const events = [
      { t: '2026-01-01T00:00:01Z', event: 'run_started' },
      { t: '2026-01-01T00:01:00Z', event: 'phase_started', phase: 'architecture' },
      {
        t: '2026-01-01T00:02:00Z',
        event: 'phase_completed',
        phase: 'architecture',
        status: 'completed',
        data: { impactLevel: 'high' },
      },
      { t: '2026-01-01T00:10:00Z', event: 'run_completed', status: 'completed' },
    ];

    const runDir = await createRunDir(events);
    const state = await getRunState({ runDir });

    expect(state.status).toBe('completed');
    expect(state.completedAt).toBe('2026-01-01T00:10:00Z');
    expect(state.phases.architecture).toMatchObject({
      status: 'completed',
      impactLevel: 'high',
    });
  });

  it('skips unknown event types without throwing', async () => {
    const events = [
      { t: '2026-01-01T00:00:01Z', event: 'run_started' },
      { t: '2026-01-01T00:00:02Z', event: 'totally_unknown_event', data: {} },
      { t: '2026-01-01T00:10:00Z', event: 'run_completed', status: 'completed' },
    ];

    const runDir = await createRunDir(events);
    const state = await getRunState({ runDir });

    // The unknown event is skipped; run_started and run_completed are processed
    expect(state.status).toBe('completed');
  });

  it('collects artifacts from artifact_written events', async () => {
    const events = [
      { t: '2026-01-01T00:00:01Z', event: 'run_started' },
      {
        t: '2026-01-01T00:02:00Z',
        event: 'artifact_written',
        filename: 'arch.md',
        role: 'architect',
        roleType: 'analyst',
        agent: 'orchestrated-architect',
        type: 'architecture',
        phase: 'architecture',
      },
    ];

    const runDir = await createRunDir(events);
    const state = await getRunState({ runDir });

    expect(state.artifacts).toHaveLength(1);
    expect(state.artifacts?.[0]?.filename).toBe('arch.md');
  });

  it('throws when run-index.json has invalid version', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mcp-test-getstate-'));
    const badIndex = { version: 99, context: {}, config: {} };
    await writeFile(join(dir, 'run-index.json'), JSON.stringify(badIndex, null, 2));
    await writeFile(join(dir, 'run-log.jsonl'), '');

    await expect(getRunState({ runDir: dir })).rejects.toThrow('Invalid run-index.json');
  });

  it('skips corrupt JSONL lines and returns state from valid events', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'mcp-test-getstate-'));
    await writeFile(join(dir, 'run-index.json'), JSON.stringify(makeRunIndex(), null, 2));

    const validEvent = JSON.stringify({ t: '2026-01-01T00:00:01Z', event: 'run_started' });
    const corruptLine = '{{invalid json';
    const validCompletedEvent = JSON.stringify({
      t: '2026-01-01T00:10:00Z',
      event: 'run_completed',
      status: 'completed',
    });
    await writeFile(join(dir, 'run-log.jsonl'), [validEvent, corruptLine, validCompletedEvent].join('\n') + '\n');

    const state = await getRunState({ runDir: dir });

    // The corrupt line is skipped; valid events are processed
    expect(state.status).toBe('completed');
    expect(state.completedAt).toBe('2026-01-01T00:10:00Z');
  });

  it('folds run_failed event to set status and completedAt', async () => {
    const events = [
      { t: '2026-01-01T00:00:01Z', event: 'run_started' },
      { t: '2026-01-01T00:05:00Z', event: 'run_failed', status: 'failed', reason: 'out of retries' },
    ];

    const runDir = await createRunDir(events);
    const state = await getRunState({ runDir });

    expect(state.status).toBe('failed');
    expect(state.completedAt).toBe('2026-01-01T00:05:00Z');
  });
});
