import { type CommandOutput, runCheck } from './commands/check.ts';
import { runCreate } from './commands/create.ts';
import { runScaffold } from './commands/scaffold.ts';
import { runSetDefault } from './commands/set-default.ts';
import { runTaxonomy } from './commands/taxonomy.ts';
import { OUTPUT_STYLE_ENV_VAR, resolveCliOutputStyle } from './resolve-cli-output-style.ts';
import type { SelectKbPrompt } from './select-kb-prompt.ts';

export const HELP = `Usage: kb <command> [options]

Commands:
  check        Validate a knowledge base, optionally scoped to selected notes.
  create       Scaffold a new knowledge base and register it in the kb.yaml registry.
  scaffold     Write into an existing knowledge base any canonical file that it lacks.
  set-default  Set, clear, or choose the default knowledge base.
  taxonomy     Derive a knowledge base's taxonomy from the notes that it already contains.

Options:
  --output-style <auto|plain|rich>
               Print status glyphs as emoji (rich) or words (plain). auto, the
               default, prints plain when stdout is not a terminal, in CI, or
               under TERM=linux. ${OUTPUT_STYLE_ENV_VAR} sets it when the flag is
               absent.

Run "kb <command> --help" for command options.
`;

/** The argv heads that print top-level usage: the two help flags, and `undefined` for a bare invocation. */
const HELP_COMMANDS: ReadonlySet<string | undefined> = new Set([undefined, '--help', '-h']);

/**
 * Dispatches a `kb` subcommand and returns its {@link CommandOutput} without touching `process`, so tests drive the
 * command directly. A bare invocation or `--help`/`-h` prints top-level usage (exit 0), and an unknown command prints
 * usage to stderr (exit 2). The optional `selectKb` picker is forwarded to `set-default`'s interactive form and to
 * `create`'s ambiguous default-KB prompt.
 *
 * `--output-style` is accepted anywhere before `--` and removed before dispatch; with `env` and `isTty` it resolves
 * the style of stdout, which is plain when neither is given.
 */
export async function run(input: {
  argv: readonly string[];
  cwd: string;
  env?: Readonly<Record<string, string | undefined>>;
  home?: string;
  isTty?: boolean;
  selectKb?: SelectKbPrompt;
}): Promise<CommandOutput> {
  const resolved = resolveCliOutputStyle({ argv: input.argv, env: input.env ?? {}, isTty: input.isTty ?? false });
  if (!resolved.ok) {
    return { exitCode: 2, stdout: '', stderr: `kb: ${resolved.message}\n` };
  }
  const [command, ...rest] = resolved.argv;

  if (HELP_COMMANDS.has(command)) {
    return { exitCode: 0, stdout: HELP, stderr: '' };
  }

  if (command === 'check') {
    return runCheck({
      argv: rest,
      cwd: input.cwd,
      style: resolved.style,
      ...(input.home !== undefined && { home: input.home }),
    });
  }

  if (command === 'create') {
    return runCreate({
      argv: rest,
      cwd: input.cwd,
      ...(input.home !== undefined && { home: input.home }),
      ...(input.selectKb !== undefined && { selectKb: input.selectKb }),
    });
  }

  if (command === 'scaffold') {
    return runScaffold({ argv: rest, cwd: input.cwd, ...(input.home !== undefined && { home: input.home }) });
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
