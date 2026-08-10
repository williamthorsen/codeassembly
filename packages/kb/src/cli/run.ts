import { type CommandOutput, runCheck } from './commands/check.ts';
import { runCreate } from './commands/create.ts';
import { runSetDefault } from './commands/set-default.ts';
import { runTaxonomy } from './commands/taxonomy.ts';
import type { SelectKbPrompt } from './select-kb-prompt.ts';

/** Top-level usage text for the `kb` bin. */
export const HELP = `Usage: kb <command> [options]

Commands:
  check        Validate a knowledge base, optionally scoped to selected notes.
  create       Scaffold a new knowledge base and register it in the kb.yaml registry.
  set-default  Set, clear, or choose the default knowledge base.
  taxonomy     Derive a knowledge base's taxonomy from the notes it already holds.

Run "kb <command> --help" for command options.
`;

/** The argv heads that print top-level usage: the two help flags, and `undefined` for a bare invocation. */
const HELP_COMMANDS: readonly (string | undefined)[] = [undefined, '--help', '-h'];

/**
 * Dispatches a `kb` subcommand and returns its {@link CommandOutput} without touching `process`, so tests drive the
 * command directly. `check`, `create`, `set-default`, and `taxonomy` are the subcommands; a bare invocation or
 * `--help`/`-h` prints top-level usage (exit 0), and an unknown command prints usage to stderr (exit 2). The optional
 * `selectKb` picker is forwarded to `set-default`'s interactive form and to `create`'s ambiguous default-KB prompt;
 * `cli/index.ts` supplies it only when stdin is a TTY.
 */
export async function run(input: {
  argv: readonly string[];
  cwd: string;
  home?: string;
  selectKb?: SelectKbPrompt;
}): Promise<CommandOutput> {
  const [command, ...rest] = input.argv;

  if (HELP_COMMANDS.includes(command)) {
    return { exitCode: 0, stdout: HELP, stderr: '' };
  }

  if (command === 'check') {
    return runCheck({ argv: rest, cwd: input.cwd, ...(input.home !== undefined && { home: input.home }) });
  }

  if (command === 'create') {
    return runCreate({
      argv: rest,
      cwd: input.cwd,
      ...(input.home !== undefined && { home: input.home }),
      ...(input.selectKb !== undefined && { selectKb: input.selectKb }),
    });
  }

  if (command === 'taxonomy') {
    return runTaxonomy({ argv: rest, cwd: input.cwd, ...(input.home !== undefined && { home: input.home }) });
  }

  if (command === 'set-default') {
    return runSetDefault({
      argv: rest,
      ...(input.home !== undefined && { home: input.home }),
      ...(input.selectKb !== undefined && { selectKb: input.selectKb }),
    });
  }

  return { exitCode: 2, stdout: '', stderr: `kb: unknown command "${command}"\n${HELP}` };
}
