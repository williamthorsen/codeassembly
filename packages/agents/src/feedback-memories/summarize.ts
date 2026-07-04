import { stat } from 'node:fs/promises';
import { basename } from 'node:path';

import { enumerateFeedbackMemories } from './enumerate.ts';
import type { FeedbackMemory, ProjectSummary, SummarizeResult } from './types.ts';

/**
 * Rolls the flat feedback-memory enumeration up into a per-project summary: one entry per store carrying its memory
 * count, the newest memory file's modification time, and each memory's slug and description. Projects are sorted
 * alphabetically by label (case-insensitive). An enumeration failure — an absent projects root, or a scoped store that
 * names nothing — is propagated unchanged, so a caller distinguishes it the same way it would from `enumerate`.
 */
export async function summarizeFeedbackMemories(input: {
  projectsRoot: string;
  store?: string;
  machine?: string;
}): Promise<SummarizeResult> {
  const enumerated = await enumerateFeedbackMemories({
    projectsRoot: input.projectsRoot,
    ...(input.store !== undefined && { store: input.store }),
    ...(input.machine !== undefined && { machine: input.machine }),
  });
  if (!enumerated.ok) {
    return enumerated;
  }

  const projects: ProjectSummary[] = [];
  for (const [store, memories] of groupByStore(enumerated.memories)) {
    projects.push({
      store,
      label: deriveLabel(memories[0]?.repoPath ?? null, store),
      repoPath: memories[0]?.repoPath ?? null,
      count: memories.length,
      lastModified: await newestMtime(memories),
      memories: memories.map((memory) => ({ slug: memory.slug, description: memory.description })),
    });
  }
  projects.sort((first, second) => first.label.localeCompare(second.label, undefined, { sensitivity: 'base' }));

  return {
    ok: true,
    machine: enumerated.machine,
    projectsRoot: enumerated.projectsRoot,
    projects,
    total: enumerated.memories.length,
    skipped: enumerated.skipped,
  };
}

// region | Helpers

/** Returns the store's display label: the resolved repo directory's basename, or the raw slug when no repo resolves. */
export function deriveLabel(repoPath: string | null, store: string): string {
  return repoPath !== null ? basename(repoPath) : store;
}

/** Groups enumerated memories by store slug, preserving enumeration's per-store ordering; every group is non-empty. */
function groupByStore(memories: readonly FeedbackMemory[]): Map<string, FeedbackMemory[]> {
  const groups = new Map<string, FeedbackMemory[]>();
  for (const memory of memories) {
    const group = groups.get(memory.store) ?? [];
    group.push(memory);
    groups.set(memory.store, group);
  }
  return groups;
}

/** Returns the newest memory file's modification time in the group as an ISO-8601 string, statting each file. */
async function newestMtime(memories: readonly FeedbackMemory[]): Promise<string> {
  let newestMs = 0;
  for (const memory of memories) {
    const { mtimeMs } = await stat(memory.path);
    if (mtimeMs > newestMs) {
      newestMs = mtimeMs;
    }
  }
  return new Date(newestMs).toISOString();
}

// endregion | Helpers
