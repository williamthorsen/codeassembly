import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { v3RunIndexSchema } from '@codeassembly/run-core';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, describe, expect, it } from 'vitest';

import { createServer } from '../server.js';
import {
  getStringField,
  isErrorResult,
  parseAndGetString,
  parseJsonlLine,
  parseToolResult,
  toRecord,
} from './helpers.js';

// -- Helpers ------------------------------------------------------------------

interface ConnectedClient {
  client: Client;
  runDir: string;
  cleanup: () => Promise<void>;
}

async function createConnectedClient(): Promise<ConnectedClient> {
  const server = createServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const client = new Client({ name: 'protocol-test', version: '0.0.1' });
  await client.connect(clientTransport);

  const runDir = await mkdtemp(join(tmpdir(), 'mcp-proto-'));

  return {
    client,
    runDir,
    cleanup: async () => {
      await Promise.allSettled([client.close(), server.close()]);
    },
  };
}

// -- Tests --------------------------------------------------------------------

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  const pending = cleanups.splice(0);
  await Promise.allSettled(pending.map((fn) => fn()));
});

describe('tool discovery', () => {
  it('lists all 5 registered tools', async () => {
    const { client, cleanup } = await createConnectedClient();
    cleanups.push(cleanup);

    const result = await client.listTools();
    expect(result.tools).toHaveLength(5);

    const names = result.tools.map((t) => t.name);
    expect(names).toContain('init_run');
    expect(names).toContain('emit_event');
    expect(names).toContain('register_artifact');
    expect(names).toContain('complete_run');
    expect(names).toContain('get_run_state');

    for (const tool of result.tools) {
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeDefined();
    }
  });
});

describe('full lifecycle via protocol', () => {
  it('init_run -> emit events -> register artifact -> complete_run -> get_run_state', async () => {
    const { client, runDir, cleanup } = await createConnectedClient();
    cleanups.push(cleanup);

    // 1. init_run
    const initResult = await client.callTool({
      name: 'init_run',
      arguments: {
        projectSlug: 'protocol-test',
        projectRoot: runDir,
        branch: 'feature/protocol',
        task: 'protocol integration test',
        ticketId: 'PROTO-1',
        baseDir: runDir,
      },
    });
    expect(isErrorResult(initResult)).toBe(false);

    const initData = toRecord(parseToolResult(initResult), 'init_run result');
    const runId = getStringField(initData, 'runId');
    const resultRunDir = getStringField(initData, 'runDir');
    expect(runId).toMatch(/^\d{8}-\d{6}Z$/);
    expect(resultRunDir).toContain('projects/protocol-test/tickets/PROTO-1/');

    // 2. emit phase_started(architecture)
    const phaseStartResult = await client.callTool({
      name: 'emit_event',
      arguments: {
        runDir: resultRunDir,
        event: { event: 'phase_started', phase: 'architecture' },
      },
    });
    expect(isErrorResult(phaseStartResult)).toBe(false);

    // 3. emit phase_completed(architecture, completed, { impactLevel: 'low' })
    const phaseCompleteResult = await client.callTool({
      name: 'emit_event',
      arguments: {
        runDir: resultRunDir,
        event: {
          event: 'phase_completed',
          phase: 'architecture',
          status: 'completed',
          data: { impactLevel: 'low' },
        },
      },
    });
    expect(isErrorResult(phaseCompleteResult)).toBe(false);

    // 4. register_artifact
    const artifactResult = await client.callTool({
      name: 'register_artifact',
      arguments: {
        runDir: resultRunDir,
        filename: 'architecture.md',
        role: 'architect',
        roleType: 'analyst',
        agent: 'orchestrated-architect',
        type: 'architecture',
        phase: 'architecture',
      },
    });
    expect(isErrorResult(artifactResult)).toBe(false);

    // 5. complete_run
    const completeResult = await client.callTool({
      name: 'complete_run',
      arguments: { runDir: resultRunDir, status: 'completed' },
    });
    expect(isErrorResult(completeResult)).toBe(false);

    // 6. get_run_state
    const stateResult = await client.callTool({
      name: 'get_run_state',
      arguments: { runDir: resultRunDir },
    });
    expect(isErrorResult(stateResult)).toBe(false);

    const state = parseToolResult(stateResult);
    expect(state).toMatchObject({
      status: 'completed',
      phases: { architecture: { status: 'completed' } },
    });

    const stateRecord = toRecord(state, 'state');
    const artifacts = stateRecord.artifacts;
    if (!Array.isArray(artifacts)) throw new Error('Expected artifacts array');
    expect(artifacts.length).toBeGreaterThanOrEqual(1);
  });

  it('run-index.json is a valid v3 header-only document', async () => {
    const { client, runDir, cleanup } = await createConnectedClient();
    cleanups.push(cleanup);

    // init_run to create the run
    const initResult = await client.callTool({
      name: 'init_run',
      arguments: {
        projectSlug: 'protocol-test',
        projectRoot: runDir,
        branch: 'main',
        task: 'v3 header check',
        ticketId: 'PROTO-2',
        baseDir: runDir,
      },
    });
    expect(isErrorResult(initResult)).toBe(false);

    const resultRunDir = parseAndGetString(initResult, 'runDir');

    // Read and validate run-index.json
    const indexContent = await readFile(join(resultRunDir, 'run-index.json'), 'utf8');
    const rawIndex: unknown = JSON.parse(indexContent);

    const parsed = v3RunIndexSchema.safeParse(rawIndex);
    if (!parsed.success) throw new Error('v3RunIndexSchema validation failed');

    expect(parsed.data.version).toBe(3);

    // Verify context fields are present
    expect(parsed.data.context.runId).toBeTruthy();
    expect(parsed.data.context.projectSlug).toBe('protocol-test');
    expect(parsed.data.context.ticketId).toBe('PROTO-2');
    expect(parsed.data.context.branch).toBe('main');
    expect(parsed.data.context.task).toBe('v3 header check');
    expect(parsed.data.context.startedAt).toBeTruthy();

    // Verify header does NOT have runtime state fields
    const rawRecord = toRecord(rawIndex, 'rawIndex');
    expect(rawRecord.phases).toBeUndefined();
    expect(rawRecord.phaseDecisions).toBeUndefined();
    expect(rawRecord.status).toBeUndefined();
    expect(rawRecord.completedAt).toBeUndefined();
  });

  it('run-log.jsonl contains events with server-injected timestamps', async () => {
    const { client, runDir, cleanup } = await createConnectedClient();
    cleanups.push(cleanup);

    // init_run (emits run_started automatically)
    const initResult = await client.callTool({
      name: 'init_run',
      arguments: {
        projectSlug: 'protocol-test',
        projectRoot: runDir,
        branch: 'main',
        task: 'timestamp check',
        baseDir: runDir,
      },
    });
    expect(isErrorResult(initResult)).toBe(false);

    const resultRunDir = parseAndGetString(initResult, 'runDir');

    // Emit additional events
    await client.callTool({
      name: 'emit_event',
      arguments: {
        runDir: resultRunDir,
        event: { event: 'phase_started', phase: 'architecture' },
      },
    });
    await client.callTool({
      name: 'emit_event',
      arguments: {
        runDir: resultRunDir,
        event: { event: 'phase_completed', phase: 'architecture', status: 'completed' },
      },
    });

    // Read and parse run-log.jsonl
    const logContent = await readFile(join(resultRunDir, 'run-log.jsonl'), 'utf8');
    const lines = logContent.trim().split('\n');
    expect(lines.length).toBeGreaterThanOrEqual(3);

    const isoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
    const eventNames: string[] = [];

    for (const line of lines) {
      const record = parseJsonlLine(line);
      expect(record.t).toBeDefined();
      expect(record.t).toMatch(isoPattern);
      if (typeof record.event === 'string') {
        eventNames.push(record.event);
      }
    }

    // Verify expected event order
    expect(eventNames[0]).toBe('run_started');
    expect(eventNames[1]).toBe('phase_started');
    expect(eventNames[2]).toBe('phase_completed');
  });
});

describe('review cycle events - all 13 event types', () => {
  it('emits and reconstructs a full review cycle', async () => {
    const { client, runDir, cleanup } = await createConnectedClient();
    cleanups.push(cleanup);

    // 1. init_run (emits run_started)
    const initResult = await client.callTool({
      name: 'init_run',
      arguments: {
        projectSlug: 'protocol-test',
        projectRoot: runDir,
        branch: 'feature/review',
        task: 'review cycle test',
        ticketId: 'PROTO-3',
        baseDir: runDir,
      },
    });
    expect(isErrorResult(initResult)).toBe(false);
    const mainRunDir = parseAndGetString(initResult, 'runDir');

    // 2. phase_decision(architecture, run: true)
    await client.callTool({
      name: 'emit_event',
      arguments: {
        runDir: mainRunDir,
        event: { event: 'phase_decision', phase: 'architecture', run: true },
      },
    });

    // 3. phase_started(architecture)
    await client.callTool({
      name: 'emit_event',
      arguments: {
        runDir: mainRunDir,
        event: { event: 'phase_started', phase: 'architecture' },
      },
    });

    // 4. phase_completed(architecture, completed)
    await client.callTool({
      name: 'emit_event',
      arguments: {
        runDir: mainRunDir,
        event: { event: 'phase_completed', phase: 'architecture', status: 'completed' },
      },
    });

    // 5. phase_started(review)
    await client.callTool({
      name: 'emit_event',
      arguments: {
        runDir: mainRunDir,
        event: { event: 'phase_started', phase: 'review' },
      },
    });

    // 6-8. reviewer_dispatched x3
    for (const reviewer of ['aspect-code-reviewer', 'aspect-silent-failure-reviewer', 'aspect-test-reviewer']) {
      await client.callTool({
        name: 'emit_event',
        arguments: {
          runDir: mainRunDir,
          event: { event: 'reviewer_dispatched', reviewer },
        },
      });
    }

    // 9-11. reviewer_completed x3
    const reviewerCompletions: Array<{ reviewer: string; criticality: string }> = [
      { reviewer: 'aspect-code-reviewer', criticality: 'low' },
      { reviewer: 'aspect-silent-failure-reviewer', criticality: 'none' },
      { reviewer: 'aspect-test-reviewer', criticality: 'low' },
    ];
    for (const { reviewer, criticality } of reviewerCompletions) {
      await client.callTool({
        name: 'emit_event',
        arguments: {
          runDir: mainRunDir,
          event: { event: 'reviewer_completed', reviewer, status: 'completed', criticality },
        },
      });
    }

    // 12. coder_fix_started(iteration: 1)
    await client.callTool({
      name: 'emit_event',
      arguments: {
        runDir: mainRunDir,
        event: { event: 'coder_fix_started', iteration: 1 },
      },
    });

    // 13. coder_fix_completed(iteration: 1)
    await client.callTool({
      name: 'emit_event',
      arguments: {
        runDir: mainRunDir,
        event: { event: 'coder_fix_completed', iteration: 1 },
      },
    });

    // 14. re_review_dispatched
    await client.callTool({
      name: 'emit_event',
      arguments: {
        runDir: mainRunDir,
        event: {
          event: 're_review_dispatched',
          reviewers: ['aspect-code-reviewer', 'aspect-test-reviewer'],
        },
      },
    });

    // 15. re_review_completed
    await client.callTool({
      name: 'emit_event',
      arguments: {
        runDir: mainRunDir,
        event: {
          event: 're_review_completed',
          criticalities: {
            'aspect-code-reviewer': 'none',
            'aspect-test-reviewer': 'none',
          },
        },
      },
    });

    // 16. phase_completed(review, completed, { aggregatedCriticality: 'none', reviewRoundsUsed: 2 })
    await client.callTool({
      name: 'emit_event',
      arguments: {
        runDir: mainRunDir,
        event: {
          event: 'phase_completed',
          phase: 'review',
          status: 'completed',
          data: { aggregatedCriticality: 'none', reviewRoundsUsed: 2 },
        },
      },
    });

    // 17-18. simplifier phase
    await client.callTool({
      name: 'emit_event',
      arguments: {
        runDir: mainRunDir,
        event: { event: 'phase_started', phase: 'simplifier' },
      },
    });
    await client.callTool({
      name: 'emit_event',
      arguments: {
        runDir: mainRunDir,
        event: { event: 'phase_completed', phase: 'simplifier', status: 'completed' },
      },
    });

    // 19-20. holistic phase
    await client.callTool({
      name: 'emit_event',
      arguments: {
        runDir: mainRunDir,
        event: { event: 'phase_started', phase: 'holistic' },
      },
    });
    await client.callTool({
      name: 'emit_event',
      arguments: {
        runDir: mainRunDir,
        event: {
          event: 'phase_completed',
          phase: 'holistic',
          status: 'completed',
          data: { criticality: 'none' },
        },
      },
    });

    // 21. register_artifact (emits artifact_written)
    await client.callTool({
      name: 'register_artifact',
      arguments: {
        runDir: mainRunDir,
        filename: 'change-summary.md',
        role: 'coder',
        roleType: 'author',
        agent: 'orchestrated-coder',
        type: 'change-summary',
        phase: 'implementation',
      },
    });

    // 22. run_failed on a SEPARATE run (run_completed and run_failed are exclusive)
    const failedRunDir = await mkdtemp(join(tmpdir(), 'mcp-proto-fail-'));
    const failInitResult = await client.callTool({
      name: 'init_run',
      arguments: {
        projectSlug: 'protocol-test',
        projectRoot: failedRunDir,
        branch: 'main',
        task: 'failure test',
        baseDir: failedRunDir,
      },
    });
    expect(isErrorResult(failInitResult)).toBe(false);
    const failRunDir = parseAndGetString(failInitResult, 'runDir');

    await client.callTool({
      name: 'emit_event',
      arguments: {
        runDir: failRunDir,
        event: { event: 'run_failed', status: 'failed', reason: 'simulated' },
      },
    });

    // 23. complete_run on main run (emits run_completed)
    const completeResult = await client.callTool({
      name: 'complete_run',
      arguments: { runDir: mainRunDir, status: 'completed' },
    });
    expect(isErrorResult(completeResult)).toBe(false);

    // -- Assertions --

    // Read run-log.jsonl from main run and collect all event names
    const mainLogContent = await readFile(join(mainRunDir, 'run-log.jsonl'), 'utf8');
    const mainEventNames = mainLogContent
      .trim()
      .split('\n')
      .map((line) => getStringField(parseJsonlLine(line), 'event'));

    // Read run-log.jsonl from failed run to collect run_failed
    const failLogContent = await readFile(join(failRunDir, 'run-log.jsonl'), 'utf8');
    const failEventNames = failLogContent
      .trim()
      .split('\n')
      .map((line) => getStringField(parseJsonlLine(line), 'event'));

    const allEventNames = [...mainEventNames, ...failEventNames];

    // Assert all 13 event types appear
    const expected13 = [
      'run_started',
      'run_completed',
      'run_failed',
      'phase_decision',
      'phase_started',
      'phase_completed',
      'reviewer_dispatched',
      'reviewer_completed',
      'coder_fix_started',
      'coder_fix_completed',
      're_review_dispatched',
      're_review_completed',
      'artifact_written',
    ];
    for (const eventType of expected13) {
      expect(allEventNames).toContain(eventType);
    }

    // Verify get_run_state for main run
    const stateResult = await client.callTool({
      name: 'get_run_state',
      arguments: { runDir: mainRunDir },
    });
    expect(isErrorResult(stateResult)).toBe(false);

    const state = parseToolResult(stateResult);
    expect(state).toMatchObject({
      phases: {
        parallelReview: {
          coderFixCycleRan: true,
          selectiveReReview: {
            ran: true,
          },
        },
      },
    });

    // Narrow to check reviewer count and re-review dispatched count
    const stateRecord = toRecord(state, 'state');
    const phases = toRecord(stateRecord.phases, 'phases');
    const parallelReview = toRecord(phases.parallelReview, 'parallelReview');
    const reviewers = toRecord(parallelReview.reviewers, 'reviewers');
    expect(Object.keys(reviewers)).toHaveLength(3);

    const selectiveReReview = toRecord(parallelReview.selectiveReReview, 'selectiveReReview');
    const dispatched = selectiveReReview.reviewersDispatched;
    if (!Array.isArray(dispatched)) throw new Error('Expected reviewersDispatched array');
    expect(dispatched).toHaveLength(2);
  });
});

describe('get_run_state at each checkpoint', () => {
  it('returns in_progress status after init_run', async () => {
    const { client, runDir, cleanup } = await createConnectedClient();
    cleanups.push(cleanup);

    const initResult = await client.callTool({
      name: 'init_run',
      arguments: {
        projectSlug: 'protocol-test',
        projectRoot: runDir,
        branch: 'main',
        task: 'checkpoint test',
        baseDir: runDir,
      },
    });
    expect(isErrorResult(initResult)).toBe(false);
    const resultRunDir = parseAndGetString(initResult, 'runDir');

    const stateResult = await client.callTool({
      name: 'get_run_state',
      arguments: { runDir: resultRunDir },
    });
    expect(isErrorResult(stateResult)).toBe(false);

    const state = parseToolResult(stateResult);
    expect(state).toMatchObject({ status: 'in_progress' });
    const stateRecord = toRecord(state, 'state');
    expect(stateRecord.completedAt).toBeUndefined();
  });

  it('returns in_progress phase status after phase_started', async () => {
    const { client, runDir, cleanup } = await createConnectedClient();
    cleanups.push(cleanup);

    const initResult = await client.callTool({
      name: 'init_run',
      arguments: {
        projectSlug: 'protocol-test',
        projectRoot: runDir,
        branch: 'main',
        task: 'checkpoint test',
        baseDir: runDir,
      },
    });
    expect(isErrorResult(initResult)).toBe(false);
    const resultRunDir = parseAndGetString(initResult, 'runDir');

    await client.callTool({
      name: 'emit_event',
      arguments: {
        runDir: resultRunDir,
        event: { event: 'phase_started', phase: 'architecture' },
      },
    });

    const stateResult = await client.callTool({
      name: 'get_run_state',
      arguments: { runDir: resultRunDir },
    });
    expect(isErrorResult(stateResult)).toBe(false);

    const state = parseToolResult(stateResult);
    expect(state).toMatchObject({
      phases: { architecture: { status: 'in_progress' } },
    });
  });

  it('returns completed phase status after phase_completed', async () => {
    const { client, runDir, cleanup } = await createConnectedClient();
    cleanups.push(cleanup);

    const initResult = await client.callTool({
      name: 'init_run',
      arguments: {
        projectSlug: 'protocol-test',
        projectRoot: runDir,
        branch: 'main',
        task: 'checkpoint test',
        baseDir: runDir,
      },
    });
    expect(isErrorResult(initResult)).toBe(false);
    const resultRunDir = parseAndGetString(initResult, 'runDir');

    await client.callTool({
      name: 'emit_event',
      arguments: {
        runDir: resultRunDir,
        event: { event: 'phase_started', phase: 'architecture' },
      },
    });
    await client.callTool({
      name: 'emit_event',
      arguments: {
        runDir: resultRunDir,
        event: {
          event: 'phase_completed',
          phase: 'architecture',
          status: 'completed',
          data: { impactLevel: 'medium' },
        },
      },
    });

    const stateResult = await client.callTool({
      name: 'get_run_state',
      arguments: { runDir: resultRunDir },
    });
    expect(isErrorResult(stateResult)).toBe(false);

    const state = parseToolResult(stateResult);
    expect(state).toMatchObject({
      phases: { architecture: { status: 'completed', impactLevel: 'medium' } },
    });
  });

  it('returns completed run status after complete_run', async () => {
    const { client, runDir, cleanup } = await createConnectedClient();
    cleanups.push(cleanup);

    const initResult = await client.callTool({
      name: 'init_run',
      arguments: {
        projectSlug: 'protocol-test',
        projectRoot: runDir,
        branch: 'main',
        task: 'checkpoint test',
        baseDir: runDir,
      },
    });
    expect(isErrorResult(initResult)).toBe(false);
    const resultRunDir = parseAndGetString(initResult, 'runDir');

    await client.callTool({
      name: 'complete_run',
      arguments: { runDir: resultRunDir, status: 'completed' },
    });

    const stateResult = await client.callTool({
      name: 'get_run_state',
      arguments: { runDir: resultRunDir },
    });
    expect(isErrorResult(stateResult)).toBe(false);

    const state = parseToolResult(stateResult);
    expect(state).toMatchObject({ status: 'completed' });
    const stateRecord = toRecord(state, 'state');
    const completedAt = stateRecord.completedAt;
    expect(completedAt).toBeDefined();
    if (typeof completedAt !== 'string') throw new Error('Expected completedAt to be a string');
    expect(completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

describe('error propagation', () => {
  it('emit_event with invalid event schema returns isError: true', async () => {
    const { client, runDir, cleanup } = await createConnectedClient();
    cleanups.push(cleanup);

    const initResult = await client.callTool({
      name: 'init_run',
      arguments: {
        projectSlug: 'protocol-test',
        projectRoot: runDir,
        branch: 'main',
        task: 'error test',
        baseDir: runDir,
      },
    });
    expect(isErrorResult(initResult)).toBe(false);
    const resultRunDir = parseAndGetString(initResult, 'runDir');

    const result = await client.callTool({
      name: 'emit_event',
      arguments: {
        runDir: resultRunDir,
        event: { event: 'not_a_real_event' },
      },
    });
    expect(isErrorResult(result)).toBe(true);
  });

  it('get_run_state with non-existent runDir returns isError: true', async () => {
    const { client, cleanup } = await createConnectedClient();
    cleanups.push(cleanup);

    const result = await client.callTool({
      name: 'get_run_state',
      arguments: { runDir: '/tmp/mcp-does-not-exist-' + Date.now().toString() },
    });
    expect(isErrorResult(result)).toBe(true);
  });

  it('init_run with missing required field returns an error', async () => {
    const { client, cleanup } = await createConnectedClient();
    cleanups.push(cleanup);

    // Call init_run without the required projectSlug field.
    // The MCP SDK validates the Zod inputSchema before the handler is invoked.
    const result = await client.callTool({
      name: 'init_run',
      arguments: {
        // projectSlug intentionally omitted
        projectRoot: '/tmp/mcp-missing-field-test',
        branch: 'main',
        task: 'missing field test',
      },
    });
    expect(isErrorResult(result)).toBe(true);
  });

  it('complete_run with status failed succeeds at the protocol layer', async () => {
    const { client, runDir, cleanup } = await createConnectedClient();
    cleanups.push(cleanup);

    const initResult = await client.callTool({
      name: 'init_run',
      arguments: {
        projectSlug: 'protocol-test',
        projectRoot: runDir,
        branch: 'main',
        task: 'failed status test',
        baseDir: runDir,
      },
    });
    expect(isErrorResult(initResult)).toBe(false);
    const resultRunDir = parseAndGetString(initResult, 'runDir');

    // Call complete_run with status: 'failed' to verify the enum value round-trips
    const completeResult = await client.callTool({
      name: 'complete_run',
      arguments: { runDir: resultRunDir, status: 'failed' },
    });
    expect(isErrorResult(completeResult)).toBe(false);

    // Verify state reflects the failed status
    const stateResult = await client.callTool({
      name: 'get_run_state',
      arguments: { runDir: resultRunDir },
    });
    expect(isErrorResult(stateResult)).toBe(false);

    const state = parseToolResult(stateResult);
    expect(state).toMatchObject({ status: 'failed' });
    const stateRecord = toRecord(state, 'state');
    expect(stateRecord.completedAt).toBeDefined();
  });

  it('register_artifact with optional iteration and note persists them correctly', async () => {
    const { client, runDir, cleanup } = await createConnectedClient();
    cleanups.push(cleanup);

    const initResult = await client.callTool({
      name: 'init_run',
      arguments: {
        projectSlug: 'protocol-test',
        projectRoot: runDir,
        branch: 'main',
        task: 'artifact optional fields test',
        baseDir: runDir,
      },
    });
    expect(isErrorResult(initResult)).toBe(false);
    const resultRunDir = parseAndGetString(initResult, 'runDir');

    const artifactResult = await client.callTool({
      name: 'register_artifact',
      arguments: {
        runDir: resultRunDir,
        filename: 'change-summary.md',
        role: 'coder',
        roleType: 'author',
        agent: 'orchestrated-coder',
        type: 'change-summary',
        phase: 'implementation',
        iteration: 2,
        note: 'revised',
      },
    });
    expect(isErrorResult(artifactResult)).toBe(false);

    const stateResult = await client.callTool({
      name: 'get_run_state',
      arguments: { runDir: resultRunDir },
    });
    expect(isErrorResult(stateResult)).toBe(false);

    const stateRecord = toRecord(parseToolResult(stateResult), 'state');
    const artifacts = stateRecord.artifacts;
    if (!Array.isArray(artifacts)) throw new Error('Expected artifacts array');
    expect(artifacts).toHaveLength(1);
    const firstArtifact: unknown = artifacts[0];
    if (firstArtifact === undefined) throw new Error('Expected at least one artifact');
    const artifactRecord = toRecord(firstArtifact, 'artifact');
    expect(artifactRecord.iteration).toBe(2);
    expect(artifactRecord.note).toBe('revised');
  });
});
