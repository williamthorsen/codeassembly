import { deriveLabel } from './derive-label.ts';
import { resolveRepoPath } from './resolve-repo-path.ts';
import type { EnumerateFailure } from './types.ts';

/**
 * Resolves a requested memory store to the store directory holding it, accepting either the store's directory name or
 * the label `list` displays. A directory-name match wins outright, so an enumerated `memoryStore` value resolves without
 * touching the filesystem; only an unmatched value falls back to deriving every store's label, which probes the
 * filesystem once per store. Two stores can share a label — same repo basename under different parents — so a label
 * matching more than one fails as `ambiguous-memory-store` naming the candidates, rather than resolving to a guess.
 *
 * `resolveRepo` is injected so label resolution can be exercised without a repo tree on disk.
 */
export async function resolveMemoryStore(input: {
  requested: string;
  memoryStores: readonly string[];
  projectsRoot: string;
  resolveRepo?: (slug: string) => Promise<string | null>;
}): Promise<{ ok: true; memoryStore: string } | EnumerateFailure> {
  if (input.memoryStores.includes(input.requested)) {
    return { ok: true, memoryStore: input.requested };
  }

  const resolveRepo = input.resolveRepo ?? resolveRepoPath;
  const matched: string[] = [];
  for (const memoryStore of input.memoryStores) {
    if (deriveLabel(await resolveRepo(memoryStore), memoryStore) === input.requested) {
      matched.push(memoryStore);
    }
  }

  const [first] = matched;
  if (first === undefined) {
    return {
      ok: false,
      error: 'no-such-memory-store',
      message: `no memory store "${input.requested}" under ${input.projectsRoot}`,
    };
  }
  if (matched.length > 1) {
    return {
      ok: false,
      error: 'ambiguous-memory-store',
      message: `"${input.requested}" names ${matched.length} memory stores (${matched.join(', ')}); pass one by its directory name`,
    };
  }
  return { ok: true, memoryStore: first };
}
