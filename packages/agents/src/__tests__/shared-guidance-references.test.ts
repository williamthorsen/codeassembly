import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { parseFrontmatter } from '../lib/frontmatter-merger.ts';
import { isRecord } from '../lib/type-guards.ts';

// Shared guidance ships verbatim to `~/.agents/AGENTS.md` and is inlined into every harness guidance file, and neither
// path rewrites invocation tokens: a harness-neutral destination carries no sigil to render, so `{skill:<slug>}` is
// unavailable here and a skill must be named in prose. That leaves the name outside every parse gate the tokenized
// trees enjoy, which is how the guidance went on naming `git-commit-conventions` for as long as it did after that
// skill was renamed. A dead pointer is worse than none: an agent that follows one finds nothing, treats the lookup as
// satisfied, and falls back to its own defaults.
const CONTENT_ROOT = new URL('../../content/', import.meta.url).pathname;
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
    const deployed = new Set(await listUniversalSkillSlugs());
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

async function listMarkdownFiles(root: string): Promise<ReadonlyArray<string>> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

/**
 * Returns the slugs of every skill that reaches all harnesses: a directory under `skills/` holding a `SKILL.md` whose
 * frontmatter declares no `harnesses:` narrowing. `_`-prefixed directories hold the shared `_data` and `_partials`
 * trees, and a directory with no `SKILL.md` holds a bundled helper; neither deploys a skill to invoke. Shared guidance
 * serves every harness, so a skill only some of them receive is as dead a pointer there as one that does not exist.
 */
async function listUniversalSkillSlugs(): Promise<ReadonlyArray<string>> {
  const entries = await readdir(SKILLS_ROOT, { withFileTypes: true });
  const slugs: Array<string> = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('_')) {
      continue;
    }
    const definition = await readSkillDefinition(path.join(SKILLS_ROOT, entry.name, 'SKILL.md'));
    if (definition !== undefined && !narrowsToSomeHarness(definition)) {
      slugs.push(entry.name);
    }
  }
  return slugs;
}

/** Reports whether a skill's frontmatter restricts it to a subset of harnesses. */
function narrowsToSomeHarness(definition: string): boolean {
  const { lines } = parseFrontmatter(definition);
  const parsed: unknown = parseYaml(lines.join('\n'));
  if (!isRecord(parsed) || parsed.harnesses === undefined || parsed.harnesses === null) {
    return false;
  }
  return !Array.isArray(parsed.harnesses) || parsed.harnesses.length > 0;
}

/** Reads a `SKILL.md`, reporting `undefined` when the directory holds no skill definition. */
async function readSkillDefinition(skillPath: string): Promise<string | undefined> {
  try {
    return await readFile(skillPath, 'utf8');
  } catch {
    return undefined;
  }
}

// endregion | Helpers
