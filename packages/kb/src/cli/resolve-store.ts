import { findKbRoot } from '../discovery/find-kb-root.ts';
import { tryLoadKbRegistry } from '../discovery/load-registry.ts';
import type { StoreRef } from './format.ts';

/** The store-resolution outcome: a resolved store, or a categorical failure message for exit 2. */
export type ResolveStoreOutcome = { ok: true; store: StoreRef; readonly: boolean } | { ok: false; message: string };

/**
 * Resolves the store a command runs against. An explicit `--kb <name>` is looked up in the merged registry
 * (`tryLoadKbRegistry` with `projectDir: cwd`, so project-local `.agents/kb.yaml` entries join the user-global
 * registry); without a flag, the nearest ancestor `.kb/` directory is used. An unknown `--kb` name or a missing `.kb/`
 * fails for exit 2.
 *
 * The registry's `readonly` flag is reported rather than enforced: a command that writes into the store refuses on it,
 * and a read-only command ignores it. It is kept off {@link StoreRef}, which carries the identity a report renders. A
 * discovered store is cross-referenced against the registry by path, so a vault marked readonly is reported as such
 * however it was named; one with no registry entry has no metadata to consult and is reported writable.
 */
export async function resolveStore(input: {
  explicitKb: string | null;
  cwd: string;
  home?: string;
}): Promise<ResolveStoreOutcome> {
  const { config } = await tryLoadKbRegistry({
    projectDir: input.cwd,
    ...(input.home !== undefined && { home: input.home }),
  });

  if (input.explicitKb !== null) {
    const match = config.entries.find((entry) => entry.name === input.explicitKb);
    if (match === undefined) {
      return { ok: false, message: `--kb "${input.explicitKb}" does not match any registered knowledge base` };
    }
    return { ok: true, store: { name: match.name, path: match.path }, readonly: match.readonly ?? false };
  }

  const discovered = await findKbRoot({ startDir: input.cwd });
  if (discovered === null) {
    return { ok: false, message: 'no .kb/ directory found in the current directory or any ancestor' };
  }
  const registered = config.entries.find((entry) => entry.path === discovered.path);
  return {
    ok: true,
    store: { name: registered?.name ?? null, path: discovered.path },
    readonly: registered?.readonly ?? false,
  };
}
