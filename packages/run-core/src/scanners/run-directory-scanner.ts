import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

export interface RunDirectoryEntry {
  projectSlug: string;
  ticketId: string;
  runId: string;
  runPath: string;
}

/** Walks the project hierarchy and returns all candidate run directory entries. */
export async function discoverRunDirectories(basePath: string): Promise<RunDirectoryEntry[]> {
  const entries: RunDirectoryEntry[] = [];

  let projectDirs: string[];
  try {
    projectDirs = await readdir(basePath);
  } catch {
    return [];
  }

  for (const slug of projectDirs) {
    if (slug.startsWith('.')) continue;

    const projectPath = join(basePath, slug);
    if (!(await isDirectory(projectPath))) continue;

    const projectEntries = await readdir(projectPath).catch(() => [] as string[]);
    const ticketsDir = projectEntries.includes('tickets');

    if (ticketsDir) {
      const ticketEntries = await scanTicketsDir(join(projectPath, 'tickets'), slug);
      entries.push(...ticketEntries);
    } else {
      const ticketEntries = await scanDirectEntries(projectEntries, projectPath, slug);
      entries.push(...ticketEntries);
    }
  }

  return entries;
}

async function scanTicketsDir(ticketsPath: string, slug: string): Promise<RunDirectoryEntry[]> {
  const entries: RunDirectoryEntry[] = [];
  const ticketDirs = await readdir(ticketsPath).catch(() => [] as string[]);

  for (const ticketId of ticketDirs) {
    if (ticketId.startsWith('.')) continue;
    const ticketPath = join(ticketsPath, ticketId);
    if (!(await isDirectory(ticketPath))) continue;
    entries.push(...(await scanRunsInTicket(ticketPath, slug, ticketId)));
  }

  return entries;
}

async function scanDirectEntries(
  projectEntries: string[],
  projectPath: string,
  slug: string,
): Promise<RunDirectoryEntry[]> {
  const entries: RunDirectoryEntry[] = [];

  for (const ticketId of projectEntries) {
    if (ticketId.startsWith('.')) continue;
    const ticketPath = join(projectPath, ticketId);
    if (!(await isDirectory(ticketPath))) continue;
    entries.push(...(await scanRunsInTicket(ticketPath, slug, ticketId)));
  }

  return entries;
}

async function scanRunsInTicket(ticketPath: string, slug: string, ticketId: string): Promise<RunDirectoryEntry[]> {
  const entries: RunDirectoryEntry[] = [];
  const runDirs = await readdir(ticketPath).catch(() => [] as string[]);

  for (const runId of runDirs) {
    if (runId.startsWith('.')) continue;
    if (runId.endsWith('-interactive')) continue;
    const runPath = join(ticketPath, runId);
    if (!(await isDirectory(runPath))) continue;
    entries.push({ projectSlug: slug, ticketId, runId, runPath });
  }

  return entries;
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch {
    return false;
  }
}
