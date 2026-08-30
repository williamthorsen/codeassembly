/**
 * What `sync` recognizes as its own on disk: the provenance markers it stamps, and the scans that recover the owned
 * skills and subagents under a harness's deployed trees. Every scan reads a marker and nothing else, which is what
 * keeps a hand-authored artifact from being claimed for deletion.
 */

import type { Dirent } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { makeArtifactMarker } from '../../lib/artifact-marker.ts';
import { extractRulebookSkillSlug } from '../../lib/rulebook-skill.ts';
import { isEnoent, isMissingFile } from '../../lib/type-guards.ts';

export const skillMarker = makeArtifactMarker('skill');
export const subagentMarker = makeArtifactMarker('subagent');

/**
 * Lists the declared skills sync owns under `skillsDir` as `{ dir, slug }` pairs — those whose `SKILL.md` carries the
 * declared-skill marker, paired with the slug recovered from it. Reads only the declared-skill marker, so it never
 * claims a rulebook-skill dir or a hand-authored skill. Returns an empty list when the directory is absent; entries
 * without a readable `SKILL.md` are skipped.
 */
export async function listOwnedDeclaredSkills(
  skillsDir: string,
): Promise<ReadonlyArray<{ dir: string; slug: string }>> {
  let entries: ReadonlyArray<string>;
  try {
    entries = await readdir(skillsDir);
  } catch (error: unknown) {
    if (isEnoent(error)) {
      return [];
    }
    throw error;
  }

  const owned: Array<{ dir: string; slug: string }> = [];
  for (const entry of entries) {
    let content: string;
    try {
      content = await readFile(path.join(skillsDir, entry, 'SKILL.md'), 'utf8');
    } catch (error: unknown) {
      if (isMissingFile(error)) {
        continue;
      }
      throw error;
    }
    const slug = skillMarker.extractSlug(content);
    if (slug !== undefined) {
      owned.push({ dir: entry, slug });
    }
  }
  return owned;
}

/**
 * Lists the sync-owned skills under `skillsDir` as `{ dir, slug }` pairs — those whose `SKILL.md` carries the
 * rulebook provenance marker, paired with the slug recovered from it. The directory locates the skill on disk;
 * the slug is its stable identity, which the directory may no longer match. Returns an empty list when the
 * directory is absent. Entries without a readable `SKILL.md` (a marker-less hand-authored skill, a stray
 * `.DS_Store`) are skipped, never claimed for deletion.
 */
export async function listOwnedSkills(skillsDir: string): Promise<ReadonlyArray<{ dir: string; slug: string }>> {
  let entries: ReadonlyArray<string>;
  try {
    entries = await readdir(skillsDir);
  } catch (error: unknown) {
    if (isEnoent(error)) {
      return [];
    }
    throw error;
  }

  const owned: Array<{ dir: string; slug: string }> = [];
  for (const entry of entries) {
    let content: string;
    try {
      content = await readFile(path.join(skillsDir, entry, 'SKILL.md'), 'utf8');
    } catch (error: unknown) {
      // Not a skill dir: the SKILL.md is absent, or the entry is a regular file (ENOTDIR on read-through).
      if (isMissingFile(error)) {
        continue;
      }
      throw error;
    }
    const slug = extractRulebookSkillSlug(content);
    if (slug !== undefined) {
      owned.push({ dir: entry, slug });
    }
  }
  return owned;
}

/**
 * Lists the sync-owned subagents under `subagentsDir` as `{ file, slug }` pairs — the flat `.md` files whose content
 * carries the `codeassembly-subagent:` ownership marker, paired with the slug recovered from it. Reads only that
 * marker, so a marker-less hand-authored file is never claimed. Returns an empty list when the directory is absent;
 * non-`.md` entries and directories are skipped.
 */
export async function listOwnedSubagents(subagentsDir: string): Promise<ReadonlyArray<{ file: string; slug: string }>> {
  let entries: ReadonlyArray<Dirent>;
  try {
    entries = await readdir(subagentsDir, { withFileTypes: true });
  } catch (error: unknown) {
    if (isEnoent(error)) {
      return [];
    }
    throw error;
  }

  const owned: Array<{ file: string; slug: string }> = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) {
      continue;
    }
    let content: string;
    try {
      content = await readFile(path.join(subagentsDir, entry.name), 'utf8');
    } catch (error: unknown) {
      // A `.md` symlink whose target is gone passes the `isFile()` filter (it follows links) but throws on read.
      if (isEnoent(error)) {
        continue;
      }
      throw error;
    }
    const slug = subagentMarker.extractSlug(content);
    if (slug !== undefined) {
      owned.push({ file: entry.name, slug });
    }
  }
  return owned;
}
