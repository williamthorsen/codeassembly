import path from 'node:path';

import { ARTIFACT_TYPES } from './artifact-types.ts';
import type { ArtifactDependencies } from './dependency-frontmatter.ts';
import { listVisibleMarkdownFiles, listVisibleSubdirectories, readDirEntries } from './fs-helpers.ts';

/**
 * Enumerates the deployable content library as a per-type slug map (`{ rulebook, skill, subagent }`), computed from
 * the filesystem so a newly added artifact joins with no edit. Collections are never enumerated — they are
 * traversal-only nodes and "every collection" would be self-referential. The slugs are filesystem basenames (skill =
 * subdirectory name, rulebook/subagent = filename without `.md`), the form `artifactFrontmatterPath` maps back to a
 * file; the frontmatter `name` is deliberately not used. The result is the `ArtifactDependencies` edge shape, so the
 * resolver consumes it directly as a collection's expanded members.
 */
export async function enumerateLibrarySlugs(contentDir: string): Promise<ArtifactDependencies> {
  const [rulebook, skill, subagent] = await Promise.all([
    listMarkdownBasenames(path.join(contentDir, ARTIFACT_TYPES.rulebook.contentPath)),
    listSkillSlugs(path.join(contentDir, ARTIFACT_TYPES.skill.contentPath)),
    listMarkdownBasenames(path.join(contentDir, ARTIFACT_TYPES.subagent.contentPath)),
  ]);
  return { rulebook, skill, subagent };
}

// region | Helpers

/** Lists the basenames (without `.md`) of the visible markdown files directly in `dir`. */
async function listMarkdownBasenames(dir: string): Promise<Array<string>> {
  return (await listVisibleMarkdownFiles(dir)).map((file) => path.basename(file, '.md'));
}

/** Lists the visible skill subdirectory names in `skillsDir`, keeping only those that hold a `SKILL.md`. */
async function listSkillSlugs(skillsDir: string): Promise<Array<string>> {
  const slugs: Array<string> = [];
  for (const name of await listVisibleSubdirectories(skillsDir)) {
    const entries = await readDirEntries(path.join(skillsDir, name));
    if (entries.some((entry) => entry.isFile() && entry.name === 'SKILL.md')) {
      slugs.push(name);
    }
  }
  return slugs;
}

// endregion | Helpers
