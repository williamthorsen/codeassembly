import { join } from 'node:path';

import { check } from '../../check/check.ts';
import { isKbLoaderError } from '../../config/kb-loader-error.ts';
import { loadKbConfig } from '../../config/load-config.ts';
import { findKbRoot } from '../../discovery/find-kb-root.ts';
import { tryLoadKbRegistry } from '../../discovery/load-registry.ts';
import type { KbRoot } from '../../types.ts';
import { formatHuman, formatJson, type StoreRef, summarize } from '../format.ts';

/** The outcome of a command run: the exit code plus the streams to write. */
export interface CommandOutput {
  /** Process exit code: 0 clean, 1 error-severity findings, 2 usage/config error. */
  exitCode: 0 | 1 | 2;
  stdout: string;
  stderr: string;
}

/** Usage text for `kb check`. */
export const CHECK_HELP = `Usage: kb check [options]

Validate every note in a knowledge base against its schema, tag aliases, and
cross-note link and path rules.

Options:
  --kb <name>   Check the named store from the kb.yaml registry. Without it,
                the nearest ancestor .kb/ directory is used.
  --json        Emit a JSON report instead of human-readable output.
  -h, --help    Show this help.

Exit codes:
  0  no error-severity findings (warnings allowed)
  1  one or more error-severity findings
  2  usage error, unresolvable store, or malformed config/schema/aliases
`;

/**
 * Runs `kb check`: parses options, resolves the store, runs the shared `check`, and formats the report.
 *
 * Store resolution composes the package's own exports inline — `findKbRoot` for the default ancestor-walk and
 * `tryLoadKbRegistry` for an explicit `--kb <name>`. The lookup is read-only, so a store's registry `readonly` flag
 * is ignored. A malformed `.kb/config.yaml`/`schema.yaml`/`tag-aliases.yaml` surfaces as a `KbLoaderError` from
 * `check`, which maps to exit 2; any other error from `check` propagates to the caller as a real crash.
 */
export async function runCheck(input: { argv: readonly string[]; cwd: string; home?: string }): Promise<CommandOutput> {
  let options: CheckOptions;
  try {
    options = parseCheckArgs(input.argv);
  } catch (error) {
    return usageError(error);
  }

  if (options.help) {
    return { exitCode: 0, stdout: CHECK_HELP, stderr: '' };
  }

  const resolved = await resolveStore({
    explicitKb: options.kb,
    cwd: input.cwd,
    ...(input.home !== undefined && { home: input.home }),
  });
  if (!resolved.ok) {
    return { exitCode: 2, stdout: '', stderr: `kb check: ${resolved.message}\n` };
  }
  const store = resolved.store;

  let result;
  try {
    result = await check({ kbRoot: store.path });
  } catch (error) {
    if (isKbLoaderError(error)) {
      return { exitCode: 2, stdout: '', stderr: `kb check: ${error.message}\n` };
    }
    throw error;
  }

  const summary = summarize(result.findings, result.notes.length);
  let stdout: string;
  if (options.json) {
    stdout = formatJson({ store, summary, findings: result.findings });
  } else {
    // The zero-match human line names the store's targets; resolve them only when no note matched.
    const targets = result.notes.length === 0 ? await resolveTargets(store.path) : [];
    stdout = formatHuman({ summary, findings: result.findings, targets });
  }

  return { exitCode: summary.errors > 0 ? 1 : 0, stdout, stderr: '' };
}

// region | Helpers

/** Parsed `kb check` options. */
interface CheckOptions {
  /** Explicit store name from `--kb`, or `null` for ancestor-walk discovery. */
  kb: string | null;
  /** Whether `--json` was supplied. */
  json: boolean;
  /** Whether `--help`/`-h` was supplied. */
  help: boolean;
}

/**
 * Parses `kb check` options. `--kb` accepts both `--kb x` and `--kb=x`. Unknown flags or a missing `--kb` value
 * throw with a usage-style message.
 */
export function parseCheckArgs(argv: readonly string[]): CheckOptions {
  let kb: string | null = null;
  let json = false;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg === '--kb') {
      const next = argv[index + 1] ?? null;
      if (next === null || next.startsWith('--')) {
        throw new Error('--kb requires a value');
      }
      kb = next;
      index += 1;
      continue;
    }
    if (arg.startsWith('--kb=')) {
      const value = arg.slice('--kb='.length);
      if (value === '') {
        throw new Error('--kb requires a value');
      }
      kb = value;
      continue;
    }

    throw new Error(`unknown flag: ${arg}`);
  }

  return { kb, json, help };
}

/** The store-resolution outcome: a resolved store, or a categorical failure message for exit 2. */
type ResolveStoreOutcome = { ok: true; store: StoreRef } | { ok: false; message: string };

/**
 * Resolves the store to check. An explicit `--kb <name>` is looked up in the merged registry (`tryLoadKbRegistry`
 * with `projectDir: cwd`, so project-local `.agents/kb.yaml` entries join the user-global registry); without a flag,
 * the nearest ancestor `.kb/` directory is used. An unknown `--kb` name or a missing `.kb/` fails for exit 2.
 */
async function resolveStore(input: {
  explicitKb: string | null;
  cwd: string;
  home?: string;
}): Promise<ResolveStoreOutcome> {
  if (input.explicitKb !== null) {
    const { config } = await tryLoadKbRegistry({
      projectDir: input.cwd,
      ...(input.home !== undefined && { home: input.home }),
    });
    const match = config.entries.find((entry) => entry.name === input.explicitKb);
    if (match === undefined) {
      return { ok: false, message: `--kb "${input.explicitKb}" does not match any registered knowledge base` };
    }
    return { ok: true, store: { name: match.name, path: match.path } };
  }

  const discovered = await findKbRoot({ startDir: input.cwd });
  if (discovered === null) {
    return { ok: false, message: 'no .kb/ directory found in the current directory or any ancestor' };
  }
  return { ok: true, store: { name: null, path: discovered.path } };
}

/**
 * Loads the store's effective `targets` for the zero-match message. `check` already loaded the config successfully
 * before reaching the zero-match path, so this re-load is on a known-good file; it degrades to the default targets
 * only against a benign race.
 */
async function resolveTargets(storePath: string): Promise<readonly string[]> {
  const kbRoot: KbRoot = { path: storePath, kbDir: join(storePath, '.kb'), via: 'ancestor-walk' };
  try {
    return (await loadKbConfig({ kbRoot })).targets;
  } catch {
    return ['content/**/*.md'];
  }
}

/** Builds a usage-error `CommandOutput` (exit 2) from a thrown parse error. */
function usageError(error: unknown): CommandOutput {
  const message = error instanceof Error ? error.message : String(error);
  return { exitCode: 2, stdout: '', stderr: `kb check: ${message}\n${CHECK_HELP}` };
}

// endregion | Helpers
