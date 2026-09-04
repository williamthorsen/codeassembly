import { existsSync } from 'node:fs';
import { readFile, rm, rmdir } from 'node:fs/promises';
import path from 'node:path';

import { readDirEntries, writeIfChanged } from '../../lib/fs-helpers.ts';
import { extractInstalledSlugs, removeRulebook } from '../../lib/sentinel-inliner.ts';
import { isMissingFile } from '../../lib/type-guards.ts';
import type { InstallOptions } from '../../lib/types.ts';
import type { SyncDomain } from './sync-domain.ts';

/**
 * Retires a former ambient host: removes the sync-owned rulebook blocks it carries and writes back the stripped
 * remainder, so hand-authored content survives. Ambient delivery targets the harness regions now, and a lingering
 * copy would present stale guidance as current. `deleteWhenEmpty` deletes a host left holding nothing — right for
 * one sync created itself, wrong for a hand-authored file like the project's own `AGENTS.md`, which is never
 * deleted. A missing host, and one carrying nothing to retire, are both no-ops.
 */
export async function retireAmbientHost(
  options: InstallOptions,
  hostPath: string,
  deleteWhenEmpty: boolean,
): Promise<Retirement | undefined> {
  let content: string;
  try {
    content = await readFile(hostPath, 'utf8');
  } catch (error: unknown) {
    if (isMissingFile(error)) {
      return undefined;
    }
    throw error;
  }

  let stripped = content;
  for (const slug of extractInstalledSlugs(content)) {
    stripped = removeRulebook(stripped, slug);
  }
  const deletable = deleteWhenEmpty && stripped.trim() === '';
  if (stripped === content && !deletable) {
    return undefined;
  }

  if (!options.dryRun) {
    await (deletable ? rm(hostPath, { force: true }) : writeIfChanged(hostPath, stripped));
  }
  return { kind: 'ambient-host', hostPath, emptied: deletable };
}

/** A retired legacy output, and whether the host it names held nothing but retired blocks. */
export type Retirement =
  | { readonly kind: 'ambient-host'; readonly hostPath: string; readonly emptied: boolean }
  | { readonly kind: 'neutral-rulebooks'; readonly dir: string };

/**
 * Retires the outputs this domain no longer produces: the neutral rulebook tree in both domains, and, in the project
 * domain, the rulebook blocks the hand-authored project guidance used to host. Runs on every sync that has a
 * declaration to act on, so a project picks the retirement up on its next run rather than needing a migration step.
 *
 * Both guidance locations are swept. A project that renames `.agents/PROJECT.md` to the repository-root `AGENTS.md`
 * before its next sync would otherwise carry the stale blocks into the new location for good.
 */
export async function retireRetiredOutputs(
  options: InstallOptions,
  domain: SyncDomain,
): Promise<ReadonlyArray<Retirement>> {
  const legacyHosts =
    domain.ambient === 'project-local'
      ? [path.join(domain.baseDir, '.agents', 'PROJECT.md'), path.join(domain.baseDir, 'AGENTS.md')]
      : [];
  const retirements = [await retireNeutralRulebooks(options, domain.baseDir)];
  for (const hostPath of legacyHosts) {
    retirements.push(await retireAmbientHost(options, hostPath, false));
  }
  return retirements.filter((retirement) => retirement !== undefined);
}

// region | Helpers

/**
 * Retires the neutral rulebook tree at `<baseDir>/.agents/rulebooks/`. Nothing reads it, so it is removed rather than
 * maintained. Only the `.md` files sync materialized are deleted, and the directory itself only once nothing else
 * remains in it, so anything a user placed alongside them survives. A missing directory is a no-op.
 */
async function retireNeutralRulebooks(options: InstallOptions, baseDir: string): Promise<Retirement | undefined> {
  const neutralDir = path.join(baseDir, '.agents', 'rulebooks');
  if (!existsSync(neutralDir)) {
    return undefined;
  }

  if (!options.dryRun) {
    const entries = await readDirEntries(neutralDir);
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        await rm(path.join(neutralDir, entry.name), { force: true });
      }
    }
    if ((await readDirEntries(neutralDir)).length === 0) {
      await rmdir(neutralDir);
    }
  }
  return { kind: 'neutral-rulebooks', dir: neutralDir };
}

// endregion | Helpers
