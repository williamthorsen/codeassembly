import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describeError } from '@williamthorsen/toolbelt.errors';

import type { ContentDefect } from '../content-defects.ts';
import type { SourceResolver } from '../content-sources.ts';
import { listMarkdownFilesRecursively } from '../fs-helpers.ts';
import { enumerateCatalogSlugs } from '../library-catalog.ts';
import { resolveRulebook } from '../rulebook-deploy.ts';
import { resolveDeclaredSkill } from '../skill-deploy.ts';
import { type RuleContext, toRootRelative } from './rule-context.ts';

/**
 * The two forms in which shared guidance names a skill. Anchoring on the word "skill" rather than on a slug shape keeps
 * other backticked identifiers out of the result.
 */
const SKILL_REFERENCE_PATTERNS: ReadonlyArray<RegExp> = [
  /`([a-z][a-z0-9-]*)`\s+skill\b/g,
  /\bskill\s+`([a-z][a-z0-9-]*)`/g,
];

/**
 * Reports each skill named in prose by a file under `guidance/shared/` that does not deploy to every harness: one that
 * the root does not contain, or one whose `supported-harnesses:` narrows it. A name under which a
 * `delivery: skill` rulebook deploys passes, since rulebook frontmatter does not narrow harnesses.
 *
 * Shared guidance is inlined into every harness guidance file, a route that does not rewrite any invocation token, so
 * a skill is named in prose and no parse gate sees the name. An agent following a dead pointer finds nothing, treats
 * the lookup as satisfied, and falls back to its own defaults.
 */
export async function findSharedGuidanceReferenceDefects({
  root,
  resolver,
}: RuleContext): Promise<ReadonlyArray<ContentDefect>> {
  const defects: Array<ContentDefect> = [];
  let rulebookSkillNames: ReadonlySet<string> | undefined;

  const files = await listMarkdownFilesRecursively(path.join(root, 'guidance', 'shared'));
  for (const file of files) {
    const relativePath = toRootRelative(root, file);
    let body: string;
    try {
      body = await readFile(file, 'utf8');
    } catch (error: unknown) {
      defects.push({ file: relativePath, kind: 'reference', detail: describeError(error) });
      continue;
    }

    for (const [index, line] of body.split('\n').entries()) {
      for (const slug of collectSkillReferences(line)) {
        rulebookSkillNames ??= await listRulebookSkillNames(root, resolver);
        if (rulebookSkillNames.has(slug)) {
          continue;
        }
        const problem = await findSkillProblem(slug, resolver);
        if (problem !== undefined) {
          defects.push({
            file: relativePath,
            kind: 'reference',
            detail: `Line ${index + 1} names the skill \`${slug}\`, ${problem}. Shared guidance serves every harness.`,
          });
        }
      }
    }
  }
  return defects;
}

/** Collects the distinct skill slugs that `content` names, in no particular order. */
export function collectSkillReferences(content: string): ReadonlySet<string> {
  const slugs = new Set<string>();
  for (const pattern of SKILL_REFERENCE_PATTERNS) {
    for (const match of content.matchAll(pattern)) {
      const slug = match[1];
      if (slug !== undefined) {
        slugs.add(slug);
      }
    }
  }
  return slugs;
}

// region | Helpers

/** Describes why `slug` fails to deploy to every harness, or returns `undefined` when it does. */
async function findSkillProblem(slug: string, resolver: SourceResolver): Promise<string | undefined> {
  if ((await resolver.resolve('skill', slug)) === undefined) {
    return 'which the content root does not contain';
  }
  try {
    const skill = await resolveDeclaredSkill(slug, resolver);
    return skill.targetHarnesses === undefined
      ? undefined
      : `which deploys only to ${skill.targetHarnesses.join(', ')}`;
  } catch (error: unknown) {
    return `which cannot be resolved: ${describeError(error)}`;
  }
}

/**
 * Lists the names under which the root's `delivery: skill` rulebooks deploy. A rulebook that fails to resolve
 * contributes nothing; the resolution pass reports it.
 */
async function listRulebookSkillNames(root: string, resolver: SourceResolver): Promise<ReadonlySet<string>> {
  const { rulebook: slugs = [] } = await enumerateCatalogSlugs(root);
  const names = new Set<string>();
  for (const slug of slugs) {
    try {
      const rulebook = await resolveRulebook(slug, resolver);
      if (rulebook.skill) {
        names.add(rulebook.skillName);
      }
    } catch {
      continue;
    }
  }
  return names;
}

// endregion | Helpers
