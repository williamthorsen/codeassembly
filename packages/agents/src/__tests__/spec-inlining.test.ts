import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { expandIncludes } from '../lib/directive-expander.ts';

// Output-shaping specs — the option-format contract and the next-steps menus — must reach the agent inlined, not
// behind a runtime Markdown link. A link is an optional read at generation time, and the model will fill from its
// prior rather than take the hop, producing a block that looks right and is wrong. These tests assert the specs are
// present in each consumer's include-expanded body, which is what the install pipeline writes.
//
// The consumer lists are explicit rather than discovered from the include directives themselves: the failure this
// guards against is a consumer being *dropped*, and a discovered list would move with the bug.
const CONTENT_ROOT = new URL('../../content/', import.meta.url).pathname;
const SKILLS_ROOT = path.join(CONTENT_ROOT, 'skills');

interface Spec {
  readonly name: string;
  readonly heading: string;
  /** Phrases that must survive distillation; each is a rule an improvised block has been observed to get wrong. */
  readonly rules: ReadonlyArray<string>;
}

const OPTION_FORMAT: Spec = {
  name: 'option-format',
  heading: '## Option format',
  rules: [
    '**Number every option**',
    'a recommendation that does not match the strongest marker is a defect',
    '| ■■■    | strongly recommended |',
    '   - ➕ minimal surface area',
    'Apply this even when an option has only one pro or con.',
  ],
};

const NEXT_STEPS_AFTER_PLAN: Spec = {
  name: 'next-steps-after-plan',
  heading: '## Next-steps options',
  rules: [
    '| 3   | 🚀    | Implement   |',
    '🎶 **Orchestrate** -> `orchestrate-dev`',
    // The Implement option's skill mapping. Without it the agent improvises "implement manually", which is the
    // ungoverned path this option exists to replace.
    '🚀 **Implement** -> `implement-plan`',
    // The spike carve-out. Without it option 3 offers `implement-plan` for a spike plan, which the skill reads far
    // enough to turn away — the round trip the carve-out exists to prevent.
    'Render option 3 as 🔬 Investigate, invoking no skill',
    // Rule 1's four load-bearing clauses, plus the Output-format obligation that makes it binding. Removing any
    // one of them reintroduces the failure named beneath it.
    // Rule 1's test. Without it the rule states no condition at all.
    'recommend only when you can name a load-bearing decision the plan leaves unsettled',
    // What "unsettled" means. Without it the term is undefined and the agent falls back to instinct.
    'ratified interactively, carried in from prior design work, verified against source, or copied from an established pattern',
    // Why a refine pass cannot resolve an empirical unknown, which is what routes such plans to rule 2.
    'A refine pass re-reads the plan and structurally cannot answer those',
    // The demotion of the structural triggers. Without it they are sufficient again, and every substantive plan
    // trips them.
    'They are evidence to weigh, and none of them matches rule 1 on its own',
    // The obligation that makes the test structural rather than advisory: an agent with nothing to name cannot
    // render the recommendation. Without it rule 1 is only advice.
    'must carry a `➕` line naming the specific unsettled decision the pass would surface',
  ],
};

const NEXT_STEPS_AFTER_REVIEW: Spec = {
  name: 'next-steps-after-review',
  heading: '## Next-steps options',
  rules: ['### Source divergence sub-block', '### Combined output format'],
};

const CONSUMERS: ReadonlyArray<{ readonly slug: string; readonly specs: ReadonlyArray<Spec> }> = [
  { slug: 'collaborate', specs: [OPTION_FORMAT] },
  { slug: 'design-and-plan', specs: [OPTION_FORMAT, NEXT_STEPS_AFTER_PLAN] },
  { slug: 'implement-plan', specs: [OPTION_FORMAT] },
  { slug: 'merge-pr', specs: [OPTION_FORMAT] },
  { slug: 'plan', specs: [OPTION_FORMAT, NEXT_STEPS_AFTER_PLAN] },
  { slug: 'plan-orchestrable-steps', specs: [OPTION_FORMAT] },
  { slug: 'refine-plan', specs: [OPTION_FORMAT, NEXT_STEPS_AFTER_PLAN] },
  { slug: 'review-branch', specs: [OPTION_FORMAT, NEXT_STEPS_AFTER_REVIEW] },
  { slug: 'save-plan', specs: [OPTION_FORMAT, NEXT_STEPS_AFTER_PLAN] },
  { slug: 'update-jira-ticket', specs: [OPTION_FORMAT] },
  { slug: 'update-project-guidance', specs: [OPTION_FORMAT] },
];

/** The `_data` paths the specs were reached through before they were inlined. A surviving link is a missed consumer. */
const RELOCATED_SPEC_LINKS: ReadonlyArray<string> = [
  '_data/next-steps-after-plan.md',
  '_data/next-steps-after-review.md',
];

/** Returns a skill's include-expanded `SKILL.md` — the body the install pipeline goes on to rewrite and write out. */
async function expandSkill(slug: string): Promise<string> {
  return expandIncludes(path.join(SKILLS_ROOT, slug, 'SKILL.md'), CONTENT_ROOT);
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('output-shaping spec inlining', () => {
  describe.each(CONSUMERS)('$slug', ({ slug, specs }) => {
    it.each(specs)('inlines the $name spec', async (spec) => {
      const expanded = await expandSkill(slug);
      expect(expanded).toContain(spec.heading);
      for (const rule of spec.rules) {
        expect(expanded).toContain(rule);
      }
    });

    it('inlines each spec exactly once', async () => {
      const expanded = await expandSkill(slug);
      for (const heading of new Set(specs.map((spec) => spec.heading))) {
        expect(countOccurrences(expanded, heading), `${slug} repeats "${heading}"`).toBe(1);
      }
    });
  });

  it('no skill still links to a relocated spec', async () => {
    const violations: Array<string> = [];
    for (const entry of await readdir(SKILLS_ROOT, { withFileTypes: true })) {
      // `_`-prefixed entries are support directories; a directory with no `SKILL.md` (e.g. a bundled helper) is not
      // a skill either. Neither can carry a spec link.
      if (!entry.isDirectory() || entry.name.startsWith('_')) {
        continue;
      }
      const skillPath = path.join(SKILLS_ROOT, entry.name, 'SKILL.md');
      if (!existsSync(skillPath)) {
        continue;
      }
      const content = await readFile(skillPath, 'utf8');
      for (const link of RELOCATED_SPEC_LINKS) {
        if (content.includes(link)) {
          violations.push(`${entry.name}/SKILL.md -> ${link}`);
        }
      }
    }
    const message = `These specs are inlined now; replace each link with an in-file anchor:\n  ${violations.join('\n  ')}`;
    expect(violations, message).toEqual([]);
  });
});
