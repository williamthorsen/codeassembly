/**
 * The catalog of session-lifecycle hook entries CodeAssembly installs into each harness's config file. Ensure, remove,
 * print, and status reporting all compose their entries from this one module, so no two of them can disagree about
 * what "the entries" are — and the printed snippet is by construction the snippet that gets installed.
 *
 * Each entry's command invokes the installed relay with `--harness`/`--hook` baked in, plus the ownership sentinel.
 * The sentinel is a real flag the relay accepts and ignores, not a shell comment: it survives any execution semantics
 * a harness uses, and it is distinctive enough that a foreign command will not carry it by accident.
 */

import path from 'node:path';

import { listRelayHooks } from '../relay-hook-event/hook-mappings.ts';
import type { ClaudeHookEntry } from './claude-hook-entries.ts';
import { HARNESSES } from './harness.ts';
import type { HookEntry, HookSentinelMatcher } from './rovo-config-hooks.ts';

/**
 * The ownership marker carried in every managed hook command. The config utilities find, replace, and remove only
 * commands containing this exact string, so it includes the flag name: the bare value could collide with an unrelated
 * command that merely mentions the CLI's name.
 *
 * The value is frozen. It is matched against entries already written into users' harness configs, so any new value
 * strands them: the config utilities stop recognizing what they wrote, `configure-hooks` adds a parallel set
 * alongside, and every session-lifecycle event fires twice. The relay accepts the flag and ignores it, so the value
 * carries no meaning beyond being stable.
 */
export const HOOK_SENTINEL = '--sentinel codeassembly-agents';

/** The filename of the relay bundle that `install` places in each harness's scripts directory. */
const RELAY_FILENAME = 'relay-hook-event.mjs';

/**
 * The Claude Code hook entries, one matcher group per relayed hook. The relay path uses a literal `~`: Claude runs
 * hook commands through a shell, which expands it, and the unexpanded form keeps the entries identical across
 * machines and portable through dotfile syncing.
 */
export function buildClaudeHookEntries(): ReadonlyArray<ClaudeHookEntry> {
  const config = HARNESSES.claude;
  const relayPath = `~/${config.homeDir}/${config.scriptsDirName}/${RELAY_FILENAME}`;
  return listRelayHooks('claude').map((hook) => ({
    event: hook,
    group: { hooks: [{ type: 'command', command: buildRelayCommand(relayPath, 'claude', hook) }] },
  }));
}

/**
 * The Rovo Dev hook entries, one `events` item per relayed hook. The relay path is the resolved absolute path under
 * `scriptsDir`, matching the entries Rovo's own tooling generates rather than assuming the config expands `~`.
 */
export function buildRovoHookEntries(scriptsDir: string): ReadonlyArray<HookEntry> {
  const relayPath = path.join(scriptsDir, RELAY_FILENAME);
  return listRelayHooks('rovodev').map((hook) => ({
    name: hook,
    commands: [buildRelayCommand(relayPath, 'rovodev', hook)],
  }));
}

/** The Rovo ownership matcher: an entry is CodeAssembly's when any of its commands carries the sentinel. */
export const isSentinelOwned: HookSentinelMatcher = (entry) =>
  entry.commands.some((command) => command.includes(HOOK_SENTINEL));

// region | Helpers

/** Composes one relay invocation with the hook's identity and the ownership sentinel baked in. */
function buildRelayCommand(relayPath: string, harness: string, hook: string): string {
  return `node ${relayPath} --harness ${harness} --hook ${hook} ${HOOK_SENTINEL}`;
}

// endregion | Helpers
