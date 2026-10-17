import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { CONTENT_ROOT } from '../test-utils/content-root.ts';
import { countOccurrences } from '../test-utils/count-occurrences.ts';
import { listMarkdownFiles } from '../test-utils/list-markdown-files.ts';
import { readContentFile } from '../test-utils/read-content-file.ts';

// Jira's Markdown and HTML conversions escape task-list brackets, so a checklist submitted through either persists as
// bullets reading `\[ \]`. The submitting skills refer to `update-jira-ticket` only through an optional token, which
// does not deploy it, so each point of Jira submission inlines the rule itself.

/** The one file permitted to state the rule; every carrier includes it. */
const PARTIAL = 'skills/_partials/jira-task-list-flattening.md';

/** The rule's opening, which the single-statement count keys on. */
const RULE_HEADLINE = '**Flatten task lists for Markdown and HTML clients.**';

/** Phrases from both halves of the rule, so that a partial cut down to either half fails. */
const RULE_PHRASES: ReadonlyArray<string> = [
  RULE_HEADLINE,
  'convert task-list syntax (`- [ ]` / `- [x]`) to plain `-` bullets',
  'The `acli` path is the exception and keeps its checkboxes',
];

// Listed explicitly rather than discovered: The failure guarded against is a carrier dropping off the list, and a
// discovered list would move with the bug.
const CARRIERS: ReadonlyArray<string> = [
  'skills/_data/ticket-source-resolution.md',
  'skills/create-ticket/SKILL.md',
  'skills/update-jira-ticket/SKILL.md',
];

describe('jira-task-list-flattening reach', () => {
  describe.each(CARRIERS)('%s', (relativePath) => {
    it('inlines the rule exactly once', async () => {
      const expanded = await readContentFile(relativePath);
      for (const phrase of RULE_PHRASES) {
        expect(expanded).toContain(phrase);
      }
      expect(countOccurrences(expanded, RULE_HEADLINE)).toBe(1);
    });
  });

  it('states the rule in the partial alone', async () => {
    const violations: Array<string> = [];
    const files = await listMarkdownFiles(CONTENT_ROOT);
    for (const file of files) {
      const relativePath = path.relative(CONTENT_ROOT, file);
      if (relativePath === PARTIAL) continue;

      const content = await readFile(file, 'utf8');
      for (const phrase of RULE_PHRASES) {
        if (content.includes(phrase)) violations.push(`${relativePath} -> ${phrase}`);
      }
    }
    const message = `The rule is stated once and inlined from there; these files restate it instead of including it:\n  ${violations.join('\n  ')}`;
    expect(violations, message).toEqual([]);
  });
});
