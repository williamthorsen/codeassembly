import type { FlatRunInfo, ProjectIndex } from '../../shared/types/api.ts';

/** Flattens a nested ProjectIndex into a flat array of runs sorted by startedAt descending (most recent first). */
export function flattenProjectIndex(index: ProjectIndex | null): FlatRunInfo[] {
  if (!index) return [];

  const runs: FlatRunInfo[] = [];

  for (const project of index.projects) {
    for (const ticket of project.tickets) {
      for (const run of ticket.runs) {
        runs.push({
          projectSlug: project.slug,
          ticketId: ticket.ticketId,
          runId: run.runId,
          status: run.status,
          startedAt: run.startedAt,
          completedAt: run.completedAt,
        });
      }
    }
  }

  runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  return runs;
}
