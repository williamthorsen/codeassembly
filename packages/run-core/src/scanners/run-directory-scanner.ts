import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { describeError } from '@williamthorsen/toolbelt.errors';

import { isEnoent } from '../type-guards.ts';

export interface RunDirectoryEntry {
  projectSlug: string;
  ticketId: string;
  runId: string;
  runPath: string;
}

const TAG = '[run-directory-scanner]';

/** Walks the project hierarchy and returns all candidate run directory entries. */
export async function discoverRunDirectories(basePath: string): Promise<RunDirectoryEntry[]> {
  const entries: RunDirectoryEntry[] = [];

  let projectDirs: string[];
  try {
    projectDirs = await readdir(basePath);
  } catch (error) {
    console.warn(`${TAG} Could not read base path "${basePath}":`, describeError(error));
    return [];
  }

  for (const slug of projectDirs) {
    if (slug.startsWith('.')) continue;

    const projectPath = join(basePath, slug);
    if (!(await isDirectory(projectPath))) continue;

    const projectEntries = await readdirSafe(projectPath);
    const hasTicketsDir = projectEntries.includes('tickets');

    const ticketEntries = hasTicketsDir
      ? await scanTicketsDir(join(projectPath, 'tickets'), slug)
      : await scanDirectEntries(projectEntries, projectPath, slug);
    entries.push(...ticketEntries);
  }

  return entries;
}

async function scanTicketsDir(ticketsPath: string, slug: string): Promise<RunDirectoryEntry[]> {
  const entries: RunDirectoryEntry[] = [];
  const ticketDirs = await readdirSafe(ticketsPath);

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
  const runDirs = await readdirSafe(ticketPath);

  for (const runId of runDirs) {
    if (runId.startsWith('.')) continue;
    if (runId.endsWith('-interactive')) continue;
    const runPath = join(ticketPath, runId);
    if (!(await isDirectory(runPath))) continue;
    entries.push({ projectSlug: slug, ticketId, runId, runPath });
  }

  return entries;
}

/** Reads a directory, returning an empty array and logging a warning on failure. */
async function readdirSafe(dirPath: string): Promise<string[]> {
  try {
    return await readdir(dirPath);
  } catch (error) {
    console.warn(`${TAG} Could not read directory "${dirPath}":`, describeError(error));
    return [];
  }
}

/** Returns false for missing paths and logs a warning for non-ENOENT errors. */
async function isDirectory(path: string): Promise<boolean> {
  try {
    const s = await stat(path);
    return s.isDirectory();
  } catch (error) {
    if (!isEnoent(error)) {
      console.warn(`${TAG} Could not stat "${path}":`, describeError(error));
    }
    return false;
  }
}
