import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { CONTENT_ROOT } from '../test-utils/content-root.ts';
import { countOccurrences } from '../test-utils/count-occurrences.ts';
import { readContentFile } from '../test-utils/read-content-file.ts';

// Each handoff rule is stated once: the residue rule and the question-answer rule in the collaboration rulebook's
// "Handoffs" section, the overload rule in its "Prompt formatting" section, and the design-time rule in the design
// priorities' "Who applies the change" section. Every surface that designs, writes, executes, reviews, or closes a
// step contains a pointer to the rule or the one clause that shapes its output. That redundancy is deliberate: The
// rulebook is ambient, so a subagent never sees it, and an agent follows a clause beside the step that it governs
// more reliably than a rule that it must fetch. A streamline pass reads the carriers as restatements and strips the
// pointers; this suite makes the removal visible.

/** The rulebook that states the residue rule, and the heading under which it states it. */
const RULEBOOK = 'guidance/rulebooks/williamthorsen-collaboration-preferences.md';
const RULE_HEADING = '## Handoffs';

/** The data file that states the design-time rule, and the heading under which it states it. */
const DESIGN_PRIORITIES = 'skills/_data/design-priorities.md';
const DESIGN_RULE_HEADING = '## Who applies the change';

/** The phrases that each carrier must contain, as the install pipeline delivers the file. */
const CARRIERS: ReadonlyMap<string, ReadonlyArray<string>> = new Map([
  [
    RULEBOOK,
    [
      'Never hand a step over because of a sandbox denial alone',
      'Verify yourself',
      'A question receives an answer',
      'When the developer signals overload',
    ],
  ],
  [
    'guidance/rulebooks/williamthorsen-tooling-preferences.md',
    ['retry the command through the permission gate', 'the durable grant'],
  ],
  ['skills/_data/action-items.md', ['is yours to run', 'An overload signal from the user']],
  [DESIGN_PRIORITIES, [DESIGN_RULE_HEADING, 'one script per machine, run once']],
  ['skills/_partials/action-items.md', ['rather than ask for it']],
  ['skills/_partials/option-format.md', ['Verification is never in the gated class']],
  [
    'skills/_partials/plan-template.md',
    [
      '**Who performs a step.**',
      '**Residue:**',
      'the owner exercises `/lab/book-row`',
      'one script per machine, run once',
    ],
  ],
  [
    'skills/collaborate/SKILL.md',
    [RULE_HEADING, 'not a procedure for them to run', 'When the developer signals overload'],
  ],
  ['skills/design-and-plan/SKILL.md', ['who applies the change']],
  [
    'skills/implement-plan/SKILL.md',
    ['**Residue:**', 'never a step for the developer to run', 'stay yours even when the step has a residue line'],
  ],
  ['skills/plan/SKILL.md', ['who applies the change']],
  ['subagents/handoff-reviewer.md', ['residue reason']],
  ['subagents/plan-reviewer.md', ['Actor assignment']],
]);

describe('handoff-residue reach', () => {
  describe.each([...CARRIERS])('%s', (relativePath, phrases) => {
    it('contains the rule', async () => {
      const content = await readCarrier(relativePath);
      for (const phrase of phrases) {
        expect(content, `${relativePath} no longer contains "${phrase}"`).toContain(phrase);
      }
    });
  });

  it('states the residue rule once, in the collaboration rulebook', async () => {
    const content = await readCarrier(RULEBOOK);
    expect(countOccurrences(content, `\n${RULE_HEADING}\n`)).toBe(1);
  });

  it('states the design-time rule once, in the design priorities', async () => {
    const content = await readCarrier(DESIGN_PRIORITIES);
    expect(countOccurrences(content, `\n${DESIGN_RULE_HEADING}\n`)).toBe(1);
  });
});

// region | Helpers

/** Reads a partial from its source, and any other carrier as the pipeline delivers it. */
async function readCarrier(relativePath: string): Promise<string> {
  if (relativePath.startsWith('skills/_partials/')) {
    return readFile(path.join(CONTENT_ROOT, relativePath), 'utf8');
  }
  return readContentFile(relativePath);
}

// endregion | Helpers
