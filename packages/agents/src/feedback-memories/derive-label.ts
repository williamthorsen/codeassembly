import { basename } from 'node:path';

/**
 * Returns a memory store's display label: the resolved repo directory's basename, or the raw slug when no repo resolves.
 */
export function deriveLabel(repoPath: string | null, memoryStore: string): string {
  return repoPath !== null ? basename(repoPath) : memoryStore;
}
