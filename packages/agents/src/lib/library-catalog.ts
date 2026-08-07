import { stat } from 'node:fs/promises';
import path from 'node:path';

import { ARTIFACT_TYPES } from './artifact-types.ts';
import type { ArtifactDependencies } from './dependency-frontmatter.ts';
import { isTestDirectory, listVisibleMarkdownFiles, listVisibleSubdirectories, readDirEntries } from './fs-helpers.ts';
import { isMissingFile } from './type-guards.ts';

/**
 * The `skills/` entries that are never support content: `_partials` is an install-time include target inlined into the
 * skills that include it, and `_harnesses` is a retired deploy path whose skills now live in the flat catalog.
 */
const NON_SUPPORT_ENTRIES: ReadonlySet<string> = new Set(['_harnesses', '_partials']);

/**
 * Enumerates a content root's deployable artifacts as a per-type slug map (`{ rulebook, skill, subagent }`), computed
 * from the filesystem so a newly added artifact joins with no edit. The root is whichever directory the caller passes —
 * the built-in library, or a declared source for a source-scoped collection. Collections are never enumerated — they are
 * traversal-only nodes and "every collection" would be self-referential. The slugs are filesystem basenames (skill =
 * subdirectory name, rulebook/subagent = filename without `.md`), the form `artifactFrontmatterPath` maps back to a
 * file; the frontmatter `name` is deliberately not used. The result is the `ArtifactDependencies` edge shape, so the
 * resolver consumes it directly as a collection's expanded members.
 */
export async function enumerateCatalogSlugs(contentDir: string): Promise<ArtifactDependencies> {
  const [rulebook, skill, subagent] = await Promise.all([
    listMarkdownBasenames(path.join(contentDir, ARTIFACT_TYPES.rulebook.contentPath)),
    listSkillDirectories(path.join(contentDir, ARTIFACT_TYPES.skill.contentPath)),
    listMarkdownBasenames(path.join(contentDir, ARTIFACT_TYPES.subagent.contentPath)),
  ]);
  return { rulebook, skill, subagent };
}

/**
 * Reports whether `entryDir` is a skill directory — one holding a `SKILL.md` file. This is the single definition every
 * caller shares: the catalog walk that enumerates skills, the installer deciding what to leave to `sync`, and
 * `validate` deciding what is a skill rather than support content. A private copy in any of them is how those three
 * come to disagree, which is a defect no test of one of them can catch.
 *
 * `SKILL.md` must be a file. A directory of that name is not a skill, and treating it as one would send the installer
 * to read a body that does not exist. The probe follows symlinks, so a `SKILL.md` symlinked to a real file counts.
 *
 * A regular file directly under `skills/` fails the probe with `ENOTDIR` rather than `ENOENT`; both mean "no skill
 * here", which is the pair `isMissingFile` covers.
 */
export async function isSkillDirectory(entryDir: string): Promise<boolean> {
  try {
    return (await stat(path.join(entryDir, 'SKILL.md'))).isFile();
  } catch (error: unknown) {
    if (isMissingFile(error)) {
      return false;
    }
    throw error;
  }
}

/**
 * Lists the visible subdirectories of `skillsDir` that are skill directories. Visibility is what separates this from
 * `isSkillDirectory` alone: a `_`-prefixed directory is support content even when it holds a `SKILL.md`, so it never
 * enters the catalog.
 */
export async function listSkillDirectories(skillsDir: string): Promise<Array<string>> {
  const names: Array<string> = [];
  for (const name of await listVisibleSubdirectories(skillsDir)) {
    if (await isSkillDirectory(path.join(skillsDir, name))) {
      names.push(name);
    }
  }
  return names;
}

/**
 * Lists the entries directly under `skillsDir` that install unconditionally alongside skills, sorted. Support content
 * is everything left once the reserved entries, test directories, dotfiles, and skill directories are removed —
 * `skills/_data/` being the case that motivates it, since it carries no `SKILL.md` and so appears in no catalog walk.
 *
 * A `_`-prefixed name is support content rather than hidden, which is why the visibility rule the catalog walk applies
 * is absent here; `__tests__` shares that prefix without sharing that standing, so it is excluded by name.
 *
 * Shared by the installer, which deploys these, and by `validate`, which checks them. The rule decides what ships, so
 * the two must not each carry their own copy of it.
 */
export async function listSupportEntries(skillsDir: string): Promise<Array<string>> {
  const candidates = (await readDirEntries(skillsDir))
    .map((entry) => entry.name)
    .filter((name) => !NON_SUPPORT_ENTRIES.has(name) && !isTestDirectory(name) && !name.startsWith('.'))
    .toSorted();

  const support: Array<string> = [];
  for (const name of candidates) {
    if (!(await isSkillDirectory(path.join(skillsDir, name)))) {
      support.push(name);
    }
  }
  return support;
}

// region | Helpers

/** Lists the basenames (without `.md`) of the visible markdown files directly in `dir`. */
async function listMarkdownBasenames(dir: string): Promise<Array<string>> {
  return (await listVisibleMarkdownFiles(dir)).map((file) => path.basename(file, '.md'));
}

// endregion | Helpers
