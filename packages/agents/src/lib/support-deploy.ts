import type { Dirent } from 'node:fs';
import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';

import { ARTIFACT_TYPES } from './artifact-types.ts';
import { listSupportEntries } from './library-catalog.ts';
import { writeRenderedTree } from './rendered-tree.ts';
import { type RenderedSkillEntry, renderSupportEntry, type SkillDeployContext } from './skill-transform.ts';
import { isEnoent } from './type-guards.ts';

/**
 * Renders every skill support entry a source ships, flattened into one tree keyed relative to that source's namespace
 * directory. What counts as a support entry and how one renders both come from the helpers `install` and `validate`
 * already share, so the pass that ships these cannot disagree with the passes that check them.
 *
 * A source shipping no `skills/` directory renders to nothing, which is the ordinary case: most sources ship skills
 * and subagents alone. That is deliberately not an error, unlike the library's own missing `skills/`, whose absence
 * costs every skill the reference files it reads at runtime.
 */
export async function renderSourceSupport(
  sourceDir: string,
  context: SkillDeployContext,
): Promise<ReadonlyArray<RenderedSkillEntry>> {
  const skillsDir = path.join(sourceDir, ARTIFACT_TYPES.skill.contentPath);
  const rendered: Array<RenderedSkillEntry> = [];

  for (const name of await listSupportEntries(skillsDir)) {
    const srcPath = path.join(skillsDir, name);
    const entry = await renderSupportEntry(srcPath, name, sourceDir, context);
    switch (entry.kind) {
      case 'directory':
        for (const file of entry.entries) {
          rendered.push({ ...file, relPath: `${name}/${file.relPath}` });
        }
        break;
      case 'markdown':
        rendered.push({ kind: 'markdown', relPath: name, content: entry.content });
        break;
      case 'verbatim':
        rendered.push({ kind: 'asset', relPath: name, srcPath });
        break;
    }
  }
  return rendered;
}

/**
 * Delivers one source's support entries into `destDir`, which is that source's own namespace under the harness skills
 * dir. Entries the source no longer carries are pruned, so the delivered tree tracks the source exactly.
 */
export async function deploySourceSupport(
  sourceDir: string,
  destDir: string,
  context: SkillDeployContext,
): Promise<void> {
  const entries = await renderSourceSupport(sourceDir, context);
  if (entries.length === 0) {
    // Nothing to deliver, and nothing should be left behind either: a source that dropped its last support entry
    // retracts the directory rather than leaving an empty one.
    await rm(destDir, { recursive: true, force: true });
    return;
  }
  await writeRenderedTree(destDir, entries);
}

/**
 * Removes the namespace directories under `sourcesRoot` that no declared source claims, then the root itself once it
 * holds nothing, so dropping a source retracts what it delivered.
 *
 * `declaredNames` are source names, which may carry a `/` when a scoped package nests as its own segments; a directory
 * on the way to a declared name is kept and descended rather than removed. A missing root is a no-op.
 *
 * Runs after delivery rather than before it, unlike the skill and subagent passes: source names are unique within a
 * run, so no name is freed for another to claim, and running last is what lets a source that dropped its final support
 * entry leave the root empty and have it retired in the same pass.
 */
export async function retractUndeclaredSourceSupport(
  sourcesRoot: string,
  declaredNames: ReadonlyArray<string>,
): Promise<void> {
  const retained = await retractUnder(sourcesRoot, '', declaredNames);
  if (!retained) {
    await rm(sourcesRoot, { recursive: true, force: true });
  }
}

// region | Helpers

/**
 * Prunes one level under `sourcesRoot`, recursing into any directory that leads to a declared name, and reports
 * whether anything survived, so a caller can retire a level left empty.
 */
async function retractUnder(
  sourcesRoot: string,
  relDir: string,
  declaredNames: ReadonlyArray<string>,
): Promise<boolean> {
  let entries: ReadonlyArray<Dirent>;
  try {
    entries = await readdir(path.join(sourcesRoot, relDir), { withFileTypes: true });
  } catch (error: unknown) {
    if (isEnoent(error)) {
      return false;
    }
    throw error;
  }

  let retained = false;
  for (const entry of entries) {
    const rel = relDir === '' ? entry.name : `${relDir}/${entry.name}`;
    if (declaredNames.includes(rel)) {
      // The delivery pass owns everything inside a declared source's directory, pruning it against the source itself.
      retained = true;
      continue;
    }
    if (entry.isDirectory() && declaredNames.some((name) => name.startsWith(`${rel}/`))) {
      retained = (await retractUnder(sourcesRoot, rel, declaredNames)) || retained;
      continue;
    }
    await rm(path.join(sourcesRoot, rel), { recursive: true, force: true });
  }
  return retained;
}

// endregion | Helpers
