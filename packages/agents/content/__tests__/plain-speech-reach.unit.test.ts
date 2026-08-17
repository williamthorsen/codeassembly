import { readdirSync } from 'node:fs';
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
  'Use the plain word and name the actor',
  'reserved for persuasive documentation such as marketing and website copy',
];

/** Subagents that compose no prose for a reader, so the rule has nothing in them to govern. */
const EXEMPT_SUBAGENTS: ReadonlySet<string> = new Set([
  // Exercises the declared-subagent deployment mechanism and is never invoked.
  'canary.md',
]);

// Every subagent is a carrier, so the list is read from the directory rather than written out: a subagent added later
// is covered on the day it lands, and one that drops its include still fails the assertions below. Writing it out would
// guard only the second failure, and `subagent-content.unit.test.ts` reads the same directory for the same reason.
//
// A carrier is a body that cannot read the rule's primary statement. `guidance/shared/AGENTS.md` installs
// unconditionally and reaches every interactive session; a subagent runs on its own system prompt and never loads it.
const CARRIERS: ReadonlyArray<string> = listSubagentCarriers();

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

/** Returns every subagent body the rule must reach, as content-root-relative paths. */
function listSubagentCarriers(): ReadonlyArray<string> {
  return readdirSync(path.join(CONTENT_ROOT, 'subagents'))
    .filter((entry) => entry.endsWith('.md') && !EXEMPT_SUBAGENTS.has(entry))
    .toSorted()
    .map((entry) => `subagents/${entry}`);
}

/** Returns the partial's raw content. */
async function readPartial(): Promise<string> {
  return readFile(path.join(CONTENT_ROOT, PARTIAL), 'utf8');
}

// endregion | Helpers
