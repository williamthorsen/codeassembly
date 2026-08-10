import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { readInjectedSkills } from '../../src/lib/dependency-frontmatter.ts';
import { expandIncludes } from '../../src/lib/directive-expander.ts';
import { countOccurrences } from '../test-utils/count-occurrences.ts';
import { listMarkdownFiles } from '../test-utils/list-markdown-files.ts';

// Two mechanisms put the doctrine into an agent's context, and both are checked here: a skill inlines it at install
// time, and a subagent receives it through the skills named in its `skills:` frontmatter. So a subagent needs no body
// edit, only an injected carrier — and that injection list is a frontmatter array an edit can trim with no other test
// failing.
const CONTENT_ROOT = new URL('../', import.meta.url).pathname;
const SKILLS_ROOT = path.join(CONTENT_ROOT, 'skills');
const SUBAGENTS_ROOT = path.join(CONTENT_ROOT, 'subagents');

const DOCTRINE_HEADING = '## Comment discipline';

/** Phrases that must survive an edit to the partial, so a gutted doctrine cannot still pass the heading check. */
const DOCTRINE_RULES: ReadonlyArray<string> = [
  "A comment drafted for someone else's file is a source comment and takes the same audit.",
  '**1. The stranger test',
  '**2. The deletion test',
  '**3. The one-location test',
  '_future readers should note_',
  'never as it was, as it might have been, or as it is not',
];

/** The skills that inline the doctrine. Each writes comments, judges them, or proposes their text. */
const CARRIER_SKILLS: ReadonlyArray<string> = [
  'implement-plan',
  'respond-to-review',
  'review-criteria',
  'revise-comments',
  'testing-conventions',
];

// Listed explicitly rather than discovered: the failure guarded against is a subagent dropping off the list, and a
// discovered list would move with the bug.
const COMMENT_AUTHORING_SUBAGENTS: ReadonlyArray<string> = [
  'aspect-code-reviewer',
  'aspect-silent-failure-reviewer',
  'aspect-test-reviewer',
  'code-simplification-reviewer',
  'orchestrated-coder',
  'orchestrated-reviewer',
];

/** Paths no content file may name: a reference to one is a consumer pointing at the doctrine instead of carrying it. */
const RETIRED_REFERENCES: ReadonlyArray<string> = ['_data/comment-discipline.md', 'comment-audit-checklist'];

describe('comment-discipline reach', () => {
  describe.each(CARRIER_SKILLS)('%s', (slug) => {
    it('inlines the doctrine', async () => {
      const expanded = await expandSkill(slug);
      expect(expanded).toContain(DOCTRINE_HEADING);
      for (const rule of DOCTRINE_RULES) {
        expect(expanded).toContain(rule);
      }
    });

    it('inlines the doctrine exactly once', async () => {
      const expanded = await expandSkill(slug);
      expect(countOccurrences(expanded, DOCTRINE_HEADING)).toBe(1);
    });
  });

  it.each(COMMENT_AUTHORING_SUBAGENTS)('%s injects a skill carrying the doctrine', async (slug) => {
    const content = await readFile(path.join(SUBAGENTS_ROOT, `${slug}.md`), 'utf8');
    const injected = readInjectedSkills(content, `${slug}.md`);
    const carriers = injected.filter((skill) => CARRIER_SKILLS.includes(skill));

    const message = `${slug} writes or judges comments but injects no skill carrying the doctrine; injected: [${injected.join(', ')}]`;
    expect(carriers.length, message).toBeGreaterThan(0);
  });

  it('no content file reaches the doctrine by reference', async () => {
    const violations: Array<string> = [];
    const files = await listMarkdownFiles(CONTENT_ROOT);
    for (const file of files) {
      const content = await readFile(file, 'utf8');
      for (const reference of RETIRED_REFERENCES) {
        if (content.includes(reference)) {
          violations.push(`${path.relative(CONTENT_ROOT, file)} -> ${reference}`);
        }
      }
    }
    const message = `The doctrine is inlined now; these files must carry it or anchor to it, not point at it:\n  ${violations.join('\n  ')}`;
    expect(violations, message).toEqual([]);
  });
});

/** Returns a skill's include-expanded `SKILL.md` — the body the install pipeline goes on to rewrite and write out. */
async function expandSkill(slug: string): Promise<string> {
  return expandIncludes(path.join(SKILLS_ROOT, slug, 'SKILL.md'), CONTENT_ROOT);
}
