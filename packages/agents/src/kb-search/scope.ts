import { findKbRoot, tryLoadKbRegistry } from '@williamthorsen/kb/discovery';

import type { ScopedKb } from './types.ts';

/** The resolved query scope: the in-scope KBs, plus any resolution problem for the caller to report. */
export interface ScopeResult {
  /** The knowledge bases that the query should search. */
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
 * entirely, so a project-local `.kb/` cannot appear in results.
 *
 * Otherwise, default scope is the `.kb/`-discovered KB nearest `startDir` plus the registry's resolved `default_kb`; and
 * `allKbs` widens scope to every entry in the merged `kb.yaml` registry. A KB that is both discovered and registered
 * is added to scope once, de-duplicated by absolute path.
 *
 * Degrades a malformed or unreadable registry to no registry entries, and records its message in `registryError`.
 *
 * `home` overrides the directory from which the user-global `kb.yaml` is read; it defaults to the real `$HOME`
 * and exists so that tests can isolate registry resolution from the developer's environment.
 */
export async function resolveScope(input: {
  startDir: string;
  allKbs: boolean;
  storeName?: string;
  home?: string;
}): Promise<ScopeResult> {
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
  } else if (config.defaultKb !== undefined) {
    add({ name: config.defaultKb.name, path: config.defaultKb.path, via: 'registry-default' });
  }

  return { kbs: scoped, ...(registryError !== undefined && { registryError }) };
}
