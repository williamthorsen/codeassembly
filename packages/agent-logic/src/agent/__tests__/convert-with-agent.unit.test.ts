import { existsSync } from 'node:fs';

import {
  AgentRunError,
  claudeCodeProfile,
  codexProfile,
  type RunPromptOptions,
} from '@williamthorsen/toolbelt.acp/proposed';
import { describe, expect, it } from 'vitest';

import { type ConversionEvent, createConvertWithAgent } from '../convert-with-agent.ts';
import { MAX_SUBMISSIONS } from '../../conversion-session/create-conversion-session.ts';
import { type AgentScript, createFakeRunPrompt } from '../test-utils/create-fake-run-prompt.ts';
import { GREETER_DRAFT, GREETER_MAP, GREETER_PROMPT, MISQUOTED_GREETER_DRAFT } from '../../test-utils/greeter-draft.ts';

describe('convertWithAgent', () => {
  it('ends with the config that the agent submitted, after its checks and messages', async () => {
    const { events } = await runConversion(async ({ callTool, say }) => {
      say('Checking the map.');
      await callTool('check_coverage', { map: GREETER_MAP });
      await callTool('submit_draft', { draft: JSON.stringify(GREETER_DRAFT) });
      return undefined;
    });

    expect(events.map(({ type }) => type)).toStrictEqual(['coverage-checked', 'draft-submitted', 'message', 'result']);
    expect(events.at(-1)).toMatchObject({
      type: 'result',
      result: { ok: true, config: { id: 'greeter' } },
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    });
  });

  it('ends with an out-of-scope verdict', async () => {
    const { events } = await runConversion(async ({ callTool }) => {
      await callTool('submit_draft', { draft: JSON.stringify({ outOfScope: { reason: 'No steps.' } }) });
      return undefined;
    });

    expect(events.at(-1)).toMatchObject({ type: 'result', result: { ok: false, outOfScope: { reason: 'No steps.' } } });
  });

  it("ends with the fifth submission's problems once the drafts are used up", async () => {
    const replies: string[] = [];
    const { events } = await runConversion(async ({ callTool }) => {
      for (let submission = 0; submission <= MAX_SUBMISSIONS; submission += 1) {
        replies.push(await callTool('submit_draft', { draft: JSON.stringify(MISQUOTED_GREETER_DRAFT) }));
      }
      return undefined;
    });

    expect(replies.at(-1)).toBe('No more drafts are accepted. End your turn.');
    expect(events.filter(({ type }) => type === 'draft-submitted')).toHaveLength(MAX_SUBMISSIONS);
    expect(events.at(-1)).toMatchObject({ result: { ok: false, problems: [{ path: 'states.done.meta.quote' }] } });
  });

  it('rejects a turn that ends without a submission, naming the stop reason', async () => {
    await expect(runConversion(() => Promise.resolve({ stopReason: 'max_tokens' }))).rejects.toThrow(
      'The agent ended its turn (stop reason: max_tokens) without submitting a draft.',
    );
  });

  it('rejects a profile that cannot identify calls of its tools before the agent starts', async () => {
    const { runPrompt, runs } = createFakeRunPrompt(() => Promise.resolve(undefined));

    await expect(collect(createConvertWithAgent(runPrompt)({ ...INPUT, agent: codexProfile() }))).rejects.toThrow(
      /cannot identify calls of the conversion's tools/,
    );
    expect(runs).toHaveLength(0);
  });

  it('runs in an empty temporary directory with the instructions, the prompt, and only its preapproved tools', async () => {
    const { runs } = await runConversion(async ({ callTool }) => {
      await callTool('submit_draft', { draft: JSON.stringify(GREETER_DRAFT) });
      return undefined;
    });

    const [options] = runs;
    expect(options?.prompt).toBe(`Prompt file: greeter.md\n\n${GREETER_PROMPT}`);
    expect(options?.instructions).toMatch(
      /^# Converting a prompt with the conversion tools\n[\s\S]*\n# Extraction rules\n/,
    );
    expect(options?.tools).toMatchObject({ name: 'agent_logic', isPreapproved: true });
    expect(options?.permissionPolicy).toBeUndefined();
    expect(options !== undefined && existsSync(options.cwd)).toBe(false);
  });

  it('rejects with the signal reason when the signal aborts, and removes the directory', async () => {
    const controller = new AbortController();
    const reason = new Error('Stopped by the user.');
    const conversion = runConversion(async ({ callTool }) => {
      await callTool('submit_draft', { draft: JSON.stringify(GREETER_DRAFT) });
      controller.abort(reason);
      return { stopReason: 'cancelled' };
    }, controller.signal);

    await expect(conversion).rejects.toBe(reason);
  });

  it('rejects a harness that is not signed in with a reason that says so', async () => {
    // The SDK's RequestError, which the adapter answers with, is recognized by its code alone.
    const cause = Object.assign(new Error('Authentication required'), { code: -32_000 });
    const failure = new AgentRunError({ command: 'claude-agent-acp', stderrTail: '' }, { cause });

    await expect(runConversion(() => Promise.reject(failure))).rejects.toThrow(
      'The agent `claude-agent-acp` is not signed in: Sign in to its harness, then convert again.',
    );
  });

  it('rejects with any other AgentRunError as it is', async () => {
    const failure = new AgentRunError(
      { command: 'agy', exitCode: 1, stderrTail: 'boom' },
      { cause: new Error('closed') },
    );

    await expect(runConversion(() => Promise.reject(failure))).rejects.toBe(failure);
  });
});

// region | Helpers
const INPUT = { prompt: GREETER_PROMPT, name: 'greeter.md' };

/** Collects every event of a conversion. */
async function collect(conversion: AsyncIterable<ConversionEvent>): Promise<ConversionEvent[]> {
  return Array.fromAsync(conversion);
}

/** Runs a conversion of the greeter prompt on a fake Claude agent that plays `script`. */
async function runConversion(
  script: AgentScript,
  signal?: AbortSignal,
): Promise<{ events: ConversionEvent[]; runs: RunPromptOptions[] }> {
  const { runPrompt, runs } = createFakeRunPrompt(script);
  const options = { ...INPUT, agent: claudeCodeProfile(), ...(signal !== undefined && { signal }) };
  const events = await collect(createConvertWithAgent(runPrompt)(options));
  for (const run of runs) expect(existsSync(run.cwd)).toBe(false);
  return { events, runs };
}
// endregion | Helpers
