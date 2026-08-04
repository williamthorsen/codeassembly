import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

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
  it('names only skills that exist', async () => {
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
 * Returns the slugs of every skill that deploys to all harnesses. `_`-prefixed directories are excluded, which drops
 * the shared `_data` tree and the per-harness skills under `_harnesses/`: shared guidance serves every harness, so a
 * skill only one of them receives is as dead a pointer there as one that does not exist.
 */
async function listUniversalSkillSlugs(): Promise<ReadonlyArray<string>> {
  const entries = await readdir(SKILLS_ROOT, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith('_')).map((entry) => entry.name);
}

// endregion | Helpers
