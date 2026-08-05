import { enumerateNotes } from '../../check/enumerate.ts';
import { isKbLoaderError } from '../../config/kb-loader-error.ts';
import { loadKbConfig } from '../../config/load-config.ts';
import { resolveKbDir, TAXONOMY_FILE } from '../../layout/index.ts';
import { deriveDomains } from '../../taxonomy/domain-paths.ts';
import { loadTaxonomy } from '../../taxonomy/load-taxonomy.ts';
import { writeTaxonomy } from '../../taxonomy/write-taxonomy.ts';
import type { KbRoot } from '../../types.ts';
import { takeInlineValue, takeValue } from '../parse-flag-value.ts';
import { resolveStore } from '../resolve-store.ts';
import type { CommandOutput } from './check.ts';

/** Usage text for `kb taxonomy`. */
export const TAXONOMY_HELP = `Usage: kb taxonomy init [options]

Derive a starting taxonomy from the notes a knowledge base already holds, so a
taxonomy can be introduced to a populated store without every folder reporting
as undeclared. Every folder holding notes is declared, along with each of its
ancestors, under "provisional:" with no description: the command cannot invent
descriptions, and provisional already means "declared, not yet reviewed".

Options:
  --kb <name>   Use the named store from the kb.yaml registry. Without it, the
                nearest ancestor .kb/ directory is used.
  --merge       Add only the domains an existing taxonomy does not declare.
                Without it, a store that already has a taxonomy is left
                untouched.
  -h, --help    Show this help.

Exit codes:
  0  the taxonomy was written, or already declared every derived domain
  2  usage error, unresolvable store, malformed config or taxonomy, or an
     existing taxonomy without --merge
`;

/**
 * Runs `kb taxonomy`: parses options, resolves the store, derives the domains its notes imply, and declares them.
 *
 * The derivation reads the same enumeration `kb check` does, so a store back-filled by this command reports no
 * taxonomy drift. A malformed `.kb/config.yaml` or `.kb/taxonomy.yaml` surfaces as a `KbLoaderError` and maps to exit
 * 2; any other error propagates to the caller as a real crash.
 */
export async function runTaxonomy(input: {
  argv: readonly string[];
  cwd: string;
  home?: string;
}): Promise<CommandOutput> {
  let options: TaxonomyOptions;
  try {
    options = parseTaxonomyArgs(input.argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { exitCode: 2, stdout: '', stderr: `kb taxonomy: ${message}\n${TAXONOMY_HELP}` };
  }

  if (options.help) {
    return { exitCode: 0, stdout: TAXONOMY_HELP, stderr: '' };
  }
  if (options.subcommand === null) {
    return { exitCode: 2, stdout: '', stderr: `kb taxonomy: no subcommand given\n${TAXONOMY_HELP}` };
  }

  const resolved = await resolveStore({
    explicitKb: options.kb,
    cwd: input.cwd,
    ...(input.home !== undefined && { home: input.home }),
  });
  if (!resolved.ok) {
    return { exitCode: 2, stdout: '', stderr: `kb taxonomy: ${resolved.message}\n` };
  }
  const kbRoot: KbRoot = { path: resolved.store.path, kbDir: resolveKbDir(resolved.store.path) };

  try {
    return await initTaxonomy({ kbRoot, merge: options.merge });
  } catch (error) {
    if (isKbLoaderError(error)) {
      return { exitCode: 2, stdout: '', stderr: `kb taxonomy: ${error.message}\n` };
    }
    throw error;
  }
}

/** Parsed `kb taxonomy` options. */
interface TaxonomyOptions {
  /** The subcommand to run, or `null` when none was given. */
  subcommand: 'init' | null;
  /** Explicit store name from `--kb`, or `null` for ancestor-walk discovery. */
  kb: string | null;
  /** Whether `--merge` was supplied. */
  merge: boolean;
  /** Whether `--help`/`-h` was supplied. */
  help: boolean;
}

/**
 * Parses `kb taxonomy` options. `--kb` accepts both the space (`--kb x`) and equals (`--kb=x`) forms. An unknown flag,
 * an unknown subcommand, a missing `--kb` value, or a second subcommand throws with a usage-style message.
 */
export function parseTaxonomyArgs(argv: readonly string[]): TaxonomyOptions {
  let subcommand: 'init' | null = null;
  let kb: string | null = null;
  let merge = false;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
    if (arg === '--merge') {
      merge = true;
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
    if (arg !== 'init') {
      throw new Error(`unknown subcommand: ${arg}`);
    }
    if (subcommand !== null) {
      throw new Error('only one subcommand may be given');
    }
    subcommand = arg;
  }

  return { subcommand, kb, merge, help };
}

// region | Helpers

/**
 * Declares every domain the store's notes imply. Refuses a store that already declares domains unless `merge` is set,
 * in which case only the absent ones are added.
 */
async function initTaxonomy(input: { kbRoot: KbRoot; merge: boolean }): Promise<CommandOutput> {
  const { kbRoot, merge } = input;

  const existing = await loadTaxonomy({ kbRoot });
  if (existing.size > 0 && !merge) {
    const message = `${TAXONOMY_FILE} already declares ${existing.size} domains; pass --merge to add the missing ones`;
    return { exitCode: 2, stdout: '', stderr: `kb taxonomy: ${message}\n` };
  }

  const config = await loadKbConfig({ kbRoot });
  const notes = await enumerateNotes({ kbRoot: kbRoot.path, config });
  const domains = deriveDomains(notes.map((note) => note.relativePath));

  if (domains.length === 0) {
    return { exitCode: 0, stdout: `no assertion folders hold notes; ${TAXONOMY_FILE} not written\n`, stderr: '' };
  }

  const { added } = await writeTaxonomy({
    kbRoot,
    declarations: domains.map((path) => ({ path, provisional: true })),
  });

  if (added.length === 0) {
    return { exitCode: 0, stdout: `${TAXONOMY_FILE} already declares every derived domain\n`, stderr: '' };
  }
  return { exitCode: 0, stdout: `declared ${added.length} domains in ${TAXONOMY_FILE}\n`, stderr: '' };
}

// endregion | Helpers
