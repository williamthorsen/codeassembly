import { homedir } from 'node:os';
import { join } from 'node:path';

import { create, type CreatedStore } from '../../create/create.ts';
import type { CommandOutput } from './check.ts';

/** Usage text for `kb create`. */
export const CREATE_HELP = `Usage: kb create [options]

Scaffold a new knowledge base in the current directory and register it in the
user-global kb.yaml registry.

Creates:
  .kb/schema.yaml        record-type schema (a copy of the bundled default)
  .kb/config.yaml        check configuration (commented; defaults apply)
  .kb/tag-aliases.yaml   tag-alias map (empty)
  content/, content/events/

Options:
  --name <name>   Registry name for the store. Defaults to the directory name.
  --no-register   Scaffold without writing the kb.yaml registry entry.
  -h, --help      Show this help.

Exit codes:
  0  store created
  2  usage error, an existing .kb/ in the directory, or an already-registered name
`;

/**
 * Runs `kb create`: parses options, scaffolds a store in `cwd`, and (unless `--no-register`) registers it in the
 * user-global `~/.agents/kb.yaml`. A precondition failure from `create` — an existing `.kb/` or an already-registered
 * name — maps to exit 2; a genuine I/O error propagates to the caller.
 */
export async function runCreate(input: {
  argv: readonly string[];
  cwd: string;
  home?: string;
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
    : await create({ ...base, register: true, registryPath });

  if (!outcome.ok) {
    return { exitCode: 2, stdout: '', stderr: `kb create: ${outcome.message}\n` };
  }
  return { exitCode: 0, stdout: formatCreated(outcome.created, registryPath), stderr: '' };
}

// region | Helpers

/** Builds a usage-error `CommandOutput` (exit 2) from a thrown parse error. */
function buildUsageError(error: unknown): CommandOutput {
  const message = error instanceof Error ? error.message : String(error);
  return { exitCode: 2, stdout: '', stderr: `kb create: ${message}\n${CREATE_HELP}` };
}

/** Builds the human summary of a created store. */
function formatCreated(created: CreatedStore, registryPath: string): string {
  const lines = [`Created knowledge base "${created.name}" at ${created.storePath}`];
  for (const path of created.created) {
    lines.push(`  ${path}`);
  }
  lines.push(created.registered ? `Registered in ${registryPath}` : 'Not registered (--no-register).');
  return `${lines.join('\n')}\n`;
}

/** Parsed `kb create` options. */
interface CreateOptions {
  /** Explicit registry name from `--name`, or `null` to default to the directory name. */
  name: string | null;
  /** Whether `--no-register` was supplied. */
  noRegister: boolean;
  /** Whether `--help`/`-h` was supplied. */
  help: boolean;
}

/**
 * Parses `kb create` options. `--name` accepts both `--name x` and `--name=x`. Unknown flags or a missing `--name`
 * value throw with a usage-style message.
 */
export function parseCreateArgs(argv: readonly string[]): CreateOptions {
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
    if (arg === '--no-register') {
      noRegister = true;
      continue;
    }
    if (arg === '--name') {
      const next = argv[index + 1] ?? null;
      if (next === null || next.startsWith('--')) {
        throw new Error('--name requires a value');
      }
      name = next;
      index += 1;
      continue;
    }
    if (arg.startsWith('--name=')) {
      const value = arg.slice('--name='.length);
      if (value === '') {
        throw new Error('--name requires a value');
      }
      name = value;
      continue;
    }

    throw new Error(`unknown flag: ${arg}`);
  }

  return { name, noRegister, help };
}

// endregion | Helpers
