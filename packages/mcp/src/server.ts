import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { completeRun } from './tools/complete-run.js';
import { emitEvent } from './tools/emit-event.js';
import { getRunState } from './tools/get-run-state.js';
import { initRun } from './tools/init-run.js';
import { registerArtifact } from './tools/register-artifact.js';

/**
 * Create and configure an MCP server with run-data management tools.
 */
export function createServer(): McpServer {
  const server = new McpServer({ name: 'codeassembly', version: '0.1.0' }, { capabilities: { tools: {} } });

  // -- init_run ---------------------------------------------------------------
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
        pipeline: z.unknown().optional(),
        models: z.unknown().optional(),
        config: z.record(z.string(), z.unknown()).optional(),
      },
    },
    async (args) => {
      try {
        const result = await initRun(args);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (error) {
        return { content: [{ type: 'text', text: String(error) }], isError: true };
      }
    },
  );

  // -- emit_event -------------------------------------------------------------
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
      try {
        const result = await emitEvent(args);
        return { content: [{ type: 'text', text: JSON.stringify(result) }], isError: !result.success };
      } catch (error) {
        return { content: [{ type: 'text', text: String(error) }], isError: true };
      }
    },
  );

  // -- register_artifact ------------------------------------------------------
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
      try {
        const result = await registerArtifact(args);
        return { content: [{ type: 'text', text: JSON.stringify(result) }], isError: !result.success };
      } catch (error) {
        return { content: [{ type: 'text', text: String(error) }], isError: true };
      }
    },
  );

  // -- complete_run -----------------------------------------------------------
  server.registerTool(
    'complete_run',
    {
      description: 'Complete a run: emit run_completed event and stamp completedAt on run-index.json.',
      inputSchema: {
        runDir: z.string(),
        status: z.enum(['completed', 'failed', 'needs_manual_review']),
      },
    },
    async (args) => {
      try {
        const result = await completeRun(args);
        return { content: [{ type: 'text', text: JSON.stringify(result) }], isError: !result.success };
      } catch (error) {
        return { content: [{ type: 'text', text: String(error) }], isError: true };
      }
    },
  );

  // -- get_run_state ----------------------------------------------------------
  server.registerTool(
    'get_run_state',
    {
      description: 'Read and fold run events to reconstruct the current CanonicalRunStatus.',
      inputSchema: {
        runDir: z.string(),
      },
    },
    async (args) => {
      try {
        const result = await getRunState(args);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } catch (error) {
        return { content: [{ type: 'text', text: String(error) }], isError: true };
      }
    },
  );

  return server;
}
