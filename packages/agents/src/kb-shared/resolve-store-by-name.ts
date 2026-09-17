import { tryLoadKbRegistry } from '@williamthorsen/kb/discovery';

/** A knowledge base resolved by registry name. */
export interface ResolvedStore {
  /** The store's display name, as registered in `kb.yaml`. */
  name: string;
  /** Absolute path to the store's root directory. */
  path: string;
}

/**
 * The resolution outcome: a resolved store, or a categorical failure the caller turns into a structured error.
 *
 * `not-registered` carries `registryError` when the registry failed to load, leaving no entries to match, so that the
 * caller can attribute the miss to the load failure rather than to a genuinely absent name.
 */
export type ResolveStoreOutcome =
  | { ok: true; store: ResolvedStore }
  | { ok: false; reason: 'not-registered'; requestedName: string; registryError?: string }
  | { ok: false; reason: 'readonly-store'; name: string; path: string };

/**
 * Resolves a knowledge base by registry name alone, matching `name` against the merged `kb.yaml` registry. The
 * resolver runs no `.kb/` discovery and no ancestor walk: a capture lands in the named store or nowhere.
 *
 * `home` overrides the directory from which the user-global `kb.yaml` is read; it defaults to the real `$HOME`
 * and exists so that tests can isolate registry resolution from the developer's environment.
 */
export async function resolveStoreByName(input: {
  name: string;
  projectDir?: string;
  home?: string;
}): Promise<ResolveStoreOutcome> {
  const { config, error: registryError } = await tryLoadKbRegistry({
    ...(input.projectDir !== undefined && { projectDir: input.projectDir }),
    ...(input.home !== undefined && { home: input.home }),
  });

  const match = config.entries.find((entry) => entry.name === input.name);
  if (match === undefined) {
    return {
      ok: false,
      reason: 'not-registered',
      requestedName: input.name,
      ...(registryError !== undefined && { registryError }),
    };
  }
  if (match.readonly === true) {
    return { ok: false, reason: 'readonly-store', name: match.name, path: match.path };
  }
  return { ok: true, store: { name: match.name, path: match.path } };
}
