import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { CONTENT_ROOT } from '../test-utils/content-root.ts';
import { countOccurrences } from '../test-utils/count-occurrences.ts';
import { readContentFile } from '../test-utils/read-content-file.ts';

// The residue rule is stated once, in the collaboration rulebook's "Handoffs" section, and every surface that writes,
// executes, reviews, or closes a step carries a pointer to it or the one clause that shapes its output. That
// redundancy is deliberate: The rulebook is ambient, so a subagent never sees it, and an agent follows a clause
// beside the step that it governs more reliably than a rule that it must fetch. A streamline pass reads the carriers
// as restatements, which is how the pointers get stripped; this suite is what makes the strip visible.

/** The rulebook that states the rule, and the heading under which it states it. */
const RULEBOOK = 'guidance/rulebooks/williamthorsen-collaboration-preferences.md';
const RULE_HEADING = '## Handoffs';

/** The phrases that each carrier must contain, as the install pipeline delivers the file. */
const CARRIERS: ReadonlyMap<string, ReadonlyArray<string>> = new Map([
  [RULEBOOK, ['A sandbox denial is never by itself a reason to hand a step over', "Verification is the agent's"]],
  [
    'guidance/rulebooks/williamthorsen-tooling-preferences.md',
    ['retry the command through the permission gate', 'the durable grant'],
  ],
  ['skills/_data/action-items.md', ['is yours to run']],
  ['skills/_partials/action-items.md', ['is run, not asked']],
  ['skills/_partials/option-format.md', ['Verification is never in the gated class']],
  [
    'skills/_partials/plan-template.md',
    ['**Who performs a step.**', '**Residue:**', 'the owner exercises `/lab/book-row`'],
  ],
  ['skills/collaborate/SKILL.md', [RULE_HEADING]],
  ['skills/implement-plan/SKILL.md', ['**Residue:**', 'never a step for the developer to run']],
  ['subagents/handoff-reviewer.md', ['residue reason']],
  ['subagents/plan-reviewer.md', ['Actor assignment']],
]);

describe('handoff-residue reach', () => {
  describe.each([...CARRIERS])('%s', (relativePath, phrases) => {
    it('carries the rule', async () => {
      const content = await readCarrier(relativePath);
      for (const phrase of phrases) {
        expect(content, `${relativePath} no longer contains "${phrase}"`).toContain(phrase);
      }
    });
  });

  it('states the rule once, in the collaboration rulebook', async () => {
    const content = await readCarrier(RULEBOOK);
    expect(countOccurrences(content, `\n${RULE_HEADING}\n`)).toBe(1);
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
