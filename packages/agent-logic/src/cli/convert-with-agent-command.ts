import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { describeError } from '@williamthorsen/toolbelt.errors';

import type { ConversionEvent, ConvertWithAgentOptions } from '../agent/convert-with-agent.ts';
import type { ConvertResult } from '../convert/convert-prompt.ts';
import { readPackageVersion } from '../package-files/find-package-root.ts';
import type { CommandOutput } from './run.ts';

const PROGRAM = 'agent-logic convert-with-agent';

/** The profile names that `--agent` accepts, in the order that the help lists them. */
const AGENT_NAMES = ['antigravity', 'claude-code', 'codex'] as const;

type AgentName = (typeof AGENT_NAMES)[number];

const HELP = `Converts an agent prompt into an agent-logic config by directing an ACP agent through the conversion.

Usage: ${PROGRAM} [options] <prompt-file> [output-file]

Arguments:
  prompt-file   the prompt, read verbatim
  output-file   where to write the config; written only when the config is valid.
                Default: <base>.agent-logic.json beside the prompt

Options:
  --agent <name>  the agent profile: ${AGENT_NAMES.join(', ')} (required)
  -h, --help      print this help
  -V, --version   print the version

The command needs the optional peers @williamthorsen/toolbelt.acp and
@modelcontextprotocol/server, and the agent's harness installed and signed in.
It reports each coverage check and draft submission on stderr as it happens.

Exit codes:
  0  the config was written
  1  the agent's last draft has problems, which are listed
  2  the arguments or files are wrong, or the run failed
  3  the agent reports the prompt out of scope

Example:
  ${PROGRAM} --agent claude-code prompts/refund-request.md
`;

/** What the command uses that a test replaces. */
export interface ConvertWithAgentCommandDependencies {
  /** Converts the prompt; defaults to `convertWithAgent`. */
  convert?: (options: ConvertWithAgentOptions) => AsyncIterable<ConversionEvent>;
  /** Writes a progress line as it happens; defaults to the process's stderr. */
  writeProgress?: (line: string) => void;
}

/** Runs `agent-logic convert-with-agent`: converts a prompt file on a named agent profile and writes the config. */
export async function runConvertWithAgentCommand(
  args: readonly string[],
  dependencies: ConvertWithAgentCommandDependencies = {},
): Promise<CommandOutput> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCode = await runCli(args, dependencies, stdout, stderr);
  return { exitCode, stderr: stderr.join(''), stdout: stdout.join('') };
}

// region | Helpers
/** Returns `<base>.agent-logic.json` in the prompt's directory, where `<base>` is its name without the extension. */
function deriveOutputPath(promptFile: string): string {
  const base = path.basename(promptFile, path.extname(promptFile));
  return path.join(path.dirname(promptFile), `${base}.agent-logic.json`);
}

/** Describes an event as a progress line, or returns `undefined` for an event that the command does not report. */
function describeEvent(event: ConversionEvent): string | undefined {
  switch (event.type) {
    case 'coverage-checked':
      return `coverage check ${event.check}: ${event.unmapped} unmapped blocks, ${event.quoteProblems} quote problems`;
    case 'draft-submitted':
      return `draft ${event.submission}: ${event.outcome === 'problems' ? `${event.problems} problems` : event.outcome}`;
    case 'message':
      return undefined;
    case 'result': {
      const usage = event.usage === undefined ? undefined : `${event.usage.totalTokens} tokens`;
      const cost = event.cost === undefined ? undefined : `${event.cost.amount} ${event.cost.currency}`;
      const parts = [usage, cost].filter((part) => part !== undefined);
      return parts.length === 0 ? undefined : `used ${parts.join(', ')}`;
    }
  }
}

/** Reports whether `value` names one of the profiles that `--agent` accepts. */
function isAgentName(value: unknown): value is AgentName {
  return AGENT_NAMES.some((name) => name === value);
}

/**
 * Loads the agent profile and the converter, which import the optional peers, so that the other commands run without
 * them.
 */
async function loadAgent(
  agentName: AgentName,
  convert: ConvertWithAgentCommandDependencies['convert'],
): Promise<Required<Pick<ConvertWithAgentCommandDependencies, 'convert'>> & Pick<ConvertWithAgentOptions, 'agent'>> {
  const acp = await import('@williamthorsen/toolbelt.acp/proposed');
  const agent =
    agentName === 'antigravity'
      ? acp.antigravityProfile()
      : agentName === 'claude-code'
        ? acp.claudeCodeProfile()
        : acp.codexProfile();
  return { agent, convert: convert ?? (await import('../agent/convert-with-agent.ts')).convertWithAgent };
}

/**
 * Writes the config of a successful result, or reports the problems or the out-of-scope verdict; returns the exit
 * code.
 */
function reportResult(result: ConvertResult, outputFile: string, stdout: string[], stderr: string[]): number {
  if ('outOfScope' in result) {
    stderr.push(`${PROGRAM}: the prompt is out of scope: ${result.outOfScope.reason}\n`);
    return 3;
  }
  if (!result.ok) {
    for (const { path: problemPath, message } of result.problems) {
      stderr.push(`${PROGRAM}: ${problemPath === '' ? '' : `${problemPath}: `}${message}\n`);
    }
    stderr.push(`${PROGRAM}: wrote nothing; the agent's last draft has these problems\n`);
    return 1;
  }
  try {
    writeFileSync(outputFile, result.text);
  } catch (error) {
    stderr.push(`${PROGRAM}: ${describeError(error)}; pass a path in a directory that exists and is writable\n`);
    return 2;
  }
  stdout.push(`${PROGRAM}: wrote ${outputFile}\n`);
  return 0;
}

/** Reads the arguments, does the work, and returns the exit code, collecting what it writes. */
async function runCli(
  args: readonly string[],
  dependencies: ConvertWithAgentCommandDependencies,
  stdout: string[],
  stderr: string[],
): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...args],
      allowPositionals: true,
      options: {
        agent: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'V' },
      },
    });
  } catch (error) {
    stderr.push(`${PROGRAM}: ${describeError(error)}; run ${PROGRAM} --help for usage\n`);
    return 2;
  }

  if (parsed.values.help === true) {
    stdout.push(HELP);
    return 0;
  }
  if (parsed.values.version === true) {
    stdout.push(`${readPackageVersion()}\n`);
    return 0;
  }

  const [promptFile, outputArgument, ...extra] = parsed.positionals;
  if (promptFile === undefined || extra.length > 0) {
    stderr.push(
      `${PROGRAM}: expected 1 or 2 arguments, received ${parsed.positionals.length}; run ${PROGRAM} --help for usage\n`,
    );
    return 2;
  }
  const agentName = parsed.values.agent;
  if (!isAgentName(agentName)) {
    const received = agentName === undefined ? 'none' : JSON.stringify(agentName);
    stderr.push(`${PROGRAM}: --agent must be one of ${AGENT_NAMES.join(', ')}, received ${received}\n`);
    return 2;
  }
  const outputFile = outputArgument ?? deriveOutputPath(promptFile);

  let prompt: string;
  try {
    prompt = readFileSync(promptFile, 'utf8');
  } catch (error) {
    stderr.push(`${PROGRAM}: ${describeError(error)}; pass the path of an existing file\n`);
    return 2;
  }

  const writeProgress =
    dependencies.writeProgress ??
    ((line: string) => {
      process.stderr.write(`${line}\n`);
    });
  let result: ConvertResult | undefined;
  try {
    const { agent, convert } = await loadAgent(agentName, dependencies.convert);
    const events = convert({ prompt, name: path.basename(promptFile), agent });
    for await (const event of events) {
      const line = describeEvent(event);
      if (line !== undefined) writeProgress(`${PROGRAM}: ${line}`);
      if (event.type === 'result') result = event.result;
    }
  } catch (error) {
    stderr.push(`${PROGRAM}: ${describeError(error)}\n`);
    return 2;
  }
  if (result === undefined) {
    stderr.push(`${PROGRAM}: the conversion ended without a result\n`);
    return 2;
  }
  return reportResult(result, outputFile, stdout, stderr);
}
// endregion | Helpers
