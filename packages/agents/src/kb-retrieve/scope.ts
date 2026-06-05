import { findKbRoot, tryLoadKbRegistry } from '@codeassembly/kb/discovery';

import type { ScopedKb } from './types.ts';

/** The resolved query scope: the in-scope KBs plus a captured registry-load error when one occurred. */
export interface ScopeResult {
  /** The knowledge bases the query should search. */
  kbs: ScopedKb[];
  /** The `kb.yaml` load error message, present only when the registry was malformed or unreadable. */
  registryError?: string;
  /** The requested `--store`/`--kb` name that matched no registry entry; present only on a named-store miss. */
  storeNotFound?: string;
}

/**
 * Resolves which knowledge bases a query should search.
 *
 * When `storeName` is set, scope is the single registry entry of that name and nothing else: `findKbRoot` is skipped
 * entirely, so a project-local `.kb/` cannot leak into results. This mirrors the write path's resolve-by-name
 * guarantee. A name that matches no entry yields an empty scope and a `storeNotFound` marker for the caller to surface.
 *
 * Otherwise, default scope is the `.kb/`-discovered KB nearest `startDir` plus the registry's default-marked KB; and
 * `allKbs` widens scope to every entry in the merged `kb.yaml` registry. Entries are de-duplicated by absolute path so
 * a discovered KB that also appears in the registry is searched once. When neither a `.kb/` root nor any registry
 * entry is found, the scope is empty; callers report that as an empty result rather than an error.
 *
 * A malformed or unreadable registry degrades to no registry entries; its captured message is returned as
 * `registryError` for the caller to surface, never formatted or printed here.
 *
 * `home` overrides the directory the user-global `kb.yaml` is read from; it defaults to the real `$HOME`
 * and exists so tests can isolate registry resolution from the developer's environment.
 */
export async function resolveScope(input: {
  startDir: string;
  allKbs: boolean;
  storeName?: string;
  home?: string;
}): Promise<ScopeResult> {
  // A named store resolves by registry lookup only — no discovery, no ancestor walk.
  if (input.storeName !== undefined) {
    const { config, error: registryError } = await tryLoadKbRegistry({
      ...(input.home !== undefined && { home: input.home }),
    });
    const match = config.entries.find((entry) => entry.name === input.storeName);
    if (match === undefined) {
      return {
        kbs: [],
        ...(registryError !== undefined && { registryError }),
        storeNotFound: input.storeName,
      };
    }
    return {
      kbs: [{ name: match.name, path: match.path, via: 'registry-named' }],
      ...(registryError !== undefined && { registryError }),
    };
  }

  const [discovered, { config, error: registryError }] = await Promise.all([
    findKbRoot({ startDir: input.startDir }),
    tryLoadKbRegistry({
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
