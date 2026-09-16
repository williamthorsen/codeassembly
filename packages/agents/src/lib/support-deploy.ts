import type { Dirent } from 'node:fs';
import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';

import { ARTIFACT_TYPES } from './artifact-types.ts';
import { listSupportEntries } from './library-catalog.ts';
import { writeRenderedTree } from './rendered-tree.ts';
import { type RenderedSkillEntry, renderSupportEntry, type SkillDeployContext } from './skill-transform.ts';
import { isEnoent } from './type-guards.ts';

/**
 * Renders every skill support entry that a source ships, flattened into one tree keyed relative to that source's
 * namespace directory. What counts as a support entry and how one renders both come from the helpers already shared
 * by `install` and `validate`, so the pass that ships these cannot disagree with the passes that check them.
 *
 * A source shipping no `skills/` directory renders to nothing, which is the ordinary case: most sources ship skills
 * and subagents alone. That is deliberately not an error, unlike the library's own missing `skills/`, whose absence
 * leaves every skill without the reference files that it reads at runtime.
 */
export async function renderSourceSupport(
  sourceDir: string,
  context: SkillDeployContext,
): Promise<ReadonlyArray<RenderedSkillEntry>> {
  const skillsDir = path.join(sourceDir, ARTIFACT_TYPES.skill.contentPath);
  const rendered: Array<RenderedSkillEntry> = [];

  const supportEntries = await listSupportEntries(skillsDir);
  for (const name of supportEntries) {
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
 * Delivers one source's rendered support entries into `destDir`, that source's own namespace under the harness skills
 * dir. Entries that the source no longer contains are pruned, so the delivered tree tracks the source exactly, and a
 * source containing none leaves no directory behind.
 */
export async function deploySourceSupport(destDir: string, entries: ReadonlyArray<RenderedSkillEntry>): Promise<void> {
  await (entries.length === 0 ? rm(destDir, { recursive: true, force: true }) : writeRenderedTree(destDir, entries));
}

/**
 * Removes the namespace directories under `sourcesRoot` that no declared source claims, then the root itself once it
 * holds nothing, so that dropping a source retracts what it delivered.
 *
 * Source names may contain a `/` when a scoped package nests as its own segments; a directory on the way to a
 * surviving name is kept and descended rather than removed. A missing root is a no-op.
 *
 * Runs after delivery rather than before it, unlike the skill and subagent passes: Source names are unique within a
 * run, so no name is freed for another to claim, and running last lets a source that dropped its final support entry
 * leave the root empty and have it retired in the same pass.
 */
export async function retractUndeclaredSourceSupport(
  sourcesRoot: string,
  outcome: SourceSupportOutcome,
): Promise<void> {
  const targets = await listUndeclaredSourceSupport(sourcesRoot, outcome);
  for (const target of targets) {
    await rm(target, { recursive: true, force: true });
  }
}

/**
 * What delivery leaves behind, which decides what is left for retraction to remove. `surviving` names the sources that
 * will hold content afterwards, `emptied` those whose namespace delivery removes because they render nothing.
 */
export interface SourceSupportOutcome {
  readonly surviving: ReadonlyArray<string>;
  readonly emptied: ReadonlyArray<string>;
}

/**
 * Lists the paths under `sourcesRoot` that no source claims once delivery has run: a namespace left by a dropped
 * source, a scope directory holding no surviving package, and the root itself once nothing under it survives, in
 * which case removing the root is the whole retraction and the paths beneath it are left implicit.
 *
 * Judged against the tree that delivery will leave rather than the one on disk, so a name that delivery is about to
 * create counts as present and one that it is about to empty does not. Evaluating the on-disk tree instead would let
 * a preview name a retraction that the run does not perform, which is how a renamed source reads as the whole root
 * being dropped.
 *
 * A missing root claims nothing.
 */
export async function listUndeclaredSourceSupport(
  sourcesRoot: string,
  outcome: SourceSupportOutcome,
): Promise<ReadonlyArray<string>> {
  const undeclared: Array<string> = [];
  const present = await collectUndeclared(sourcesRoot, '', outcome, undeclared);
  if (present === 'missing') {
    return [];
  }
  return present === 'retained' ? undeclared : [sourcesRoot];
}

// region | Helpers

/**
 * Walks one level under `sourcesRoot`, accumulating what no surviving source claims and recursing into any directory
 * that leads to one. Reports whether the level is absent, holds something a source claims, or survives holding
 * nothing. The last of these lets a caller retire a scope directory emptied by its final package.
 *
 * A level counts as retained when a surviving name is at or under it, whether or not that name is on disk yet, so
 * the answer describes the tree after delivery rather than before it.
 */
async function collectUndeclared(
  sourcesRoot: string,
  relDir: string,
  outcome: SourceSupportOutcome,
  undeclared: Array<string>,
): Promise<'missing' | 'retained' | 'empty'> {
  let entries: ReadonlyArray<Dirent>;
  try {
    entries = await readdir(path.join(sourcesRoot, relDir), { withFileTypes: true });
  } catch (error: unknown) {
    if (isEnoent(error)) {
      return 'missing';
    }
    throw error;
  }

  let retained = deliversUnder(relDir, outcome.surviving);
  for (const entry of entries) {
    const rel = relDir === '' ? entry.name : `${relDir}/${entry.name}`;
    if (outcome.surviving.includes(rel)) {
      // The delivery pass owns everything inside a surviving source's directory, pruning it against the source itself.
      retained = true;
      continue;
    }
    if (outcome.emptied.includes(rel)) {
      // Delivery removes this one; retraction neither keeps it nor claims the removal.
      continue;
    }
    if (entry.isDirectory() && outcome.surviving.some((name) => name.startsWith(`${rel}/`))) {
      // Collected apart so that a directory that keeps nothing is named on its own, rather than alongside the
      // entries that removing it already covers.
      const nested: Array<string> = [];
      const state = await collectUndeclared(sourcesRoot, rel, outcome, nested);
      if (state === 'retained') {
        retained = true;
        undeclared.push(...nested);
      } else if (state === 'empty') {
        undeclared.push(path.join(sourcesRoot, rel));
      }
      continue;
    }
    undeclared.push(path.join(sourcesRoot, rel));
  }
  return retained ? 'retained' : 'empty';
}

/** Reports whether any surviving source's namespace is at or under `relDir`, the root being under itself. */
function deliversUnder(relDir: string, surviving: ReadonlyArray<string>): boolean {
  return relDir === ''
    ? surviving.length > 0
    : surviving.some((name) => name === relDir || name.startsWith(`${relDir}/`));
}

// endregion | Helpers
