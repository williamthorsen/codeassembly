import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { expandIncludes } from '../../src/lib/directive-expander.ts';
import { countOccurrences } from '../test-utils/count-occurrences.ts';
import { listMarkdownFiles } from '../test-utils/list-markdown-files.ts';

// Bitbucket Cloud reads a 2-space nested item as a sibling and reports nothing, so the rule binds only where it is
// already in context as a body is composed. Each carrier inlines it rather than linking to it, for the reason the
// `_partials` README gives: a runtime link is an optional read, and the model fills from its prior instead.
const CONTENT_ROOT = new URL('../', import.meta.url).pathname;

/** The one file permitted to state the rule; every carrier reaches it through an include. */
const PARTIAL = 'skills/_partials/nested-list-indent.md';

/** The rule's opening, which the single-statement counts key on. */
const RULE_HEADLINE = 'Indent a nested list item 4 spaces';

/** Phrases that must survive an edit to the partial, so a gutted rule cannot still pass on its opening alone. */
const RULE_PHRASES: ReadonlyArray<string> = [
  RULE_HEADLINE,
  'the only way to notice is to view the published text',
  'the formatter in use sets the indent',
];

// Listed explicitly rather than discovered: the failure guarded against is a carrier dropping off the list, and a
// discovered list would move with the bug.
//
// A place here goes to a step that composes a body Bitbucket will render, plus the data entry both Bitbucket
// delegates read. Branch commit bodies are absent by decision: Bitbucket renders a commit message too, but a squash
// merge discards the branch's own commits, so the commit body that reaches the default branch is the merge body
// `merge-pr` composes. The delegates are absent because they submit a body rather than compose one.
const CARRIERS: ReadonlyArray<string> = [
  'skills/_data/bitbucket-pr-access.md',
  'skills/merge-pr/SKILL.md',
  'skills/summarize-change/SKILL.md',
];

describe('nested-list-indent reach', () => {
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

/** Returns a carrier's include-expanded body, what the install pipeline goes on to rewrite and write out. */
async function expandCarrier(relativePath: string): Promise<string> {
  return expandIncludes(path.join(CONTENT_ROOT, relativePath), CONTENT_ROOT);
}

// endregion | Helpers
