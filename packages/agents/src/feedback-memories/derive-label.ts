import { basename } from 'node:path';

/**
 * Returns a memory store's display label: the resolved repo directory's basename, or the raw slug when the slug does
 * not resolve to a repo.
 */
export function deriveLabel(repoPath: string | null, memoryStore: string): string {
  return repoPath !== null ? basename(repoPath) : memoryStore;
}
