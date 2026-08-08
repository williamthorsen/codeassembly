import { homedir } from 'node:os';
import { join } from 'node:path';

import { create, type CreatedStore } from '../../create/create.ts';
import { takeInlineValue, takeValue } from '../parse-flag-value.ts';
import type { SelectKbPrompt } from '../select-kb-prompt.ts';
import type { CommandOutput } from './check.ts';
import { runSetDefault } from './set-default.ts';

/** Usage text for `kb create`. */
export const CREATE_HELP = `Usage: kb create [options]

Scaffold a new knowledge base in the current directory and register it in the user-global kb.yaml registry.

When the registry has no default knowledge base, the new store becomes the default.
If other knowledge bases are already registered, you are prompted to choose one (or set it later with "kb set-default").

Creates:
  .kb/config.yaml        check configuration (commented; defaults apply)
  .kb/tag-aliases.yaml   tag-alias map (empty)
  content/, content/events/

Options:
  --description <text>  Description for the registry entry; cannot be combined with --no-register.
  --name <name>         Registry name for the store. Defaults to the directory name.
  --no-register         Scaffold without writing the kb.yaml registry entry.
  -h, --help            Show this help.

Exit codes:
  0  store created
  2  usage error, an existing .kb/ in the directory, or an already-registered name
`;

/**
 * Runs `kb create`: parses options, scaffolds a store in `cwd`, and (unless `--no-register`) registers it in the
 * user-global `~/.agents/kb.yaml`. After registering, it ensures a default knowledge base: the new store becomes the
 * default when none is set and it is the only KB; when other KBs already exist with no default, it delegates to
 * `kb set-default`'s picker (or, with no `selectKb` on a non-interactive stdin, points the user there). A precondition
 * failure from `create` — an existing `.kb/` or an already-registered name — maps to exit 2; a genuine I/O error
 * propagates to the caller.
 */
export async function runCreate(input: {
  argv: readonly string[];
  cwd: string;
  home?: string;
  selectKb?: SelectKbPrompt;
}): Promise<CommandOutput> {
  let options: CreateOptions;
  try {
    options = parseCreateArgs(input.argv);
  } catch (error) {
    return buildUsageError(error);
  }

  if (options.help) {
    return { exitCode: 0, stdout: CREATE_HELP, stderr: '' };
  }

  const registryPath = join(input.home ?? homedir(), '.agents', 'kb.yaml');
  const base = { targetDir: input.cwd, ...(options.name !== null && { name: options.name }) };
  const outcome = options.noRegister
    ? await create({ ...base, register: false })
    : await create({
        ...base,
        register: true,
        registryPath,
        ...(options.description !== null && { description: options.description }),
      });

  if (!outcome.ok) {
    return { exitCode: 2, stdout: '', stderr: `kb create: ${outcome.message}\n` };
  }

  const summary = formatCreated(outcome.created, registryPath);
  if (outcome.created.defaultKb !== 'needs-selection') {
    return { exitCode: 0, stdout: summary, stderr: '' };
  }

  // No default is set and other KBs already exist: let the user pick one, reusing `kb set-default`'s interactive form.
  if (input.selectKb === undefined) {
    return { exitCode: 0, stdout: summary + UNSET_DEFAULT_HINT, stderr: '' };
  }
  const selection = await runSetDefault({
    argv: [],
    ...(input.home !== undefined && { home: input.home }),
    selectKb: input.selectKb,
  });
  // The exit code reflects the store creation that already succeeded, not the follow-on default selection.
  return { exitCode: 0, stdout: summary + selection.stdout, stderr: selection.stderr };
}

/** Parsed `kb create` options. */
interface CreateOptions {
  /** Description from `--description`, or `null` to write the entry without one. */
  description: string | null;
  /** Explicit registry name from `--name`, or `null` to default to the directory name. */
  name: string | null;
  /** Whether `--no-register` was supplied. */
  noRegister: boolean;
  /** Whether `--help`/`-h` was supplied. */
  help: boolean;
}

/**
 * Parses `kb create` options. Each value-taking flag accepts both the space form and the equals form. Unknown flags, a
 * missing value, or a description supplied alongside `--no-register` throw with a usage-style message.
 */
export function parseCreateArgs(argv: readonly string[]): CreateOptions {
  let description: string | null = null;
  let name: string | null = null;
  let noRegister = false;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
    if (arg === '--description') {
      description = takeValue(argv, index, '--description');
      index += 1;
      continue;
    }
    if (arg.startsWith('--description=')) {
      description = takeInlineValue(arg, '--description=');
      continue;
    }
    if (arg === '--no-register') {
      noRegister = true;
      continue;
    }
    if (arg === '--name') {
      name = takeValue(argv, index, '--name');
      index += 1;
      continue;
    }
    if (arg.startsWith('--name=')) {
      name = takeInlineValue(arg, '--name=');
      continue;
    }

    throw new Error(`unknown flag: ${arg}`);
  }

  // A description has nowhere to go without a registry entry, so reject the combination rather than discarding it.
  if (noRegister && description !== null) {
    throw new Error('--description cannot be combined with --no-register');
  }

  return { description, name, noRegister, help };
}

// region | Helpers

// Guidance shown when a created store leaves the registry with multiple KBs and no default, with no picker available.
const UNSET_DEFAULT_HINT =
  'Multiple knowledge bases are registered and no default is set. Run `kb set-default` to choose one.\n';

/** Builds a usage-error `CommandOutput` (exit 2) from a thrown parse error. */
function buildUsageError(error: unknown): CommandOutput {
  const message = error instanceof Error ? error.message : String(error);
  return { exitCode: 2, stdout: '', stderr: `kb create: ${message}\n${CREATE_HELP}` };
}

/** Builds a human summary of a created store. If the new store became the default, reports that in the message. */
function formatCreated(created: CreatedStore, registryPath: string): string {
  const lines = [`Created knowledge base "${created.name}" at ${created.storePath}`];
  for (const path of created.created) {
    lines.push(`  ${path}`);
  }
  lines.push(created.registered ? `Registered in ${registryPath}` : 'Not registered (--no-register).');
  if (created.description !== undefined) {
    lines.push(`Description: ${created.description}`);
  }
  if (created.defaultKb === 'set') {
    lines.push('Set as the default knowledge base.');
  }
  return `${lines.join('\n')}\n`;
}

// endregion | Helpers
