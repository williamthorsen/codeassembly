import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ConversionEvent, ConvertWithAgentOptions } from '../../agent/convert-with-agent.ts';
import { convertPrompt, type ConvertResult } from '../../convert/convert-prompt.ts';
import { runConvertWithAgentCommand } from '../convert-with-agent-command.ts';

const PROMPT = 'Greet the user, then wait for a reply.\n\nWhen the user replies, finish.';

const DRAFT = {
  initial: 'greeting',
  states: {
    greeting: {
      on: { 'user.replied': { target: '#done', meta: { quote: 'When the user replies' } } },
      meta: { quote: 'Greet the user, then wait for a reply' },
    },
    done: { type: 'final', meta: { quote: 'finish' } },
  },
  meta: { unconverted: [] },
};

describe(runConvertWithAgentCommand, () => {
  let root = '';
  let promptFile = '';

  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'convert-with-agent-command-'));
    promptFile = path.join(root, 'greeter.md');
    writeFileSync(promptFile, PROMPT);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('prints the help, which documents the command, and exits 0', async () => {
    const output = await runConvertWithAgentCommand(['--help']);

    expect(output.exitCode).toBe(0);
    expect(output.stdout).toMatch(
      /^Converts an agent prompt[\s\S]*--agent <name>[\s\S]*antigravity, claude-code, codex/,
    );
  });

  it.each([
    [[], /expected 1 or 2 arguments, received 0/],
    [['--agent', 'claude-code', 'a.md', 'b.json', 'c'], /expected 1 or 2 arguments, received 3/],
    [['prompt.md'], /--agent must be one of antigravity, claude-code, codex, received none/],
    [['--agent', 'gpt', 'prompt.md'], /--agent must be one of .*, received "gpt"/],
    [['--agnt', 'x'], /Unknown option '--agnt'/],
  ])('exits 2 for the arguments %j', async (args, message) => {
    const output = await runConvertWithAgentCommand(args, { convert: failIfCalled });

    expect(output.exitCode).toBe(2);
    expect(output.stderr).toMatch(message);
  });

  it('exits 2 for a prompt file that does not exist', async () => {
    const output = await runConvertWithAgentCommand(['--agent', 'claude-code', path.join(root, 'missing.md')], {
      convert: failIfCalled,
    });

    expect(output.exitCode).toBe(2);
    expect(output.stderr).toMatch(/pass the path of an existing file/);
  });

  it('writes the config beside the prompt, reports progress, and exits 0', async () => {
    const progress: string[] = [];
    const runs: ConvertWithAgentOptions[] = [];
    const output = await runConvertWithAgentCommand(['--agent', 'claude-code', promptFile], {
      convert: (options) => {
        runs.push(options);
        return emit(convertPrompt(PROMPT, JSON.stringify(DRAFT), 'greeter.md'));
      },
      writeProgress: (line) => {
        progress.push(line);
      },
    });

    const outputFile = path.join(root, 'greeter.agent-logic.json');
    expect(output).toStrictEqual({
      exitCode: 0,
      stderr: '',
      stdout: `agent-logic convert-with-agent: wrote ${outputFile}\n`,
    });
    expect(JSON.parse(readFileSync(outputFile, 'utf8'))).toMatchObject({ id: 'greeter' });
    expect(runs).toMatchObject([{ prompt: PROMPT, name: 'greeter.md', agent: { command: 'claude-agent-acp' } }]);
    expect(progress).toStrictEqual([
      'agent-logic convert-with-agent: coverage check 1: 0 unmapped blocks, 0 quote problems',
      'agent-logic convert-with-agent: draft 1: config',
      'agent-logic convert-with-agent: used 15 tokens, 0.01 USD',
    ]);
  });

  it('writes the config to the named output file', async () => {
    const outputFile = path.join(root, 'chart.json');

    const output = await runConvertWithAgentCommand(['--agent', 'antigravity', promptFile, outputFile], {
      convert: () => emit(convertPrompt(PROMPT, JSON.stringify(DRAFT), 'greeter.md')),
      writeProgress: ignoreProgress,
    });

    expect(output.exitCode).toBe(0);
    expect(existsSync(outputFile)).toBe(true);
  });

  it("lists the last draft's problems, writes nothing, and exits 1", async () => {
    const output = await runConvertWithAgentCommand(['--agent', 'claude-code', promptFile], {
      convert: () => emit({ ok: false, problems: [{ path: 'states.done.meta.quote', message: 'Not in the prompt.' }] }),
      writeProgress: ignoreProgress,
    });

    expect(output.exitCode).toBe(1);
    expect(output.stderr).toContain('agent-logic convert-with-agent: states.done.meta.quote: Not in the prompt.\n');
    expect(existsSync(path.join(root, 'greeter.agent-logic.json'))).toBe(false);
  });

  it('reports an out-of-scope verdict and exits 3', async () => {
    const output = await runConvertWithAgentCommand(['--agent', 'claude-code', promptFile], {
      convert: () => emit({ ok: false, outOfScope: { reason: 'No steps.' } }),
      writeProgress: ignoreProgress,
    });

    expect(output.exitCode).toBe(3);
    expect(output.stderr).toBe('agent-logic convert-with-agent: the prompt is out of scope: No steps.\n');
  });

  it('reports a rejected run and exits 2', async () => {
    const output = await runConvertWithAgentCommand(['--agent', 'codex', promptFile], {
      convert: async function* () {
        await Promise.resolve();
        yield* [];
        throw new Error('The agent cannot convert a prompt.');
      },
      writeProgress: ignoreProgress,
    });

    expect(output.exitCode).toBe(2);
    expect(output.stderr).toBe('agent-logic convert-with-agent: The agent cannot convert a prompt.\n');
  });
});

// region | Helpers
/** Yields one coverage check and one submission, then `result` with usage and cost. */
async function* emit(result: ConvertResult): AsyncGenerator<ConversionEvent> {
  await Promise.resolve();
  yield { type: 'coverage-checked', check: 1, unmapped: 0, quoteProblems: 0 };
  yield { type: 'message', text: 'Done.' };
  const outcome = result.ok ? 'config' : 'outOfScope' in result ? 'out-of-scope' : 'problems';
  const problems = 'problems' in result ? result.problems.length : 0;
  yield { type: 'draft-submitted', submission: 1, outcome, problems };
  yield {
    type: 'result',
    result,
    usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    cost: { amount: 0.01, currency: 'USD' },
  };
}

/** Fails the test when the command converts despite wrong arguments. */
function failIfCalled(): AsyncGenerator<ConversionEvent> {
  throw new Error('The command converted despite wrong arguments.');
}

/** Discards a progress line. */
function ignoreProgress(): void {}

// endregion | Helpers
