/**
 * Removal of the session-lifecycle hook entries that earlier versions of CodeAssembly wrote into each harness's config
 * file. Those entries invoke a relay script that is no longer deployed, so `install`, harness retraction, and
 * `uninstall` remove them wherever they remain.
 */

import { removeClaudeHookEntries } from './claude-hook-settings.ts';
import { resolveHarnessPaths } from './harness.ts';
import type { ReportLine } from './report-line.ts';
import type { HookSentinelMatcher } from './rovo-config-hooks.ts';
import { removeRovoHookEntries } from './rovo-config-settings.ts';
import type { HarnessId } from './types.ts';

/**
 * The ownership marker included in every hook command that CodeAssembly wrote. Removal matches entries by this exact
 * string, so the value must equal the one already written into users' harness configs.
 */
export const HOOK_SENTINEL = '--sentinel codeassembly-agents';

/** The Rovo ownership matcher: An entry is CodeAssembly's when any of its commands contains the sentinel. */
export const isSentinelOwned: HookSentinelMatcher = (entry) =>
  entry.commands.some((command) => command.includes(HOOK_SENTINEL));

/**
 * Deletes the harness's sentinel-marked hook entries from its config file, leaving everything else untouched. Returns
 * a report only when it removed something; under `dryRun`, reports what it would remove and writes nothing.
 */
export async function removeRetiredHookEntries(
  harnessId: HarnessId,
  baseDir?: string,
  options: { readonly dryRun?: boolean } = {},
): Promise<ReadonlyArray<ReportLine>> {
  const paths = resolveHarnessPaths(harnessId, baseDir);
  const result =
    harnessId === 'claude'
      ? await removeClaudeHookEntries(paths.configFile, HOOK_SENTINEL, options)
      : await removeRovoHookEntries(paths.configFile, isSentinelOwned, options);

  if (!result.changed) {
    return [];
  }
  if (options.dryRun === true) {
    return [
      {
        indent: 2,
        level: 'info',
        text: `[hooks] Would remove ${result.removedCount} retired session-lifecycle hook entries from ${paths.configFile}`,
      },
    ];
  }

  const lines: Array<ReportLine> = [
    {
      glyph: 'passed',
      indent: 2,
      level: 'info',
      text: `Removed ${result.removedCount} retired session-lifecycle hook entries from ${paths.configFile}`,
    },
  ];
  if (harnessId === 'rovo') {
    lines.push({
      glyph: 'warning',
      indent: 2,
      level: 'info',
      text: 'Rovo Dev reads its config at startup: Restart any running session to drop the hooks.',
    });
  }
  return lines;
}
