import { emitReport } from './emit-report.ts';
import { describePruneResult, pruneOrphanedEntries } from './entry-remover.ts';
import { resolveSharedHome } from './manifest.ts';
import type { AgentsManifest } from './types.ts';

/** The flags governing a retirement pass, mirroring the install flags that govern any orphan prune. */
interface RetirementOptions {
  readonly force: boolean;
  readonly dryRun: boolean;
}

/**
 * Retires the withdrawn shared-guidance tier: removes the copies that the manifest records under `~/.agents/` and
 * reports whether the manifest's `shared` record should be dropped. Nothing deploys there, so a lingering copy
 * presents a file loaded by no harness as current guidance.
 *
 * Retirement is driven by the manifest alone, which makes it safe: A `~/.agents/AGENTS.md` never deployed by this CLI
 * has no entry and is left untouched. Of the entries that it does have, an unmodified copy and a `--link`
 * symlink are removed, and a user-modified copy is kept and reported, all through the same orphan-prune pass that
 * governs every other withdrawn entry. A kept copy is left untracked, which is the intended end state: It contains
 * the user's own content.
 *
 * A home with no `shared` record has nothing to retire, so the pass is a no-op on every run after the first.
 */
export async function retireSharedGuidance(
  manifest: AgentsManifest,
  options: RetirementOptions,
  baseDir?: string,
): Promise<boolean> {
  const entries = manifest.shared?.entries ?? [];
  if (entries.length === 0) {
    return manifest.shared !== undefined;
  }

  console.info('\nRetiring shared guidance');
  const pruned = await pruneOrphanedEntries(entries, [], resolveSharedHome(baseDir), options);
  emitReport(describePruneResult(pruned, options));
  return !options.dryRun;
}

/** Returns `manifest` without its retired `shared` tier. */
export function withoutSharedTier(manifest: AgentsManifest): AgentsManifest {
  const { shared: _shared, ...rest } = manifest;
  return rest;
}
