import { basename } from 'node:path';

/**
 * Returns a memory store's display label: the resolved repo directory's basename, or the raw slug when no repo resolves.
 * This is the name `list` prints and the name `--memory-store` accepts alongside the slug, so both surfaces derive it
 * here rather than each deciding what a store is called.
 */
export function deriveLabel(repoPath: string | null, memoryStore: string): string {
  return repoPath !== null ? basename(repoPath) : memoryStore;
}
