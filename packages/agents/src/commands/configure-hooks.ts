/**
 * Configures the session-lifecycle hook entries in each harness's config file — the wiring that turns the installed
 * relay script into a running event source. `install` invokes the same per-harness functions by default and
 * `uninstall` reverses them; running the command alone (re)applies just the hook wiring. `--print` emits the entries
 * as copyable snippets instead of writing, for configs managed elsewhere.
 *
 * All writes go through the sentinel-scoped config utilities, so only CodeAssembly-owned entries are ever created,
 * replaced, or removed; the rest of the user's config is untouched.
 */

import { stringify } from 'yaml';

import {
  checkClaudeHookEntries,
  ensureClaudeHookEntries,
  removeClaudeHookEntries,
} from '../lib/claude-hook-settings.ts';
import { ALL_HARNESS_IDS, resolveHarnessIds, resolveHarnessPaths } from '../lib/harness.ts';
import {
  buildClaudeHookEntries,
  buildRovoHookEntries,
  HOOK_SENTINEL,
  isSentinelOwned,
} from '../lib/hook-entry-catalog.ts';
import type { ManagedEntryStatus } from '../lib/managed-entry-contract.ts';
import { checkRovoHookEntries, ensureRovoHookEntries, removeRovoHookEntries } from '../lib/rovo-config-settings.ts';
import type { HarnessId, InstallOptions } from '../lib/types.ts';

/** One relayed hook's installed state in a harness config, keyed by the harness's own name for the hook. */
export interface HookEntryStatus {
  readonly hook: string;
  readonly status: ManagedEntryStatus;
}

/**
 * Executes the configure-hooks command: writes the hook entries into each targeted harness's config file, or prints
 * them without writing when `print` is set.
 */
export async function configureHooksCommand(
  options: Pick<InstallOptions, 'harness' | 'print'>,
  baseDir?: string,
): Promise<void> {
  // Printing writes nothing, so it does not gate on which harness homes exist — the manual-adoption reader may not
  // have the harness materialized on this machine at all.
  const harnesses =
    options.print === true && options.harness === 'all' ? ALL_HARNESS_IDS : resolveHarnessIds(options.harness, baseDir);
  if (harnesses.length === 0) {
    console.info('No target harnesses detected. Nothing to configure.');
    return;
  }

  for (const harnessId of harnesses) {
    if (options.print === true) {
      printHarnessHookEntries(harnessId, baseDir);
    } else {
      await ensureHarnessHookEntries(harnessId, baseDir);
    }
  }
}

/** Reports each relayed hook's entry status in the harness's config file. A missing file reports every hook absent. */
export async function checkHarnessHookEntries(
  harnessId: HarnessId,
  baseDir?: string,
): Promise<ReadonlyArray<HookEntryStatus>> {
  const paths = resolveHarnessPaths(harnessId, baseDir);
  if (harnessId === 'claude') {
    const checks = await checkClaudeHookEntries(paths.configFile, buildClaudeHookEntries(), HOOK_SENTINEL);
    return checks.map((check) => ({ hook: check.entry.event, status: check.status }));
  }
  const checks = await checkRovoHookEntries(paths.configFile, buildRovoHookEntries(paths.scriptsDir), isSentinelOwned);
  return checks.map((check) => ({ hook: check.entry.name, status: check.status }));
}

/**
 * Writes the harness's hook entries into its config file, creating it when absent, and reports what happened. On Rovo
 * a change earns the restart reminder: the config is read at startup, so a running session ignores new hooks.
 */
export async function ensureHarnessHookEntries(harnessId: HarnessId, baseDir?: string): Promise<void> {
  const paths = resolveHarnessPaths(harnessId, baseDir);
  const result =
    harnessId === 'claude'
      ? await ensureClaudeHookEntries(paths.configFile, buildClaudeHookEntries(), HOOK_SENTINEL)
      : await ensureRovoHookEntries(paths.configFile, buildRovoHookEntries(paths.scriptsDir), isSentinelOwned);

  console.info(
    result.changed
      ? `  ✅ Wired session-lifecycle hooks in ${paths.configFile}`
      : `  Session-lifecycle hooks already wired in ${paths.configFile}`,
  );
  if (result.changed && harnessId === 'rovo') {
    console.info('  ⚠️ Rovo Dev reads its config at startup: restart any running session to pick up the hooks.');
  }
}

/** Deletes the harness's sentinel-marked hook entries from its config file, leaving everything else untouched. */
export async function removeHarnessHookEntries(harnessId: HarnessId, baseDir?: string): Promise<void> {
  const paths = resolveHarnessPaths(harnessId, baseDir);
  const result =
    harnessId === 'claude'
      ? await removeClaudeHookEntries(paths.configFile, HOOK_SENTINEL)
      : await removeRovoHookEntries(paths.configFile, isSentinelOwned);

  if (result.changed) {
    console.info(`  ✅ Removed ${result.removedCount} session-lifecycle hook entries from ${paths.configFile}`);
    if (harnessId === 'rovo') {
      console.info('  ⚠️ Rovo Dev reads its config at startup: restart any running session to drop the hooks.');
    }
  }
}

/** The Claude hook entries as the JSON fragment to merge into `settings.json` — also the manual-adoption snippet. */
export function renderClaudeHookSnippet(): string {
  const hooks: Record<string, unknown> = {};
  for (const entry of buildClaudeHookEntries()) {
    hooks[entry.event] = [entry.group];
  }
  return JSON.stringify({ hooks }, undefined, 2);
}

/** The Rovo hook entries as the YAML fragment to merge into `config.yml` — also the manual-adoption snippet. */
export function renderRovoHookSnippet(scriptsDir: string): string {
  const events = buildRovoHookEntries(scriptsDir).map((entry) => ({
    name: entry.name,
    commands: entry.commands.map((command) => ({ command })),
  }));
  // Wrapping is disabled so each command stays one line, matching what the config writer emits.
  return stringify({ eventHooks: { events } }, { lineWidth: 0 });
}

// region | Helpers

/** Prints the harness's hook entries as a copyable snippet, headed by the config file they belong in. */
function printHarnessHookEntries(harnessId: HarnessId, baseDir?: string): void {
  const paths = resolveHarnessPaths(harnessId, baseDir);
  if (harnessId === 'claude') {
    console.info(`# ${paths.configFile} — merge under "hooks"`);
    console.info(renderClaudeHookSnippet());
  } else {
    console.info(`# ${paths.configFile} — merge under eventHooks.events`);
    console.info(renderRovoHookSnippet(paths.scriptsDir));
  }
}

// endregion | Helpers
