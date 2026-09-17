import { readdir, readFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import { basename, join } from 'node:path';

import { readNoteContent } from '@williamthorsen/kb/note-io';

import { isMissingFile, isRecord } from '../lib/type-guards.ts';
import { resolveMemoryStore } from './resolve-memory-store.ts';
import { resolveRepoPath } from './resolve-repo-path.ts';
import type { EnumerateResult, FeedbackMemory, SkippedMemory } from './types.ts';

/**
 * Walks every `<projects-root>/<project>/memory/` directory and returns each memory whose effective type is `feedback`,
 * scoped to one memory store when `memoryStore` is set. Membership is decided by parsed frontmatter, so both the legacy
 * and the current memory schema are enumerated, and a file that cannot be read as a note is reported in `skipped`.
 *
 * An absent projects root is the one categorical failure; an unresolvable `memoryStore` fails per `resolveMemoryStore`,
 * and an absent per-store `memory/` directory is skipped.
 */
export async function enumerateFeedbackMemories(input: {
  projectsRoot: string;
  memoryStore?: string;
  machine?: string;
}): Promise<EnumerateResult> {
  const machine = input.machine ?? hostname();

  let memoryStores: string[];
  try {
    const entries = await readdir(input.projectsRoot, { withFileTypes: true });
    memoryStores = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch (error) {
    if (isMissingFile(error)) {
      return { ok: false, error: 'no-projects-root', message: `no projects root at ${input.projectsRoot}` };
    }
    throw error;
  }
  memoryStores = memoryStores.toSorted();

  if (input.memoryStore !== undefined) {
    const resolved = await resolveMemoryStore({
      requested: input.memoryStore,
      memoryStores,
      projectsRoot: input.projectsRoot,
    });
    if (!resolved.ok) {
      return resolved;
    }
    memoryStores = [resolved.memoryStore];
  }

  const memories: FeedbackMemory[] = [];
  const skipped: SkippedMemory[] = [];

  for (const memoryStore of memoryStores) {
    const memoryDir = join(input.projectsRoot, memoryStore, 'memory');
    const files = await listMemoryFiles(memoryDir);
    const memoryIndexPath = join(memoryDir, 'MEMORY.md');
    // Resolve the store's origin repo once (every memory in it shares the slug), and only when it has memories.
    const repoPath = files.length > 0 ? await resolveRepoPath(memoryStore) : null;

    for (const file of files) {
      const path = join(memoryDir, file);
      const record = await readMemory({ path, memoryStore, repoPath, machine, memoryIndexPath });
      if (record.kind === 'feedback') {
        memories.push(record.memory);
      } else if (record.kind === 'unreadable') {
        skipped.push({ path, reason: record.reason });
      }
    }
  }

  return { ok: true, machine, projectsRoot: input.projectsRoot, memories, skipped };
}

// region | Helpers

/** Lists the `.md` memory files in a store, excluding the `MEMORY.md` index; an absent directory yields no files. */
async function listMemoryFiles(memoryDir: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(memoryDir);
  } catch (error) {
    if (isMissingFile(error)) {
      return [];
    }
    throw error;
  }
  return entries.filter((name) => name.endsWith('.md') && name !== 'MEMORY.md').toSorted();
}

/** Reads one memory file and classifies it as a feedback memory, some other memory, or an unreadable note. */
async function readMemory(input: {
  path: string;
  memoryStore: string;
  repoPath: string | null;
  machine: string;
  memoryIndexPath: string;
}): Promise<{ kind: 'feedback'; memory: FeedbackMemory } | { kind: 'other' } | { kind: 'unreadable'; reason: string }> {
  const content = await readFile(input.path, 'utf8');
  const note = readNoteContent(content);
  if (note.error !== undefined) {
    // Surface a malformed memory (a fence wrapping unparseable YAML) so an operator can route it by hand. A file with
    // no fence is not a memory at all, and a feedback memory always has frontmatter, so skipping it never hides one.
    return hasFrontmatterFence(content) ? { kind: 'unreadable', reason: note.error } : { kind: 'other' };
  }
  if (effectiveType(note.fields) !== 'feedback') {
    return { kind: 'other' };
  }
  return {
    kind: 'feedback',
    memory: {
      path: input.path,
      memoryStore: input.memoryStore,
      repoPath: input.repoPath,
      machine: input.machine,
      slug: basename(input.path, '.md'),
      name: stringField(note.fields, 'name'),
      description: stringField(note.fields, 'description'),
      originSessionId: originSessionId(note.fields),
      body: note.body,
      memoryIndexPath: input.memoryIndexPath,
    },
  };
}

/** True when content opens with a `---` frontmatter fence and carries a closing fence, the shape every memory has. */
function hasFrontmatterFence(content: string): boolean {
  const lines = content.split('\n');
  return lines[0] === '---' && lines.slice(1).includes('---');
}

/** Returns the memory's effective type: the nested `metadata.type` when present, else a top-level `type`. */
function effectiveType(fields: Record<string, unknown>): string | null {
  const metadata = fields.metadata;
  if (isRecord(metadata) && typeof metadata.type === 'string') {
    return metadata.type;
  }
  return typeof fields.type === 'string' ? fields.type : null;
}

/** Returns a top-level string frontmatter field, or `null` when absent or non-string. */
function stringField(fields: Record<string, unknown>, key: string): string | null {
  const value = fields[key];
  return typeof value === 'string' ? value : null;
}

/** Returns the origin session id from `metadata.originSessionId` or a top-level `originSessionId`, else `null`. */
function originSessionId(fields: Record<string, unknown>): string | null {
  const metadata = fields.metadata;
  if (isRecord(metadata) && typeof metadata.originSessionId === 'string') {
    return metadata.originSessionId;
  }
  return stringField(fields, 'originSessionId');
}

// endregion | Helpers
