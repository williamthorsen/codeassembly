import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { expandIncludes } from '../../src/lib/directive-expander.ts';
import { countOccurrences } from '../test-utils/count-occurrences.ts';
import { listMarkdownFiles } from '../test-utils/list-markdown-files.ts';

// The rule binds only when it is already in context at the moment prose is composed, so each carrier inlines it rather
// than linking to it. Two of the carriers held hand-written variants that drifted apart, which is what the
// single-statement assertion below exists to prevent from recurring.
const CONTENT_ROOT = new URL('../', import.meta.url).pathname;

/** The one file permitted to state the rule; every carrier reaches it through an include. */
const PARTIAL = '_partials/prose-line-breaks.md';

/** The rule's opening, which the single-statement counts key on. */
const RULE_HEADLINE = 'No hard line breaks';

/** Phrases that must survive an edit to the partial, so a gutted rule cannot still pass on its opening alone. */
const RULE_PHRASES: ReadonlyArray<string> = [
  RULE_HEADLINE,
  'Do not insert newlines to wrap at a column width',
  "the project's formatter decides instead",
];

// Listed explicitly rather than discovered: the failure guarded against is a carrier dropping off the list, and a
// discovered list would move with the bug.
//
// Delivery is narrower than governance. The partial governs any generated Markdown, saved artifacts included, but a
// place here is earned by being in context as prose is composed for somewhere outside the repository: a commit body,
// or a GitHub issue, pull request, or comment. A body that composes only into a local artifact is absent by decision,
// not by oversight, and one that passes along prose someone else composed belongs with that composer instead.
const CARRIERS: ReadonlyArray<string> = [
  'guidance/rulebooks/commit-conventions.md',
  'skills/create-commit/SKILL.md',
  'skills/create-ticket/SKILL.md',
  'skills/design-and-plan/SKILL.md',
  'skills/refine-plan/SKILL.md',
  'skills/summarize-change/SKILL.md',
  'skills/wrap-up/SKILL.md',
  'subagents/orchestrated-coder.md',
];

describe('prose-line-breaks reach', () => {
  describe.each(CARRIERS)('%s', (relativePath) => {
    it('inlines the rule', async () => {
      const expanded = await expandCarrier(relativePath);
      for (const phrase of RULE_PHRASES) {
        expect(expanded).toContain(phrase);
      }
    });

    it('inlines the rule exactly once', async () => {
      const expanded = await expandCarrier(relativePath);
      expect(countOccurrences(expanded, RULE_HEADLINE)).toBe(1);
    });
  });

  it('is stated in no content file but the partial', async () => {
    const violations: Array<string> = [];
    const files = await listMarkdownFiles(CONTENT_ROOT);
    for (const file of files) {
      const relativePath = path.relative(CONTENT_ROOT, file);
      if (relativePath === PARTIAL) continue;

      const content = await readFile(file, 'utf8');
      for (const phrase of RULE_PHRASES) {
        if (content.includes(phrase)) {
          violations.push(`${relativePath} -> ${phrase}`);
        }
      }
    }
    const message = `The rule is stated once and inlined from there; these files restate it instead of including it:\n  ${violations.join('\n  ')}`;
    expect(violations, message).toEqual([]);
  });
});

// region | Helpers

/** Returns a carrier's include-expanded body — what the install pipeline goes on to rewrite and write out. */
async function expandCarrier(relativePath: string): Promise<string> {
  return expandIncludes(path.join(CONTENT_ROOT, relativePath), CONTENT_ROOT);
}

// endregion | Helpers
