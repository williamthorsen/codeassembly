import { findKbRoot } from '../discovery/find-kb-root.ts';
import { tryLoadKbRegistry } from '../discovery/load-registry.ts';
import type { StoreRef } from './format.ts';

/** The store-resolution outcome: a resolved store, or a categorical failure message for exit 2. */
export type ResolveStoreOutcome = { ok: true; store: StoreRef } | { ok: false; message: string };

/**
 * Resolves the store a command runs against. An explicit `--kb <name>` is looked up in the merged registry
 * (`tryLoadKbRegistry` with `projectDir: cwd`, so project-local `.agents/kb.yaml` entries join the user-global
 * registry); without a flag, the nearest ancestor `.kb/` directory is used. An unknown `--kb` name or a missing `.kb/`
 * fails for exit 2.
 *
 * The lookup itself is read-only, so a store's registry `readonly` flag is ignored here; a command that writes checks
 * it separately.
 */
export async function resolveStore(input: {
  explicitKb: string | null;
  cwd: string;
  home?: string;
}): Promise<ResolveStoreOutcome> {
  if (input.explicitKb !== null) {
    const { config } = await tryLoadKbRegistry({
      projectDir: input.cwd,
      ...(input.home !== undefined && { home: input.home }),
    });
    const match = config.entries.find((entry) => entry.name === input.explicitKb);
    if (match === undefined) {
      return { ok: false, message: `--kb "${input.explicitKb}" does not match any registered knowledge base` };
    }
    return { ok: true, store: { name: match.name, path: match.path } };
  }

  const discovered = await findKbRoot({ startDir: input.cwd });
  if (discovered === null) {
    return { ok: false, message: 'no .kb/ directory found in the current directory or any ancestor' };
  }
  return { ok: true, store: { name: null, path: discovered.path } };
}
