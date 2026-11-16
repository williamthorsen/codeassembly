import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { McpServer } from '@modelcontextprotocol/server';
import { type AgentProfile, AgentRunError, type RunEvent, runPrompt } from '@williamthorsen/toolbelt.acp/proposed';
import { z } from 'zod';

import type { ConvertResult } from '../convert/convert-prompt.ts';
import { coverageMapSchema } from '../coverage-map/coverage-map-schema.ts';
import { findPackageRoot } from '../package-files/find-package-root.ts';
import { createConversionSession, type SessionEvent } from './create-conversion-session.ts';

/** The name of the MCP server through which the agent reaches the conversion's tools. */
export const CONVERSION_SERVER_NAME = 'agent_logic';

/** The JSON-RPC error code with which ACP reports that the agent requires authentication. */
const AUTH_REQUIRED_CODE = -32_000;

/** What `convertWithAgent` converts, and on which agent. */
export interface ConvertWithAgentOptions {
  /** The prompt, verbatim. */
  readonly prompt: string;
  /** The prompt's file name, from which the config's root id derives. */
  readonly name: string;
  /** The agent profile, which must define `isToolServerCall`. */
  readonly agent: AgentProfile;
  /** Ends the run, which then rejects with the signal's reason. */
  readonly signal?: AbortSignal;
}

/** A step of a conversion, or its outcome, which is always the last event. */
export type ConversionEvent =
  | SessionEvent
  | { readonly type: 'message'; readonly text: string }
  | {
      readonly type: 'result';
      readonly result: ConvertResult;
      /** Token counts, when the agent reports them. */
      readonly usage?: { readonly inputTokens: number; readonly outputTokens: number; readonly totalTokens: number };
      /** The session's cost, when the agent reports one. */
      readonly cost?: { readonly amount: number; readonly currency: string };
    };

/**
 * Converts a prompt by directing an ACP agent through the conversion: The agent receives the conversion's instructions
 * and the extraction rules, checks its coverage map through a `check_coverage` tool, and submits each draft through a
 * `submit_draft` tool, which converts it. The agent runs in an empty temporary directory, which is removed when the run
 * ends, and every request other than a call of those tools is refused. Yields the agent's message text and each check
 * and submission, then a `result` event that contains the outcome of the last submission.
 *
 * Rejects before the agent starts when the profile cannot identify calls of the conversion's tools, which
 * `codexProfile` cannot; when the agent ends its turn without submitting a draft; with the signal's reason when the
 * signal aborts; and, when the agent fails, with an error that names the cause, such as a harness that is not signed
 * in.
 *
 * @stage proposed
 * @experimental
 */
export const convertWithAgent: (options: ConvertWithAgentOptions) => AsyncGenerator<ConversionEvent> =
  createConvertWithAgent(runPrompt);

/** Returns `convertWithAgent` running prompts through `runPromptImpl`, which tests replace. */
export function createConvertWithAgent(
  runPromptImpl: typeof runPrompt,
): (options: ConvertWithAgentOptions) => AsyncGenerator<ConversionEvent> {
  return async function* ({ prompt, name, agent, signal }) {
    if (agent.isToolServerCall === undefined) {
      throw new Error(
        `The agent \`${agent.command}\` cannot convert a prompt: Its profile cannot identify calls of the conversion's tools, so they would be refused.`,
      );
    }
    signal?.throwIfAborted();

    const pending: SessionEvent[] = [];
    const session = createConversionSession({
      prompt,
      name,
      onEvent: (event) => {
        pending.push(event);
      },
    });
    const instructions = await readInstructions();
    const cwd = await mkdtemp(path.join(os.tmpdir(), 'agent-logic-conversion-'));
    try {
      let stopped: Extract<RunEvent, { type: 'stopped' }> | undefined;
      try {
        const run = runPromptImpl({
          agent,
          cwd,
          instructions,
          prompt: `Prompt file: ${name}\n\n${prompt}`,
          tools: {
            name: CONVERSION_SERVER_NAME,
            createServer: () => createConversionServer(session),
            isPreapproved: true,
          },
          ...(signal !== undefined && { signal }),
        });
        for await (const event of run) {
          yield* pending.splice(0);
          if (event.type === 'stopped') stopped = event;
          else if (event.update.sessionUpdate === 'agent_message_chunk' && event.update.content.type === 'text') {
            yield { type: 'message', text: event.update.content.text };
          }
        }
      } catch (error) {
        if (signal?.aborted === true) throw signal.reason;
        throw describeRunError(error);
      }
      yield* pending.splice(0);
      if (signal?.aborted === true) throw signal.reason;

      const { result } = session;
      if (result === undefined) {
        const stopReason = stopped?.stopReason ?? 'unknown';
        throw new Error(`The agent ended its turn (stop reason: ${stopReason}) without submitting a draft.`);
      }
      yield {
        type: 'result',
        result,
        ...(stopped?.usage !== undefined && {
          usage: {
            inputTokens: stopped.usage.inputTokens,
            outputTokens: stopped.usage.outputTokens,
            totalTokens: stopped.usage.totalTokens,
          },
        }),
        ...(stopped?.cost !== undefined && { cost: { amount: stopped.cost.amount, currency: stopped.cost.currency } }),
      };
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  };
}

// region | Helpers
/** Builds an MCP server that exposes the session's two tools. */
function createConversionServer(session: ReturnType<typeof createConversionSession>): McpServer {
  const server = new McpServer({ name: CONVERSION_SERVER_NAME, version: '1.0.0' });
  server.registerTool(
    'check_coverage',
    {
      description: 'Checks a coverage map of the prompt against the prompt.',
      inputSchema: z.object({ map: coverageMapSchema }),
    },
    ({ map }) => ({ content: [{ type: 'text', text: session.checkCoverage(map) }] }),
  );
  server.registerTool(
    'submit_draft',
    {
      description: "Converts a draft of the prompt's logic into an agent-logic config, or reports its problems.",
      inputSchema: z.object({ draft: z.string().describe("The draft's JSON text.") }),
    },
    ({ draft }) => ({ content: [{ type: 'text', text: session.submitDraft(draft) }] }),
  );
  return server;
}

/** Returns an error that names the cause of a failed run: a harness that is not signed in, or the run's own error. */
function describeRunError(error: unknown): unknown {
  if (!(error instanceof AgentRunError)) return error;
  const { cause } = error;
  const isSignInRequired =
    typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === AUTH_REQUIRED_CODE;
  if (!isSignInRequired) return error;
  return new Error(`The agent \`${error.command}\` is not signed in: Sign in to its harness, then convert again.`, {
    cause: error,
  });
}

/** Reads the conversion's instructions followed by the extraction rules, from the package's `docs/`. */
async function readInstructions(): Promise<string> {
  const docs = path.join(findPackageRoot(), 'docs');
  const parts = await Promise.all(
    ['agent-instructions.md', 'extraction-rules.md'].map((file) => readFile(path.join(docs, file), 'utf8')),
  );
  return parts.join('\n');
}
// endregion | Helpers
