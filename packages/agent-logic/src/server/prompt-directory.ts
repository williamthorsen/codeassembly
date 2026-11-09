import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { PromptEntry } from './prompt-directory-schemas.ts';

/** The largest file, in bytes, that the file route returns. */
export const MAX_PROMPT_FILE_BYTES = 1024 * 1024;

const AGENT_LOGIC_SUFFIX = '.agent-logic.json';

/** Prompt extensions, in the order in which one is preferred when two share a base name. */
const PROMPT_EXTENSIONS = ['.md', '.txt'];

/** A directory's entries, sorted by name, or `missing` when the directory does not exist. */
export type PromptDirectoryListing = { ok: true; entries: PromptEntry[] } | { ok: false; reason: 'missing' };

/** The text of a listed file, or why it is not returned. */
export type PromptFileRead = { ok: true; text: string } | { ok: false; reason: 'missing' | 'not-listed' | 'too-large' };

/**
 * Lists the prompts and agent-logic files in a directory, grouped by base name. Only regular files are listed, so a
 * subdirectory or a symlink is not; a dotfile and a file with another name are not either.
 */
export async function listPromptDirectory(directory: string): Promise<PromptDirectoryListing> {
  let names: string[];
  try {
    const dirents = await readdir(directory, { withFileTypes: true });
    names = dirents.filter((dirent) => dirent.isFile() && !dirent.name.startsWith('.')).map((dirent) => dirent.name);
  } catch (error) {
    if (isMissing(error)) return { ok: false, reason: 'missing' };
    throw error;
  }

  const entries = new Map<string, PromptEntry>();
  for (const name of names) {
    const match = classify(name);
    if (match === undefined) continue;
    const entry = entries.get(match.base) ?? { name: match.base };
    if (match.kind === 'agent-logic') entry.agentLogicFile = name;
    else if (entry.promptFile === undefined || rankPrompt(name) < rankPrompt(entry.promptFile)) entry.promptFile = name;
    entries.set(match.base, entry);
  }
  return {
    ok: true,
    entries: entries
      .values()
      .toArray()
      .toSorted((a, b) => compareNames(a.name, b.name)),
  };
}

/**
 * Returns the text of a file that a fresh listing of the directory names, never joining an unlisted name onto the
 * directory, so that a name cannot reach outside it.
 */
export async function readPromptDirectoryFile(directory: string, fileName: string): Promise<PromptFileRead> {
  const listing = await listPromptDirectory(directory);
  if (!listing.ok) return { ok: false, reason: 'missing' };
  const isListed = listing.entries.some((entry) => entry.promptFile === fileName || entry.agentLogicFile === fileName);
  if (!isListed) return { ok: false, reason: 'not-listed' };

  const filePath = path.join(directory, fileName);
  try {
    if ((await stat(filePath)).size > MAX_PROMPT_FILE_BYTES) return { ok: false, reason: 'too-large' };
    return { ok: true, text: await readFile(filePath, 'utf8') };
  } catch (error) {
    // The file was removed between the listing and the read.
    if (isMissing(error)) return { ok: false, reason: 'not-listed' };
    throw error;
  }
}

/**
 * Writes a new file to the directory, refusing a name that already exists so that a write never replaces a file. The
 * name must not contain a path separator.
 */
export async function writePromptDirectoryFile(
  directory: string,
  fileName: string,
  text: string,
): Promise<{ ok: true; path: string } | { ok: false; reason: 'exists' }> {
  const filePath = path.join(directory, fileName);
  try {
    await writeFile(filePath, text, { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST') {
      return { ok: false, reason: 'exists' };
    }
    throw error;
  }
  return { ok: true, path: filePath };
}

// region | Helpers
/** Returns a file's base name and kind, or `undefined` for a file that the listing leaves out. */
function classify(name: string): { base: string; kind: 'agent-logic' | 'prompt' } | undefined {
  if (name.endsWith(AGENT_LOGIC_SUFFIX)) return toMatch(name.slice(0, -AGENT_LOGIC_SUFFIX.length), 'agent-logic');
  const extension = PROMPT_EXTENSIONS.find((candidate) => name.endsWith(candidate));
  return extension === undefined ? undefined : toMatch(name.slice(0, -extension.length), 'prompt');
}

function compareNames(a: string, b: string): number {
  return a.localeCompare(b, 'en', { numeric: true });
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function rankPrompt(name: string): number {
  return PROMPT_EXTENSIONS.findIndex((extension) => name.endsWith(extension));
}

function toMatch(
  base: string,
  kind: 'agent-logic' | 'prompt',
): { base: string; kind: 'agent-logic' | 'prompt' } | undefined {
  return base === '' ? undefined : { base, kind };
}
// endregion | Helpers
