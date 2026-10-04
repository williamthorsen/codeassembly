import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { CONTENT_ROOT } from '../test-utils/content-root.ts';
import { countOccurrences } from '../test-utils/count-occurrences.ts';
import { listMarkdownFiles } from '../test-utils/list-markdown-files.ts';
import { readContentFile } from '../test-utils/read-content-file.ts';

// Two mechanisms put the doctrine into an agent's context, and both are checked here: A skill inlines it at install
// time, and a subagent receives it through the skills named in its `skills:` frontmatter. So a subagent does not
// need a body edit, only an injected carrier; that injection list is a frontmatter array that an edit can trim
// without any other test failing.

const DOCTRINE_HEADING = '## Comment discipline';

/** Phrases that must survive an edit to the partial, so that a gutted doctrine cannot still pass the heading check. */
const DOCTRINE_RULES: ReadonlyArray<string> = [
  "A comment drafted for someone else's file is a source comment",
  '**1. The stranger test',
  '**2. The deletion test',
  '**3. The one-location test',
  '**4. The derivation test',
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

/**
 * Paths that a content file may not name: A reference to one is a consumer pointing at the doctrine instead of inlining
 * it.
 */
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

  it('content files do not reach the doctrine by reference', async () => {
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
    const message = `The doctrine is inlined now; these files must inline it or anchor to it, not point at it:\n  ${violations.join('\n  ')}`;
    expect(violations, message).toEqual([]);
  });
});

/**
 * Returns a skill's include-expanded `SKILL.md`, the body that the install pipeline goes on to rewrite and write out.
 */
async function expandSkill(slug: string): Promise<string> {
  return readContentFile(`skills/${slug}/SKILL.md`);
}
