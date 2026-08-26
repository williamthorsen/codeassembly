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
 * Retires the withdrawn shared-guidance tier: removes what a previous version deployed to `~/.agents/` and reports
 * whether the manifest's `shared` record should be dropped. Nothing is deployed there any more, so a lingering copy
 * presents a file no harness loads as current guidance.
 *
 * Retirement is driven by the manifest alone, which is what makes it safe: a `~/.agents/AGENTS.md` this CLI never
 * deployed carries no entry and is left untouched. Of the entries it does carry, an unmodified copy and a `--link`
 * symlink are removed, and a user-modified copy is kept and reported, all through the same orphan-prune pass that
 * governs every other withdrawn entry. A kept copy is left untracked, which is the intended end state: it holds the
 * user's own content.
 *
 * `install` and `uninstall` both run it, so a machine is cleared by whichever the user reaches for. A home with no
 * `shared` record has nothing to retire, so it is a no-op on every run after the first.
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
