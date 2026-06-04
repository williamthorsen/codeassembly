import { tryLoadKbConfig } from '@codeassembly/kb-core/discovery';

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
 * - `not-registered`: no `kb.yaml` entry matches the requested name.
 * - `readonly-store`: the matched entry is marked `readonly: true`; writes are refused.
 */
export type ResolveStoreOutcome =
  | { ok: true; store: ResolvedStore }
  | { ok: false; reason: 'not-registered'; requestedName: string }
  | { ok: false; reason: 'readonly-store'; name: string; path: string };

/**
 * Resolves a knowledge base by registry name only.
 *
 * Unlike `resolveWritableKb`, this performs no `.kb/` discovery and no ancestor walk: a store is found purely by
 * matching `--store <name>` against the merged `kb.yaml` registry. That deliberate omission is the anti-defect for
 * auto-memory fragmentation — a capture must never silently land in a project-local `.kb/` it happened to walk into.
 *
 * `home` overrides the directory the user-global `kb.yaml` is read from; it defaults to the real `$HOME` and exists
 * so tests can isolate registry resolution from the developer's environment.
 */
export async function resolveStoreByName(input: {
  name: string;
  projectDir?: string;
  home?: string;
}): Promise<ResolveStoreOutcome> {
  const { config } = await tryLoadKbConfig({
    ...(input.projectDir !== undefined && { projectDir: input.projectDir }),
    ...(input.home !== undefined && { home: input.home }),
  });

  const match = config.entries.find((entry) => entry.name === input.name);
  if (match === undefined) {
    return { ok: false, reason: 'not-registered', requestedName: input.name };
  }
  if (match.readonly === true) {
    return { ok: false, reason: 'readonly-store', name: match.name, path: match.path };
  }
  return { ok: true, store: { name: match.name, path: match.path } };
}
