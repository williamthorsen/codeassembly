import { rm } from 'node:fs/promises';
import path from 'node:path';

import { readFileOrEmpty, writeIfChanged } from '../../lib/fs-helpers.ts';
import { resolveHarnessPaths } from '../../lib/harness.ts';
import { collectPromptEntries, renderPromptEntries } from '../../lib/prompts-yml.ts';
import { hasPromptsRegion, injectPromptsRegion, removePromptsRegion } from '../../lib/prompts-yml-region.ts';
import type { HarnessId } from '../../lib/types.ts';
import type { SyncDomain } from './sync-domain.ts';

/**
 * Reconciles the Rovo Dev `prompts.yml` index so it lists the user-invocable skills currently in the harness skills
 * dir. The deployed skills are projected into a codeassembly-owned region merged into the shared file, preserving any
 * foreign entries; when no skills remain, the region is stripped — and the file deleted when nothing foreign is left. A
 * no-op for non-Rovo Dev harnesses and for a file carrying no codeassembly region. Both domains share this one path, so
 * the home file is merged rather than whole-file overwritten, matching the repo file's non-clobbering shape.
 */
export async function refreshPromptsYml(harnessIds: ReadonlyArray<HarnessId>, domain: SyncDomain): Promise<void> {
  for (const harnessId of harnessIds) {
    if (harnessId !== 'rovo') {
      continue;
    }
    const { harnessHome, skillsDir } = resolveHarnessPaths(harnessId, domain.baseDir);
    const promptsPath = path.join(harnessHome, 'prompts.yml');
    const entries = await collectPromptEntries(skillsDir);
    const existing = await readFileOrEmpty(promptsPath);

    if (entries !== undefined && entries.length > 0) {
      await writeIfChanged(promptsPath, injectPromptsRegion(existing, renderPromptEntries(entries)));
      continue;
    }

    // No skills remain: strip our region, deleting the file when nothing foreign survives. A file we never owned (no
    // region) is left untouched.
    if (!hasPromptsRegion(existing)) {
      continue;
    }
    const stripped = removePromptsRegion(existing);
    await (stripped.trim() === '' ? rm(promptsPath, { force: true }) : writeIfChanged(promptsPath, stripped));
  }
}

/** Lists the Rovo Dev `prompts.yml` paths a sync of `domain` would reconcile — one per targeted Rovo Dev harness. */
export function resolvePromptsYmlPaths(
  harnessIds: ReadonlyArray<HarnessId>,
  domain: SyncDomain,
): ReadonlyArray<string> {
  return harnessIds
    .filter((harnessId) => harnessId === 'rovo')
    .map((harnessId) => path.join(resolveHarnessPaths(harnessId, domain.baseDir).harnessHome, 'prompts.yml'));
}
