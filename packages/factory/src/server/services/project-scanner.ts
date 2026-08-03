import { discoverRunDirectories, validateRunDirectory } from 'codeassembly-run-core/scanners';

import { factoryConfig } from '../../config.js';
import type { ProjectIndex, ProjectInfo, RunInfo, TicketInfo } from '../../shared/types/api.js';

export class ProjectScanner {
  private basePath: string;
  private index: ProjectIndex | null = null;

  constructor(basePath: string) {
    this.basePath = basePath;
  }

  async scan(): Promise<ProjectIndex> {
    const entries = await discoverRunDirectories(this.basePath);

    const projectMap = new Map<string, Map<string, RunInfo[]>>();

    for (const entry of entries) {
      try {
        const result = await validateRunDirectory(entry.runPath);
        if (!result.valid) {
          if (factoryConfig.logInvalidRuns) {
            console.warn(
              `[project-scanner] Skipping ${entry.projectSlug}/${entry.ticketId}/${entry.runId}: ${result.reason}`,
            );
          }
          continue;
        }

        const run: RunInfo = {
          runId: entry.runId,
          path: entry.runPath,
          status: result.status.status,
          startedAt: result.status.startedAt,
          completedAt: result.status.completedAt,
        };

        let ticketMap = projectMap.get(entry.projectSlug);
        if (!ticketMap) {
          ticketMap = new Map<string, RunInfo[]>();
          projectMap.set(entry.projectSlug, ticketMap);
        }

        let runs = ticketMap.get(entry.ticketId);
        if (!runs) {
          runs = [];
          ticketMap.set(entry.ticketId, runs);
        }
        runs.push(run);
      } catch (error) {
        console.error(`Error parsing run data for ${entry.projectSlug}/${entry.ticketId}/${entry.runId}:`, error);
        continue;
      }
    }

    const projects: ProjectInfo[] = [];
    for (const [slug, ticketMap] of projectMap) {
      const tickets: TicketInfo[] = [];
      for (const [ticketId, runs] of ticketMap) {
        runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
        tickets.push({ ticketId, runs });
      }
      projects.push({ slug, tickets });
    }

    this.index = { projects };
    return this.index;
  }

  getBasePath(): string {
    return this.basePath;
  }

  getIndex(): ProjectIndex | null {
    return this.index;
  }
}
