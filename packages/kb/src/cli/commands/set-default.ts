import { homedir } from 'node:os';
import { join } from 'node:path';

import { tryLoadKbRegistry } from '../../discovery/load-registry.ts';
import { clearDefaultKb, setDefaultKb } from '../../discovery/set-default-kb.ts';
import type { KbRegistryEntry } from '../../types.ts';
import type { SelectKbPrompt } from '../select-kb-prompt.ts';
import type { CommandOutput } from './check.ts';

/** Usage text for `kb set-default`. */
export const SET_DEFAULT_HELP = `Usage: kb set-default [name] [options]

Set, clear, or interactively choose the user-global default knowledge base —
the top-level default_kb pointer in ~/.agents/kb.yaml.

  kb set-default <name>   Set default_kb to the named registered KB.
  kb set-default --none   Clear default_kb.
  kb set-default          List the registered KBs and prompt for a choice
                          (including a "(none)" option to clear).

Options:
  --none        Clear the default knowledge base.
  -h, --help    Show this help.

Exit codes:
  0  default set or cleared, or the selection was cancelled
  2  usage error, an unregistered name, no registered KBs, or no name supplied
     when stdin is not interactive
`;

/**
 * Runs `kb set-default`: sets, clears, or interactively selects the user-global `default_kb`. Resolution reads the
 * user-global registry only (no project overlay), so the chosen default resolves in every project context. The picker
 * is injected via `selectKb`, keeping the dispatcher free of terminal I/O; its absence means stdin is non-interactive,
 * making the no-argument form a usage error rather than a hang.
 */
export async function runSetDefault(input: {
  argv: readonly string[];
  home?: string;
  selectKb?: SelectKbPrompt;
}): Promise<CommandOutput> {
  let options: SetDefaultOptions;
  try {
    options = parseSetDefaultArgs(input.argv);
  } catch (error) {
    return buildUsageError(error);
  }

  if (options.help) {
    return { exitCode: 0, stdout: SET_DEFAULT_HELP, stderr: '' };
  }

  const home = input.home ?? homedir();
  const registryPath = join(home, '.agents', 'kb.yaml');
  const { config, error } = await tryLoadKbRegistry({ home });
  if (error !== undefined) {
    return { exitCode: 2, stdout: '', stderr: `kb set-default: ${error}\n` };
  }
  const entries = config.entries;

  if (options.none) {
    await clearDefaultKb({ registryPath });
    return { exitCode: 0, stdout: 'The default knowledge base has been cleared.\n', stderr: '' };
  }

  if (options.name !== null) {
    if (entries.length === 0) {
      return { exitCode: 2, stdout: '', stderr: noStoresMessage() };
    }
    if (!entries.some((entry) => entry.name === options.name)) {
      return { exitCode: 2, stdout: '', stderr: notRegisteredMessage(options.name, entries) };
    }
    await setDefaultKb({ registryPath, name: options.name });
    return { exitCode: 0, stdout: setConfirmation(options.name), stderr: '' };
  }

  if (input.selectKb === undefined) {
    return {
      exitCode: 2,
      stdout: '',
      stderr: `kb set-default: a knowledge base name is required when stdin is not interactive\n${SET_DEFAULT_HELP}`,
    };
  }
  if (entries.length === 0) {
    return { exitCode: 2, stdout: '', stderr: noStoresMessage() };
  }

  const choice = await input.selectKb({
    entries,
    ...(config.defaultKb !== undefined && { currentDefaultName: config.defaultKb.name }),
  });
  if (choice.kind === 'cancel') {
    return { exitCode: 0, stdout: 'No changes made.\n', stderr: '' };
  }
  if (choice.kind === 'none') {
    await clearDefaultKb({ registryPath });
    return { exitCode: 0, stdout: 'The default knowledge base has been cleared.\n', stderr: '' };
  }
  const chosen = entries[choice.index];
  if (chosen === undefined) {
    return { exitCode: 2, stdout: '', stderr: 'kb set-default: invalid selection\n' };
  }
  await setDefaultKb({ registryPath, name: chosen.name });
  return { exitCode: 0, stdout: setConfirmation(chosen.name), stderr: '' };
}

/** Parsed `kb set-default` options. */
interface SetDefaultOptions {
  /** The positional KB name, or `null` when none was supplied (interactive form). */
  name: string | null;
  /** Whether `--none` was supplied. */
  none: boolean;
  /** Whether `--help`/`-h` was supplied. */
  help: boolean;
}

/**
 * Parses `kb set-default` options. At most one positional name is accepted; `--none` clears. A name combined with
 * `--none`, a second positional, or an unknown flag throws with a usage-style message.
 */
export function parseSetDefaultArgs(argv: readonly string[]): SetDefaultOptions {
  let name: string | null = null;
  let none = false;
  let help = false;

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
    if (arg === '--none') {
      none = true;
      continue;
    }
    if (arg.startsWith('-')) {
      throw new Error(`unknown flag: ${arg}`);
    }
    if (name !== null) {
      throw new Error('set-default accepts at most one knowledge base name');
    }
    name = arg;
  }

  if (name !== null && none) {
    throw new Error('a name cannot be combined with --none');
  }

  return { name, none, help };
}

// region | Helpers

/** Builds a usage-error `CommandOutput` (exit 2) from a thrown parse error. */
function buildUsageError(error: unknown): CommandOutput {
  const message = error instanceof Error ? error.message : String(error);
  return { exitCode: 2, stdout: '', stderr: `kb set-default: ${message}\n${SET_DEFAULT_HELP}` };
}

/** The "no registered KBs" usage error, directing the user to scaffold one first. */
function noStoresMessage(): string {
  return 'kb set-default: no knowledge bases registered; run `kb create` first\n';
}

/** The "name is not registered" usage error, listing the registered names. */
function notRegisteredMessage(name: string, entries: readonly KbRegistryEntry[]): string {
  const names = entries.map((entry) => entry.name).join(', ');
  return `kb set-default: "${name}" is not a registered knowledge base (registered: ${names})\n`;
}

/** The success line for a set, in completed-action voice. */
function setConfirmation(name: string): string {
  return `Default knowledge base has been set to "${name}".\n`;
}

// endregion | Helpers
