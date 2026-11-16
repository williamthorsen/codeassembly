import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import type { RunEvent, runPrompt, RunPromptOptions, StopReason } from '@williamthorsen/toolbelt.acp/proposed';

/** What a scripted agent does with the run's tools; returns what the turn ends with. */
export type AgentScript = (agent: {
  callTool: (name: string, args: Record<string, unknown>) => Promise<string>;
  say: (text: string) => void;
  options: RunPromptOptions;
}) => Promise<{ stopReason?: StopReason } | undefined>;

/**
 * Returns a `runPrompt` stand-in that plays `script` against the run's tool server over an in-memory MCP connection,
 * and the options of each run that it received.
 */
export function createFakeRunPrompt(script: AgentScript): { runPrompt: typeof runPrompt; runs: RunPromptOptions[] } {
  const runs: RunPromptOptions[] = [];
  async function* fakeRunPrompt(options: RunPromptOptions): AsyncGenerator<RunEvent> {
    runs.push(options);
    const { tools } = options;
    if (tools === undefined) throw new Error('The fake agent needs a tool server.');
    const server = await tools.createServer({ era: 'modern' });
    const client = new Client({ name: 'fake-agent', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const messages: string[] = [];
    try {
      const ending = await script({
        options,
        say: (text) => {
          messages.push(text);
        },
        async callTool(name, args) {
          const result = await client.callTool({ name, arguments: args });
          return result.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
        },
      });
      for (const text of messages) {
        yield { type: 'update', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } } };
      }
      yield {
        type: 'stopped',
        stopReason: ending?.stopReason ?? 'end_turn',
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      };
    } finally {
      await client.close();
    }
  }
  return { runPrompt: fakeRunPrompt, runs };
}
