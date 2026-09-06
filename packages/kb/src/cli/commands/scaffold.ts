import { describeError } from '@williamthorsen/toolbelt.errors';

import { directoryExists } from '../../filesystem/exists.ts';
import { KB_DIR, resolveKbDir } from '../../layout/index.ts';
import { scaffold, type ScaffoldEntry } from '../../scaffold/scaffold.ts';
import type { StoreRef } from '../format.ts';
import { takeInlineValue, takeValue } from '../parse-flag-value.ts';
import { resolveStore } from '../resolve-store.ts';
import type { CommandOutput } from './check.ts';

/** Usage text for `kb scaffold`. */
export const SCAFFOLD_HELP = `Usage: kb scaffold [options]

Write into an existing knowledge base any canonical file that it lacks, so a store
created before a given file existed can acquire it. An existing file is left
untouched unless --force is given.

Writes:
  .editorconfig          editor and formatter settings (width, indent, line endings)
  .kb/config.yaml        check configuration (commented; defaults apply)
  .kb/tag-aliases.yaml   tag-alias map (empty)
  .prettierrc.yaml       formatting configuration (commented)
  content/, content/events/

.kb/taxonomy.yaml is not part of this set: "kb taxonomy init" derives it from
the notes that the store already holds. Use "kb create" to make a new store.

Options:
  --force       Replace an existing canonical file with a fresh seed. A
                directory has no content to replace and is left as it is.
  --kb <name>   Use the named store from the kb.yaml registry. Without it, the
                nearest ancestor .kb/ directory is used.
  -h, --help    Show this help.

Exit codes:
  0  every canonical file is present, whether it was written or already there
  2  usage error, unresolvable store, a store marked readonly in kb.yaml, or a
     resolved path holding no ${KB_DIR}/
`;

/**
 * Runs `kb scaffold`: parses options, resolves the store, and writes the canonical files it lacks.
 *
 * Store resolution matches `kb check`. A store the registry marks `readonly` is refused, as `kb taxonomy init` does.
 * A resolved path holding no `.kb/` is refused too: the command back-fills a store rather than creating one, and a
 * registry entry names a path without proving a store is there.
 */
export async function runScaffold(input: {
  argv: readonly string[];
  cwd: string;
  home?: string;
}): Promise<CommandOutput> {
  let options: ScaffoldOptions;
  try {
    options = parseScaffoldArgs(input.argv);
  } catch (error) {
    return { exitCode: 2, stdout: '', stderr: `kb scaffold: ${describeError(error)}\n${SCAFFOLD_HELP}` };
  }

  if (options.help) {
    return { exitCode: 0, stdout: SCAFFOLD_HELP, stderr: '' };
  }

  const resolved = await resolveStore({
    explicitKb: options.kb,
    cwd: input.cwd,
    ...(input.home !== undefined && { home: input.home }),
  });
  if (!resolved.ok) {
    return { exitCode: 2, stdout: '', stderr: `kb scaffold: ${resolved.message}\n` };
  }

  const store = resolved.store;
  const label = store.name ?? store.path;
  if (resolved.readonly) {
    return buildRefusal(`knowledge base "${label}" is marked readonly in kb.yaml; scaffold is refused`);
  }
  if (!(await directoryExists(resolveKbDir(store.path)))) {
    return buildRefusal(`no ${KB_DIR}/ directory at ${store.path}; run "kb create" to make a store there`);
  }

  const entries = await scaffold({ storePath: store.path, force: options.force });
  return { exitCode: 0, stdout: formatScaffolded(store, entries), stderr: '' };
}

/** Parsed `kb scaffold` options. */
interface ScaffoldOptions {
  /** Whether `--force` was supplied. */
  force: boolean;
  /** Whether `--help`/`-h` was supplied. */
  help: boolean;
  /** Explicit store name from `--kb`, or `null` for ancestor-walk discovery. */
  kb: string | null;
}

/**
 * Parses `kb scaffold` options. `--kb` accepts both the space (`--kb x`) and equals (`--kb=x`) forms. An unknown flag,
 * a positional argument, or a missing `--kb` value throws with a usage-style message.
 */
export function parseScaffoldArgs(argv: readonly string[]): ScaffoldOptions {
  let force = false;
  let help = false;
  let kb: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
    if (arg === '--force') {
      force = true;
      continue;
    }
    if (arg === '--kb') {
      kb = takeValue(argv, index, '--kb');
      index += 1;
      continue;
    }
    if (arg.startsWith('--kb=')) {
      kb = takeInlineValue(arg, '--kb=');
      continue;
    }
    if (arg.startsWith('-')) {
      throw new Error(`unknown flag: ${arg}`);
    }

    throw new Error(`unexpected argument: ${arg}`);
  }

  return { force, help, kb };
}

// region | Helpers

// Column width of the action label, sized to the longest of `created`, `present`, and `replaced`.
const ACTION_WIDTH = 8;

/** Builds a refusal `CommandOutput` (exit 2) from a message naming the ground for it. */
function buildRefusal(message: string): CommandOutput {
  return { exitCode: 2, stdout: '', stderr: `kb scaffold: ${message}\n` };
}

/** Builds a human summary naming the store and what the scaffold did about each canonical path. */
function formatScaffolded(store: StoreRef, entries: readonly ScaffoldEntry[]): string {
  const named = store.name === null ? '' : ` "${store.name}"`;
  const lines = [`Scaffolded knowledge base${named} at ${store.path}`];
  for (const entry of entries) {
    lines.push(`  ${entry.action.padEnd(ACTION_WIDTH)} ${entry.path}`);
  }
  return `${lines.join('\n')}\n`;
}

// endregion | Helpers
