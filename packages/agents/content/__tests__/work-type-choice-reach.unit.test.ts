import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { expandIncludes } from '../../src/lib/directive-expander.ts';
import { countOccurrences } from '../test-utils/count-occurrences.ts';
import { listMarkdownFiles } from '../test-utils/list-markdown-files.ts';

// An agent choosing a work type follows the test only when it is in context at that moment, so each carrier inlines
// it rather than linking to the taxonomy.
const CONTENT_ROOT = new URL('../', import.meta.url).pathname;

/** The one file permitted to state the test; every carrier reaches it through an include. */
const PARTIAL = '_partials/work-type-choice.md';

/** The test's opening, which the single-statement counts key on. */
const RULE_HEADLINE = 'Whom a change affects decides its type';

/** Phrases that must survive an edit to the partial, so a gutted test cannot still pass on its opening alone. */
const RULE_PHRASES: ReadonlyArray<string> = [
  RULE_HEADLINE,
  'Never infer a type from how earlier changes were typed',
  'Repo-agnostic guidance is source code',
  'Guidance on working in one repository is `ai`',
  'Guidance to agents is never `docs`',
];

// Listed explicitly rather than discovered: the failure guarded against is a carrier dropping off the list, and a
// discovered list would move with the bug. `orchestrated-coder` reads the test through its `commit-conventions`
// injection, so it carries none directly.
const CARRIERS: ReadonlyArray<string> = [
  'guidance/rulebooks/commit-conventions.md',
  'skills/create-commit/SKILL.md',
  'skills/create-ticket/SKILL.md',
  'skills/merge-pr/SKILL.md',
  'skills/summarize-change/SKILL.md',
];

describe('work-type-choice reach', () => {
  describe.each(CARRIERS)('%s', (relativePath) => {
    it('inlines the test', async () => {
      const expanded = await expandCarrier(relativePath);
      for (const phrase of RULE_PHRASES) {
        expect(expanded).toContain(phrase);
      }
    });

    it('inlines the test exactly once', async () => {
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
    const message = `The test is stated once and inlined from there; these files restate it instead of including it:\n  ${violations.join('\n  ')}`;
    expect(violations, message).toEqual([]);
  });
});

// region | Helpers

/** Returns a carrier's include-expanded body, what the install pipeline goes on to rewrite and write out. */
async function expandCarrier(relativePath: string): Promise<string> {
  return expandIncludes(path.join(CONTENT_ROOT, relativePath), CONTENT_ROOT);
}

// endregion | Helpers
