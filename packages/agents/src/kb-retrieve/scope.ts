import type { KbConfig } from '@codeassembly/kb-core';
import { findKbRoot, loadKbConfig } from '@codeassembly/kb-core/discovery';

import type { ScopedKb } from './types.ts';

/**
 * Resolves which knowledge bases a query should search.
 *
 * Default scope is the `.kb/`-discovered KB nearest `startDir` plus registry's default-marked KB (the global vault).
 * `allKbs` widens scope to every entry in the merged `kb.yaml` registry.
 * Entries are de-duplicated by absolute path so a discovered KB that also appears in the registry is searched once.
 * When neither a `.kb/` root nor any registry entry is found, the result is empty — callers report that as an empty
 * result rather than an error.
 *
 * `home` overrides the directory the user-global `kb.yaml` is read from; it defaults to the real `$HOME`
 * and exists so tests can isolate registry resolution from the developer's environment.
 */
export async function resolveScope(input: { startDir: string; allKbs: boolean; home?: string }): Promise<ScopedKb[]> {
  const [discovered, config] = await Promise.all([
    findKbRoot({ startDir: input.startDir }),
    loadKbConfigSafely({
      projectDir: input.startDir,
      ...(input.home !== undefined && { home: input.home }),
    }),
  ]);

  const scoped: ScopedKb[] = [];
  const seenPaths = new Set<string>();

  function add(kb: ScopedKb): void {
    if (seenPaths.has(kb.path)) {
      return;
    }
    seenPaths.add(kb.path);
    scoped.push(kb);
  }

  if (discovered !== null) {
    add({ name: null, path: discovered.path, via: 'discovery' });
  }

  if (input.allKbs) {
    for (const entry of config.entries) {
      add({ name: entry.name, path: entry.path, via: 'registry-all' });
    }
  } else {
    const defaultEntry = config.entries.find((entry) => entry.default === true);
    if (defaultEntry !== undefined) {
      add({ name: defaultEntry.name, path: defaultEntry.path, via: 'registry-default' });
    }
  }

  return scoped;
}

// region | Helpers

/**
 * Loads the merged `kb.yaml` registry, degrading a malformed or unreadable registry to an empty config.
 *
 * A defective project- or user-level `kb.yaml` would otherwise throw out of `resolveScope` and break the structured
 * `RetrieveResult` contract that every other failure path through `runRetrieve` honors. The empty result is reported
 * through the standard no-KB diagnostic instead.
 */
async function loadKbConfigSafely(input: { projectDir: string; home?: string }): Promise<KbConfig> {
  try {
    return await loadKbConfig({
      projectDir: input.projectDir,
      ...(input.home !== undefined && { home: input.home }),
    });
  } catch {
    return { entries: [], sources: {} };
  }
}

// endregion | Helpers
