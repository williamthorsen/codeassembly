import { readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type { ProjectIndex, ProjectInfo, RunInfo, TicketInfo } from '../../shared/types/api.js';
import { parseStatusFile } from '../adapters/status-adapter.js';

export class ProjectScanner {
  private basePath: string;
  private index: ProjectIndex | null = null;

  constructor(basePath?: string) {
    this.basePath = basePath ?? process.env.AI_PROJECTS_PATH ?? join(homedir(), '.ai', 'projects');
  }

  async scan(): Promise<ProjectIndex> {
    const projects: ProjectInfo[] = [];

    try {
      const projectDirs = await readdir(this.basePath);

      for (const slug of projectDirs) {
        if (slug.startsWith('.')) continue;

        const projectPath = join(this.basePath, slug);
        try {
          const projectStat = await stat(projectPath);
          if (!projectStat.isDirectory()) continue;

          const tickets = await this.scanProject(projectPath, slug);
          if (tickets.length > 0) {
            projects.push({ slug, tickets });
          }
        } catch (error) {
          console.error(`Error scanning project ${slug}:`, error);
          continue;
        }
      }
    } catch (error) {
      console.error(`Failed to scan projects directory ${this.basePath}:`, error);
    }

    this.index = { projects };
    return this.index;
  }

  private async scanProject(projectPath: string, slug: string): Promise<TicketInfo[]> {
    try {
      const entries = await readdir(projectPath);

      // Pattern 1: tickets/{ticket-id}/{run-id}
      // Pattern 2: {ticket-id}/{run-id} (direct entries, no tickets/ directory)
      // Only one pattern is used per project to avoid duplicate ticket entries.
      if (entries.includes('tickets')) {
        return await this.scanTicketsDirectory(projectPath, slug);
      }
      return await this.scanDirectEntries(entries, projectPath, slug);
    } catch (error) {
      console.error(`Error reading project directory ${slug}:`, error);
      return [];
    }
  }

  private async scanTicketsDirectory(projectPath: string, slug: string): Promise<TicketInfo[]> {
    const tickets: TicketInfo[] = [];
    const ticketsPath = join(projectPath, 'tickets');

    try {
      const ticketDirs = await readdir(ticketsPath);

      for (const ticketId of ticketDirs) {
        if (ticketId.startsWith('.')) continue;
        const ticketPath = join(ticketsPath, ticketId);
        try {
          const ticketStat = await stat(ticketPath);
          if (!ticketStat.isDirectory()) continue;
        } catch (error) {
          console.debug(`Skipping non-directory ticket entry ${ticketId}:`, error);
          continue;
        }
        const runs = await this.scanTicket(ticketPath, slug, ticketId);
        if (runs.length > 0) {
          tickets.push({ ticketId, runs });
        }
      }
    } catch (error) {
      console.error(`Error scanning tickets directory for ${slug}:`, error);
    }

    return tickets;
  }

  private async scanDirectEntries(entries: string[], projectPath: string, slug: string): Promise<TicketInfo[]> {
    const tickets: TicketInfo[] = [];

    for (const entry of entries) {
      if (entry.startsWith('.')) continue;
      const entryPath = join(projectPath, entry);
      try {
        const entryStat = await stat(entryPath);
        if (!entryStat.isDirectory()) continue;

        const runs = await this.scanTicket(entryPath, slug, entry);
        if (runs.length > 0) {
          tickets.push({ ticketId: entry, runs });
        }
      } catch (error) {
        console.error(`Error scanning potential ticket directory ${entry} in ${slug}:`, error);
        continue;
      }
    }

    return tickets;
  }

  private async scanTicket(ticketPath: string, slug: string, ticketId: string): Promise<RunInfo[]> {
    const runs: RunInfo[] = [];

    try {
      const runDirs = await readdir(ticketPath);

      for (const runId of runDirs) {
        if (runId.startsWith('.')) continue;
        const runPath = join(ticketPath, runId);

        try {
          const runStat = await stat(runPath);
          if (!runStat.isDirectory()) continue;

          const statusPath = join(runPath, 'status.json');
          const status = await parseStatusFile(statusPath);
          runs.push({
            runId,
            path: runPath,
            status: status.status,
            startedAt: status.startedAt,
          });
        } catch (error) {
          console.error(`Error parsing status.json for ${slug}/${ticketId}/${runId}:`, error);
          continue;
        }
      }
    } catch (error) {
      console.error(`Failed to scan ticket directory ${ticketPath}:`, error);
      return [];
    }

    // Sort runs by startedAt descending (most recent first)
    runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    return runs;
  }

  getIndex(): ProjectIndex | null {
    return this.index;
  }
}
