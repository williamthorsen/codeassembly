import { describeError } from '@williamthorsen/toolbelt.errors/candidate';

import { check, type CheckResult } from '../../check/check.ts';
import type { EnumeratedNote } from '../../check/enumerate.ts';
import { isKbLoaderError } from '../../config/kb-loader-error.ts';
import type { Finding } from '../../types.ts';
import { type CheckScope, formatHuman, formatJson, type StoreRef, summarize } from '../format.ts';
import { takeInlineValue, takeValue } from '../parse-flag-value.ts';
import { resolveStore } from '../resolve-store.ts';
import { resolveChangedPaths } from '../targeting/resolve-changed-paths.ts';
import { selectNotes } from '../targeting/select-notes.ts';

/** The outcome of a command run: the exit code plus the streams to write. */
export interface CommandOutput {
  /** Process exit code: 0 clean, 1 error-severity findings, 2 usage/config error. */
  exitCode: 0 | 1 | 2;
  stdout: string;
  stderr: string;
}

/** Usage text for `kb check`. */
export const CHECK_HELP = `Usage: kb check [paths...] [options]

Validate notes in a knowledge base against its tag aliases and cross-note
link and path rules. With no path arguments, every note is checked.
Cross-note rules always resolve against the whole vault.

Targeting (mutually exclusive):
  [paths...]    Check only the notes matching the given glob patterns, files,
                or directories. Quote globs so kb expands them itself. A
                directory checks every note beneath it. A path that matches no
                note is a usage error unless it names a real non-note.
  --vs <ref>    Check only the notes changed between the working tree and the
                merge-base of <ref> and HEAD: follows renames, includes
                uncommitted edits, excludes deletions.

Options:
  --kb <name>   Check the named store from the kb.yaml registry. Without it,
                the nearest ancestor .kb/ directory is used.
  --json        Emit a JSON report instead of human-readable output.
  -h, --help    Show this help.

Exit codes:
  0  no error-severity findings in the checked notes (warnings allowed)
  1  one or more error-severity findings in the checked notes
  2  usage error, unresolvable store or --vs ref, a path matching no note, or
     malformed config or aliases
`;

/**
 * Runs `kb check`: parses options, resolves the store, runs the shared `check`, and formats the report.
 *
 * Store resolution composes the package's own exports inline — `findKbRoot` for the default ancestor-walk and
 * `tryLoadKbRegistry` for an explicit `--kb <name>`. The lookup is read-only, so a store's registry `readonly` flag
 * is ignored. A malformed `.kb/config.yaml`/`tag-aliases.yaml` surfaces as a `KbLoaderError` from `check`, which maps
 * to exit 2; any other error from `check` propagates to the caller as a real crash.
 */
export async function runCheck(input: { argv: readonly string[]; cwd: string; home?: string }): Promise<CommandOutput> {
  let options: CheckOptions;
  try {
    options = parseCheckArgs(input.argv);
  } catch (error) {
    return buildUsageError(error);
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

  const selection = await resolveSelection({ options, store, result });
  if (!selection.ok) {
    return { exitCode: 2, stdout: '', stderr: `kb check: ${selection.message}\n` };
  }

  const summary = summarize(selection.findings, selection.notes.length);
  // The whole-vault zero-match line names the store's targets, read from the config `check` already resolved.
  const stdout = options.json
    ? formatJson({ store, summary, findings: selection.findings })
    : formatHuman({ summary, findings: selection.findings, targets: result.config.targets, scope: selection.scope });

  return { exitCode: summary.errors > 0 ? 1 : 0, stdout, stderr: '' };
}

/** Parsed `kb check` options. */
interface CheckOptions {
  /** Explicit store name from `--kb`, or `null` for ancestor-walk discovery. */
  kb: string | null;
  /** Whether `--json` was supplied. */
  json: boolean;
  /** Whether `--help`/`-h` was supplied. */
  help: boolean;
  /** Positional glob/path/directory arguments selecting which notes to check; empty for a whole-vault run. */
  patterns: string[];
  /** The `--vs` ref to diff against, or `null` when not supplied. */
  vs: string | null;
}

/**
 * Parses `kb check` options. `--kb` and `--vs` each accept both the space (`--kb x`) and equals (`--kb=x`) forms;
 * non-flag arguments are collected as selection patterns. Unknown flags, a missing `--kb`/`--vs` value, or combining
 * patterns with `--vs` throw with a usage-style message.
 */
export function parseCheckArgs(argv: readonly string[]): CheckOptions {
  let kb: string | null = null;
  let json = false;
  let help = false;
  let vs: string | null = null;
  const patterns: string[] = [];

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
      kb = takeValue(argv, index, '--kb');
      index += 1;
      continue;
    }
    if (arg.startsWith('--kb=')) {
      kb = takeInlineValue(arg, '--kb=');
      continue;
    }
    if (arg === '--vs') {
      vs = takeValue(argv, index, '--vs');
      index += 1;
      continue;
    }
    if (arg.startsWith('--vs=')) {
      vs = takeInlineValue(arg, '--vs=');
      continue;
    }
    if (arg.startsWith('-')) {
      throw new Error(`unknown flag: ${arg}`);
    }

    patterns.push(arg);
  }

  if (vs !== null && patterns.length > 0) {
    throw new Error('--vs cannot be combined with path arguments');
  }

  return { kb, json, help, patterns, vs };
}

// region | Helpers

/** Builds a usage-error `CommandOutput` (exit 2) from a thrown parse error. */
function buildUsageError(error: unknown): CommandOutput {
  return { exitCode: 2, stdout: '', stderr: `kb check: ${describeError(error)}\n${CHECK_HELP}` };
}

/** The selected notes and findings for the run, or a usage-error message (exit 2). */
type SelectionOutcome =
  | { ok: true; scope: CheckScope; notes: readonly EnumeratedNote[]; findings: readonly Finding[] }
  | { ok: false; message: string };

/**
 * Narrows a whole-vault `CheckResult` to the notes the run targets. A bare run passes through unchanged; `--vs`
 * resolves changed paths via git (a bad ref fails for exit 2), and pattern selection drops non-notes while reporting
 * a path that matches nothing real as a usage error. Note-scoped findings are filtered to the selected notes by their
 * absolute path, so cross-references stay resolved against the whole vault while the report and exit code cover only
 * the selection. Vault-scoped findings describe the store rather than any one note, so they bypass the filter and
 * appear under every selection.
 */
async function resolveSelection(input: {
  options: CheckOptions;
  store: StoreRef;
  result: CheckResult;
}): Promise<SelectionOutcome> {
  const { options, store, result } = input;

  if (options.vs === null && options.patterns.length === 0) {
    return { ok: true, scope: 'vault', notes: result.notes, findings: result.findings };
  }

  let scope: CheckScope = 'patterns';
  let patterns = options.patterns;
  if (options.vs !== null) {
    scope = 'vs';
    const changed = resolveChangedPaths({ storeRoot: store.path, ref: options.vs });
    if (!changed.ok) {
      return { ok: false, message: changed.message };
    }
    patterns = changed.paths;
  }

  const selection = await selectNotes({ notes: result.notes, patterns, storeRoot: store.path });
  if (selection.unmatched.length > 0) {
    return { ok: false, message: `no notes matched: ${selection.unmatched.join(', ')}` };
  }

  const selectedPaths = new Set(selection.selected.map((entry) => entry.path));
  const findings = result.findings.filter((finding) => finding.scope === 'vault' || selectedPaths.has(finding.path));
  return { ok: true, scope, notes: selection.selected, findings };
}

// endregion | Helpers
