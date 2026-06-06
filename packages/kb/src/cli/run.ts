import { type CommandOutput, runCheck } from './commands/check.ts';

/** Top-level usage text for the `kb` bin. */
export const HELP = `Usage: kb <command> [options]

Commands:
  check   Validate every note in a knowledge base against its rules.

Run "kb check --help" for command options.
`;

/**
 * Dispatches a `kb` subcommand and returns its {@link CommandOutput} without touching `process`, so tests drive the
 * command directly. `check` is the only subcommand; a bare invocation or `--help`/`-h` prints top-level usage (exit
 * 0), and an unknown command prints usage to stderr (exit 2).
 */
export async function run(input: { argv: readonly string[]; cwd: string; home?: string }): Promise<CommandOutput> {
  const [command, ...rest] = input.argv;

  if (command === undefined || command === '--help' || command === '-h') {
    return { exitCode: 0, stdout: HELP, stderr: '' };
  }

  if (command === 'check') {
    return runCheck({ argv: rest, cwd: input.cwd, ...(input.home !== undefined && { home: input.home }) });
  }

  return { exitCode: 2, stdout: '', stderr: `kb: unknown command "${command}"\n${HELP}` };
}

export { CHECK_HELP } from './commands/check.ts';
