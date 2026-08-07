import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { libraryResolver } from '../../src/lib/content-sources.ts';
import { isUnderTestDirectory } from '../../src/lib/fs-helpers.ts';
import { enumerateCatalogSlugs, listSkillDirectories } from '../../src/lib/library-catalog.ts';
import { resolveRulebook } from '../../src/lib/rulebook-deploy.ts';
import { readTargetHarnesses } from '../../src/lib/skill-deploy.ts';

// Shared guidance ships verbatim to `~/.agents/AGENTS.md` and is inlined into every harness guidance file, and neither
// path rewrites invocation tokens: a harness-neutral destination carries no sigil to render, so `{skill:<slug>}` is
// unavailable here and a skill must be named in prose. That leaves the name outside every parse gate the tokenized
// trees enjoy, which is how the guidance went on naming `git-commit-conventions` for as long as it did after that
// skill was renamed. A dead pointer is worse than none: an agent that follows one finds nothing, treats the lookup as
// satisfied, and falls back to its own defaults.
const CONTENT_ROOT = new URL('../', import.meta.url).pathname;
const SHARED_GUIDANCE_ROOT = path.join(CONTENT_ROOT, 'guidance', 'shared');
const SKILLS_ROOT = path.join(CONTENT_ROOT, 'skills');

// The two forms shared guidance uses to name a skill. Anchoring on the word "skill" rather than on a slug shape is
// what keeps `usage` and `payload` -- backticked identifiers in the naming and style sections -- out of the result.
const SKILL_REFERENCE_PATTERNS: ReadonlyArray<RegExp> = [
  /`([a-z][a-z0-9-]*)`\s+skill\b/g,
  /\bskill\s+`([a-z][a-z0-9-]*)`/g,
];

describe('shared guidance references', () => {
  it('names only skills that deploy to every harness', async () => {
    const deployed = new Set(await listDeployedSkillNames());
    const violations: Array<string> = [];

    for (const file of await listMarkdownFiles(SHARED_GUIDANCE_ROOT)) {
      const content = await readFile(file, 'utf8');
      for (const slug of collectSkillReferences(content)) {
        if (!deployed.has(slug)) {
          violations.push(`${path.relative(CONTENT_ROOT, file)} -> ${slug}`);
        }
      }
    }

    const message =
      'Shared guidance names a skill that does not deploy to every harness. An agent following the pointer finds ' +
      `nothing and falls back to its own defaults:\n  ${violations.join('\n  ')}`;
    expect(violations, message).toEqual([]);
  });

  // A `delivery: skill` rulebook deploys an invocable skill that lives in no `skills/` directory. The assertion above
  // only ever reports names it fails to find, so a rulebook half that returned nothing would leave it green.
  it('accepts a skill that a rulebook deploys', async () => {
    expect(await listDeployedSkillNames()).toContain('consult-shell-conventions');
  });

  // The harness filter is the whole of the "every harness" half of the contract, and every other assertion here would
  // pass without it. This pins an exclusion beside the inclusion above.
  it('excludes a skill that narrows itself to one harness', async () => {
    expect(await listDeployedSkillNames()).not.toContain('review-permissions');
  });

  // Every other assertion here is negative, so a detector that silently stopped matching would leave the suite green
  // and the guard gone. These pin each pattern against the reference that outlived its skill.
  describe('detection', () => {
    it.each([
      ['name before the word', 'Title: 72 chars max. Format per `git-commit-conventions` skill.'],
      ['name after the word', 'See the skill `git-commit-conventions` for the full format.'],
    ])('extracts a skill named with the %s', (_form, line) => {
      expect([...collectSkillReferences(line)]).toEqual(['git-commit-conventions']);
    });

    it('ignores a backticked identifier that names no skill', () => {
      const line = 'Name functions with a leading verb (`show_usage`, not `usage`; `build_payload`, not `payload`).';
      expect([...collectSkillReferences(line)]).toEqual([]);
    });
  });
});

// region | Helpers

/** Collects the distinct skill slugs `content` names, in no particular order. */
function collectSkillReferences(content: string): ReadonlySet<string> {
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

/**
 * Returns every skill name shared guidance may address: the catalog skills that reach all harnesses, plus the skills
 * that skill-delivery rulebooks deploy under.
 */
async function listDeployedSkillNames(): Promise<ReadonlyArray<string>> {
  const [catalog, fromRulebooks] = await Promise.all([listUniversalSkillSlugs(), listRulebookSkillNames()]);
  return [...catalog, ...fromRulebooks];
}

async function listMarkdownFiles(root: string): Promise<ReadonlyArray<string>> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .filter((file) => !isUnderTestDirectory(path.relative(root, file)));
}

/**
 * Returns the names that `delivery: skill` rulebooks deploy their skills under, read off the deploy path rather than
 * recomputed here. Rulebook frontmatter carries no `supported-harnesses:` field, so every such skill reaches all of them.
 */
async function listRulebookSkillNames(): Promise<ReadonlyArray<string>> {
  const resolver = libraryResolver(CONTENT_ROOT);
  const { rulebook: slugs = [] } = await enumerateCatalogSlugs(CONTENT_ROOT);
  const rulebooks = await Promise.all(slugs.map((slug) => resolveRulebook(slug, resolver)));
  return rulebooks.filter((rulebook) => rulebook.skill).map((rulebook) => rulebook.skillName);
}

/**
 * Returns the slugs of every catalog skill that reaches all harnesses: one whose frontmatter declares no `supported-harnesses:`
 * narrowing. Shared guidance serves every harness, so a skill only some of them receive is as dead a pointer there as
 * one that does not exist.
 */
async function listUniversalSkillSlugs(): Promise<ReadonlyArray<string>> {
  const catalogSlugs = await listSkillDirectories(SKILLS_ROOT);
  const universal: Array<string> = [];
  for (const slug of catalogSlugs) {
    const definition = await readFile(path.join(SKILLS_ROOT, slug, 'SKILL.md'), 'utf8');
    if (readTargetHarnesses(definition, slug) === undefined) {
      universal.push(slug);
    }
  }
  return universal;
}

// endregion | Helpers
