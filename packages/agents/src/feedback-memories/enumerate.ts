import { readdir, readFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import { basename, join } from 'node:path';

import { readNoteContent } from '@codeassembly/kb/note-io';

import { isMissingFile, isRecord } from '../lib/type-guards.ts';
import { resolveRepoPath } from './resolve-repo-path.ts';
import type { EnumerateResult, FeedbackMemory, SkippedMemory } from './types.ts';

/**
 * Walks every `<projects-root>/<project>/memory/` directory and returns each memory whose effective type is `feedback`.
 * When `store` is set, enumeration is scoped to that one project store, so a machine with many memories can be worked
 * one store per invocation. Membership is decided by parsed frontmatter — `metadata.type` when nested, else a top-level
 * `type` — never by filename or a single-schema regex, so both the legacy and current memory schemas are enumerated. A
 * file that cannot be read as a note is reported in `skipped` rather than dropped. An absent projects root is the one
 * categorical failure; a `store` naming no directory under it is a `no-such-store` failure, so a mistyped slug fails
 * loudly rather than looking like a clean store; an absent per-store `memory/` directory is simply skipped.
 */
export async function enumerateFeedbackMemories(input: {
  projectsRoot: string;
  store?: string;
  machine?: string;
}): Promise<EnumerateResult> {
  const machine = input.machine ?? hostname();

  let stores: string[];
  try {
    const entries = await readdir(input.projectsRoot, { withFileTypes: true });
    stores = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch (error) {
    if (isMissingFile(error)) {
      return { ok: false, error: 'no-projects-root', message: `no projects root at ${input.projectsRoot}` };
    }
    throw error;
  }
  stores = stores.toSorted();

  if (input.store !== undefined) {
    if (!stores.includes(input.store)) {
      return { ok: false, error: 'no-such-store', message: `no store "${input.store}" under ${input.projectsRoot}` };
    }
    stores = [input.store];
  }

  const memories: FeedbackMemory[] = [];
  const skipped: SkippedMemory[] = [];

  for (const store of stores) {
    const memoryDir = join(input.projectsRoot, store, 'memory');
    const files = await listMemoryFiles(memoryDir);
    const memoryIndexPath = join(memoryDir, 'MEMORY.md');
    // Resolve the store's origin repo once — every memory in it shares the slug — and only when it has memories to route.
    const repoPath = files.length > 0 ? await resolveRepoPath(store) : null;

    for (const file of files) {
      const path = join(memoryDir, file);
      const record = await readMemory({ path, store, repoPath, machine, memoryIndexPath });
      if (record.kind === 'feedback') {
        memories.push(record.memory);
      } else if (record.kind === 'unreadable') {
        skipped.push({ path, reason: record.reason });
      }
      // record.kind === 'other' — a non-feedback memory — is intentionally omitted.
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
  store: string;
  repoPath: string | null;
  machine: string;
  memoryIndexPath: string;
}): Promise<{ kind: 'feedback'; memory: FeedbackMemory } | { kind: 'other' } | { kind: 'unreadable'; reason: string }> {
  const content = await readFile(input.path, 'utf8');
  const note = readNoteContent(content);
  if (note.error !== undefined) {
    // Surface a malformed memory (a frontmatter fence with unparseable YAML) so it is routed by hand rather than
    // dropped; a file with no frontmatter fence is not a memory at all — and a feedback memory always has frontmatter,
    // so omitting it never hides one.
    return hasFrontmatterFence(content) ? { kind: 'unreadable', reason: note.error } : { kind: 'other' };
  }
  if (effectiveType(note.fields) !== 'feedback') {
    return { kind: 'other' };
  }
  return {
    kind: 'feedback',
    memory: {
      path: input.path,
      store: input.store,
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

/** True when content opens with a `---` frontmatter fence and carries a closing fence — the shape every memory has. */
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
