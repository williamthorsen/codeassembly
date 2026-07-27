import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { isBuildStale } from './staleness.ts';
import { completeRun } from './tools/complete-run.ts';
import { emitEvent } from './tools/emit-event.ts';
import { getRunState } from './tools/get-run-state.ts';
import { initRun } from './tools/init-run.ts';
import { registerArtifact } from './tools/register-artifact.ts';

let hasWarned = false;

const STALE_BUILD_WARNING =
  '\u{26A0}\u{FE0F} MCP server build is stale \u{2014} source files are newer than compiled output. Run `pnpm run ws compile` in packages/mcp/ to rebuild.\n\n';

/**
 * If the build is stale and the warning hasn't been shown yet, return a content
 * item with the staleness warning. Returns an empty array otherwise.
 *
 * The warning is a separate content item so that data content (typically JSON)
 * remains parseable by programmatic consumers.
 *
 * Sets `hasWarned` eagerly before the async staleness check to prevent concurrent
 * tool calls from both passing the guard and emitting duplicate warnings.
 */
async function getStaleWarningContent(): Promise<Array<{ type: 'text'; text: string }>> {
  if (hasWarned) return [];
  hasWarned = true;
  try {
    if (!(await isBuildStale())) return [];
    return [{ type: 'text', text: STALE_BUILD_WARNING }];
  } catch {
    // Belt-and-suspenders: never let staleness detection break tool execution.
    return [];
  }
}

/**
 * Create and configure an MCP server with run-data management tools.
 */
export function createServer(): McpServer {
  const server = new McpServer({ name: 'codeassembly', version: '0.1.0' }, { capabilities: { tools: {} } });

  // -- init_run --
  server.registerTool(
    'init_run',
    {
      description:
        'Initialize a new orchestrated run: create run directory, write run-index.json, and emit run_started event.',
      inputSchema: {
        projectSlug: z.string(),
        projectRoot: z.string(),
        branch: z.string(),
        task: z.string(),
        ticketId: z.string().optional(),
        baseDir: z.string().optional(),
        pipeline: z.unknown().optional(),
        models: z.unknown().optional(),
        config: z.record(z.string(), z.unknown()).optional(),
      },
    },
    async (args) => {
      const warning = await getStaleWarningContent();
      try {
        const result = await initRun(args);
        return { content: [...warning, { type: 'text', text: JSON.stringify(result) }] };
      } catch (error) {
        return { content: [...warning, { type: 'text', text: String(error) }], isError: true };
      }
    },
  );

  // -- emit_event --
  server.registerTool(
    'emit_event',
    {
      description: 'Append a validated run event to the JSONL log.',
      inputSchema: {
        runDir: z.string(),
        event: z.record(z.string(), z.unknown()),
      },
    },
    async (args) => {
      const warning = await getStaleWarningContent();
      try {
        const result = await emitEvent(args);
        return {
          content: [...warning, { type: 'text', text: JSON.stringify(result) }],
          isError: !result.success,
        };
      } catch (error) {
        return { content: [...warning, { type: 'text', text: String(error) }], isError: true };
      }
    },
  );

  // -- register_artifact --
  server.registerTool(
    'register_artifact',
    {
      description: 'Register an artifact by emitting an artifact_written event.',
      inputSchema: {
        runDir: z.string(),
        filename: z.string(),
        role: z.string(),
        roleType: z.string(),
        agent: z.string(),
        type: z.string(),
        phase: z.string(),
        iteration: z.number().optional(),
        note: z.string().optional(),
      },
    },
    async (args) => {
      const warning = await getStaleWarningContent();
      try {
        const result = await registerArtifact(args);
        return {
          content: [...warning, { type: 'text', text: JSON.stringify(result) }],
          isError: !result.success,
        };
      } catch (error) {
        return { content: [...warning, { type: 'text', text: String(error) }], isError: true };
      }
    },
  );

  // -- complete_run --
  server.registerTool(
    'complete_run',
    {
      description:
        'Complete a run: emit run_completed (or run_failed when status is failed) event and stamp completedAt on run-index.json.',
      inputSchema: {
        runDir: z.string(),
        status: z.enum(['completed', 'failed', 'needs_manual_review']),
        reason: z.string().optional(),
      },
    },
    async (args) => {
      const warning = await getStaleWarningContent();
      try {
        const result = await completeRun(args);
        return {
          content: [...warning, { type: 'text', text: JSON.stringify(result) }],
          isError: !result.success,
        };
      } catch (error) {
        return { content: [...warning, { type: 'text', text: String(error) }], isError: true };
      }
    },
  );

  // -- get_run_state --
  server.registerTool(
    'get_run_state',
    {
      description: 'Read and fold run events to reconstruct the current CanonicalRunStatus.',
      inputSchema: {
        runDir: z.string(),
      },
    },
    async (args) => {
      const warning = await getStaleWarningContent();
      try {
        const result = await getRunState(args);
        return { content: [...warning, { type: 'text', text: JSON.stringify(result) }] };
      } catch (error) {
        return { content: [...warning, { type: 'text', text: String(error) }], isError: true };
      }
    },
  );

  return server;
}
