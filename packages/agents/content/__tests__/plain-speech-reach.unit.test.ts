import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { expandIncludes } from '../../src/lib/directive-expander.ts';
import { countOccurrences } from '../test-utils/count-occurrences.ts';
import { listMarkdownFiles } from '../test-utils/list-markdown-files.ts';

// `guidance/shared/AGENTS.md` is where this rule primarily lives: it installs unconditionally, so every user's
// interactive session carries it. It reaches no subagent, which is the whole reason the partial exists and the whole
// reason its carriers are subagents. The duplication between the two files is structural rather than chosen:
// `installSharedGuidance` copies shared guidance verbatim and expands no includes, so the one file that cannot hold the
// directive holds the text instead, and the assertion below is what keeps the two copies from drifting.
const CONTENT_ROOT = new URL('../', import.meta.url).pathname;

/** The one file permitted to state the rule; every carrier reaches it through an include. */
const PARTIAL = '_partials/plain-speech.md';

/** The one file permitted to restate it, because it ships verbatim and can expand no directive. */
const SHARED_GUIDANCE = 'guidance/shared/AGENTS.md';

/** The rule's opening, which the single-statement counts key on. */
const RULE_HEADLINE = 'When writing practical documentation, speak plainly';

/** Phrases that must survive an edit to the partial, so a gutted rule cannot still pass on its opening alone. */
const RULE_PHRASES: ReadonlyArray<string> = [
  RULE_HEADLINE,
  'Use the plain word and name who acts',
  'reserved for persuasive documentation such as marketing and website copy',
];

// Listed explicitly rather than discovered: the failure guarded against is a carrier dropping off the list, and a
// discovered list would move with the bug.
//
// A place here is earned by being unable to read the primary statement. Shared guidance reaches the interactive
// session, so a skill invoked there already carries the rule and an include would be reinforcement; reinforcement is
// added when the primary statement is observed to fail, not in anticipation of it. A subagent runs on its own system
// prompt and never loads shared guidance at all, so every subagent that composes prose is a carrier and no skill is.
//
// `canary.md` is the one subagent absent, because it exercises the deployment mechanism and is never invoked.
const CARRIERS: ReadonlyArray<string> = [
  'subagents/aspect-code-reviewer.md',
  'subagents/aspect-silent-failure-reviewer.md',
  'subagents/aspect-test-reviewer.md',
  'subagents/code-simplification-reviewer.md',
  'subagents/orchestrated-architect.md',
  'subagents/orchestrated-coder.md',
  'subagents/orchestrated-planner.md',
  'subagents/orchestrated-reviewer.md',
  'subagents/plan-reviewer.md',
  'subagents/plan-reviser.md',
  'subagents/planner.md',
  'subagents/savings-analyzer.md',
];

describe('plain-speech reach', () => {
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

  it('ships the rule verbatim in shared guidance', async () => {
    const partial = await readPartial();
    const shared = await readFile(path.join(CONTENT_ROOT, SHARED_GUIDANCE), 'utf8');

    const message = `${SHARED_GUIDANCE} holds its own copy because shared guidance expands no includes, and the two have drifted apart`;
    expect(shared, message).toContain(partial.trim());
  });

  it('is stated in no content file but the partial and shared guidance', async () => {
    const exempt = new Set([PARTIAL, SHARED_GUIDANCE]);
    const violations: Array<string> = [];

    const files = await listMarkdownFiles(CONTENT_ROOT);
    for (const file of files) {
      const relativePath = path.relative(CONTENT_ROOT, file);
      if (exempt.has(relativePath)) continue;

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

/** Returns the partial's raw content. */
async function readPartial(): Promise<string> {
  return readFile(path.join(CONTENT_ROOT, PARTIAL), 'utf8');
}

// endregion | Helpers
