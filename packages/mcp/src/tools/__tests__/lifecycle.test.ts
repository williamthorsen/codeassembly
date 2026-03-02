import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { completeRun } from '../complete-run.js';
import { emitEvent } from '../emit-event.js';
import { getRunState } from '../get-run-state.js';
import { initRun } from '../init-run.js';
import { registerArtifact } from '../register-artifact.js';

describe('lifecycle integration', () => {
  it('supports the full run lifecycle: init -> emit events -> artifact -> complete -> get_state', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'mcp-test-lifecycle-'));

    // Step 1: Initialize the run
    const initResult = await initRun({
      projectSlug: 'lifecycle-test',
      ticketId: 'TEST-1',
      projectRoot,
      branch: 'feature/lifecycle',
      task: 'test the full lifecycle',
    });

    expect(initResult.runId).toMatch(/^lifecycle-test\.\d{8}-\d{6}Z$/);
    const { runDir } = initResult;

    // Step 2: Emit phase events
    const phaseStartResult = await emitEvent({
      runDir,
      event: { event: 'phase_started', phase: 'architecture' },
    });
    expect(phaseStartResult.success).toBe(true);

    const phaseCompleteResult = await emitEvent({
      runDir,
      event: {
        event: 'phase_completed',
        phase: 'architecture',
        status: 'completed',
        data: { impactLevel: 'medium' },
      },
    });
    expect(phaseCompleteResult.success).toBe(true);

    // Step 3: Register an artifact
    const artifactResult = await registerArtifact({
      runDir,
      filename: 'architecture.md',
      role: 'architect',
      roleType: 'analyst',
      agent: 'orchestrated-architect',
      type: 'architecture',
      phase: 'architecture',
    });
    expect(artifactResult.success).toBe(true);

    // Step 4: Emit implementation phase
    await emitEvent({
      runDir,
      event: { event: 'phase_started', phase: 'implementation' },
    });
    await emitEvent({
      runDir,
      event: {
        event: 'phase_completed',
        phase: 'implementation',
        status: 'completed',
        data: { qualityGates: { typecheck: 'pass', lint: 'pass', tests: 'pass' } },
      },
    });

    // Step 5: Register another artifact
    await registerArtifact({
      runDir,
      filename: 'change-summary.md',
      role: 'coder',
      roleType: 'author',
      agent: 'orchestrated-coder',
      type: 'change-summary',
      phase: 'implementation',
    });

    // Step 6: Complete the run
    const completeResult = await completeRun({ runDir, status: 'completed' });
    expect(completeResult.success).toBe(true);

    // Step 7: Get the final run state
    const state = await getRunState({ runDir });

    // Verify overall status
    expect(state.status).toBe('completed');
    expect(state.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(state.runId).toBe(initResult.runId);
    expect(state.projectSlug).toBe('lifecycle-test');

    // Verify phases
    expect(state.phases.architecture).toMatchObject({
      status: 'completed',
      impactLevel: 'medium',
    });
    expect(state.phases.implementation).toMatchObject({
      status: 'completed',
      qualityGates: { typecheck: 'pass', lint: 'pass', tests: 'pass' },
    });

    // Verify artifacts
    expect(state.artifacts).toHaveLength(2);
    expect(state.artifacts?.[0]?.filename).toBe('architecture.md');
    expect(state.artifacts?.[1]?.filename).toBe('change-summary.md');
  });
});
