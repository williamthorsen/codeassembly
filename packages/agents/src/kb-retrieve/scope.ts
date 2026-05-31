import { findKbRoot, tryLoadKbConfig } from '@codeassembly/kb-core/discovery';

import type { ScopedKb } from './types.ts';

/** The resolved query scope: the in-scope KBs plus a captured registry-load error when one occurred. */
export interface ScopeResult {
  /** The knowledge bases the query should search. */
  kbs: ScopedKb[];
  /** The `kb.yaml` load error message, present only when the registry was malformed or unreadable. */
  registryError?: string;
}

/**
 * Resolves which knowledge bases a query should search.
 *
 * Default scope is the `.kb/`-discovered KB nearest `startDir` plus registry's default-marked KB (the global vault).
 * `allKbs` widens scope to every entry in the merged `kb.yaml` registry.
 * Entries are de-duplicated by absolute path so a discovered KB that also appears in the registry is searched once.
 * When neither a `.kb/` root nor any registry entry is found, the scope is empty; callers report that as an empty
 * result rather than an error.
 *
 * A malformed or unreadable registry degrades to no registry entries; its captured message is returned as
 * `registryError` for the caller to surface, never formatted or printed here.
 *
 * `home` overrides the directory the user-global `kb.yaml` is read from; it defaults to the real `$HOME`
 * and exists so tests can isolate registry resolution from the developer's environment.
 */
export async function resolveScope(input: { startDir: string; allKbs: boolean; home?: string }): Promise<ScopeResult> {
  const [discovered, { config, error: registryError }] = await Promise.all([
    findKbRoot({ startDir: input.startDir }),
    tryLoadKbConfig({
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

  return { kbs: scoped, ...(registryError !== undefined && { registryError }) };
}
