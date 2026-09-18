import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { expandIncludes } from '../../src/lib/directive-expander.ts';
import { countOccurrences } from '../test-utils/count-occurrences.ts';
import { listMarkdownFiles } from '../test-utils/list-markdown-files.ts';

// Output-shaping specs (the option-format contract and the next-steps menus) must be inlined into what the agent
// reads, not left behind a runtime Markdown link. A link is an optional read at generation time, and the model will
// fill from its prior rather than follow the link, producing a block that looks right and is wrong. These tests
// assert the specs are present in each consumer's include-expanded body, which is what the install pipeline writes.
//
// The consumer lists are explicit rather than discovered from the include directives themselves: The failure against
// which this guards is a consumer being *dropped*, and a discovered list would move with the bug.
//
// A second guard runs beside them, over the diff-audit checklist. Its risk is the mirror image: A host that states
// the checklist in its own prose has no include directive and no anchor, so nothing in the deployment mechanism
// can see the fork. Two carriers of `prose-line-breaks` drifted that way before it was guarded.
const CONTENT_ROOT = new URL('../', import.meta.url).pathname;
const SKILLS_ROOT = path.join(CONTENT_ROOT, 'skills');

interface Spec {
  readonly name: string;
  readonly heading: string;
  /** Phrases that must survive distillation; each is a rule that an improvised block has been observed to get wrong. */
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
    // The gate that decides whether a menu exists at all. Without it the block reads as a formatting spec, and a
    // settled call gets rendered as a fork that the reader has to evaluate.
    '**Earn the menu before rendering it.**',
    // The gate's carve-out. Without it the gate reads as license to decide an authorization ask, trading a menu
    // problem for an agent that acts when it should have asked.
    'This gate governs judgment asks alone',
    // The test that tells a real bullet from a manufactured one. Without it the rule states what a bullet must be
    // and not how to tell, which is the wording that four captured failures got through.
    'must be false for at least one other option',
    // The ban on padding. Without it an option with real pros and no real con gets a con invented for balance, and
    // the invented con is what makes a settled call look like a fork.
    'Never add a bullet to fill a slot',
    // The gate's one observed blind spot. Without it the agent measures each option by its own elapsed time and
    // round trips, which are scarce to it, and treats having measured one as license to rank.
    '**Never rank the options by your own elapsed time, round trips, or effort.**',
    // What sorts an ordering question, stated as a test rather than a list of cases. An enumeration here contradicts
    // the gate to which it is appended, which is how a combine-or-split call lost its recommendation.
    'When the order changes the code or the total effort',
    // What the gate requires of the menu that it produces for a timing-only ordering. Without it a menu satisfies the
    // gate while carrying the agent's lean, which the marker table's ■■□ row licenses.
    'render the options unmarked',
  ],
};

// The remote-issue offer stated in design-and-plan's own body. Not an include: Only this guard sees the block.
const DESIGN_AND_PLAN_REMOTE_ISSUE: Spec = {
  name: 'design-and-plan-remote-issue',
  heading: '**Remote issue update**',
  rules: [
    // The marker rule for the offer. Without it the update option is pinned to ■■□ however stark the staleness.
    "The recommended option's marker follows how stark that staleness is",
  ],
};

// The next-steps menu stated in implement-plan's own body. Not an include: Only this guard sees the block.
const IMPLEMENT_PLAN_MENU: Spec = {
  name: 'implement-plan-menu',
  heading: '## Next-steps options',
  rules: [
    // The marker rule. Without it the selected option is pinned to ■■□ whatever the diff turned out to be, so
    // the marker varies with nothing and the reader has to investigate every menu to find the real forks.
    "The selected option's marker follows how cleanly its rule matched",
    // The fallthrough carve-out. Without it rule 3's default selection can claim ■■■, which is the
    // over-correction that the unpinning invites.
    "Rule 3 is the cascade's fallthrough rather than a positive match",
  ],
};

const NEXT_STEPS_AFTER_PLAN: Spec = {
  name: 'next-steps-after-plan',
  heading: '## Next-steps options',
  rules: [
    '| 3   | 🚀    | Implement   |',
    '🎶 **Orchestrate** -> `orchestrate-dev`',
    // The Implement option's skill mapping. Without it the agent improvises "implement manually", which is the
    // ungoverned path that this option exists to replace.
    '🚀 **Implement** -> `implement-plan`',
    // The spike carve-out. Without it option 3 offers `implement-plan` for a spike plan, which the skill reads far
    // enough to turn away: the round trip that the carve-out exists to prevent.
    'Render option 3 as 🔬 Investigate, invoking no skill',
    // The rule that a spike matches. Without it the cascade's feature-shaped rule 2 fails on an investigation and
    // falls through to rule 3, recommending the development pipeline for work that produces no diff.
    'rule 2 matches whenever rule 1 does not',
    // Rule 1's test. Without it the rule states no condition at all.
    'Recommend only when you can name a load-bearing decision that the plan leaves unsettled',
    // What "unsettled" means. Without them the term is undefined and the agent falls back to instinct.
    'when it was ratified interactively',
    'from prior design work, verified against source, or copied from an established pattern',
    // Why a refine pass cannot resolve an empirical unknown, which is what sends such plans to rule 2.
    'A refine pass re-reads the plan and structurally cannot answer those',
    // The demotion of the structural triggers. Without it they are sufficient again, and every substantive plan
    // trips them.
    'They are evidence to weigh, and none of them matches rule 1 on its own',
    // The obligation that makes the test structural rather than advisory: An agent with nothing to name cannot
    // render the recommendation. Without it rule 1 is only advice.
    '`➕` line naming the specific unsettled decision that the pass would raise',
    // The marker rule and its fallthrough carve-out, as on `IMPLEMENT_PLAN_MENU` above.
    "The selected option's marker follows how cleanly its rule matched",
    "Rule 3 is the cascade's fallthrough rather than a positive match",
  ],
};

const NEXT_STEPS_AFTER_REVIEW: Spec = {
  name: 'next-steps-after-review',
  heading: '## Next-steps options',
  rules: [
    '### Source divergence sub-block',
    '### Combined output format',
    // The heading to which both artifact-mutating sub-blocks link. Renaming it breaks the `#proposed-edit-preview`
    // anchors silently, leaving each sub-block pointing at nothing.
    '### Proposed-edit preview',
    // The carve-out that exempts the preview from the sub-blocks' terseness default. Without it that default
    // suppresses the preview again, which is the consent-blind render that this spec exists to prevent.
    'It never suppresses the proposed-edit preview, which is required content',
    // The directive that keeps the Deviations edit inside the criteria that it previews. Without it the option names
    // no bound, and the delegate's own scope is the only thing holding the edit to what the preview showed.
    'which revises acceptance criteria alone',
    // The trigger's computation order. Without it the sub-block renders off the compliance status rows again,
    // prompting for a ticket edit wherever a criterion's wording merely differs from what was built.
    'Compute the delta first: An empty delta renders no sub-block',
    // The carve-out for work that is unfinished rather than redirected. Without it a mid-implementation review
    // proposes dropping criteria that the branch has not reached yet, aligning the contract to a moving target.
    'A criterion that is merely unbuilt contributes no line',
    // Rule 2's ground for leaving the criteria alone. Without it a conflicting implementation already flagged by the
    // review gets the contract rewritten to match it, and the finding disappears along with the conflict.
    'revising the contract to match it',
    // The marker rule for the Deviations cascade. Without it rules 1 and 2 re-pin their markers inline, and the
    // marker varies with nothing.
    "the recommended option's marker follows how cleanly the rule's test is met",
    // The marker rule for the source-divergence cases, in that block's own wording so that the near-duplicate rules
    // above and below cannot mask its removal. Without it the recommended option re-pins to ■■□ however stark
    // the divergence.
    "the recommended option's marker follows how cleanly the case's own test is met",
    // The rule that puts the ticket edit's destination in the rendered line. Without it the option renders as a bare
    // label again, and selecting it is consent to a write whose target the user was never shown.
    '**Name the artifact that the edit writes.**',
    // The rule that offers the local-only form when the snapshot may be the working contract. Without it a ticket
    // that the user cannot edit has no path but a remote write that fails or updates a ticket that is not theirs.
    '**Offer the local-only form when the snapshot may be the contract.**',
    // The marker rule, here for the findings cascade.
    "The selected option's marker follows how cleanly its rule matched",
    // The clause that fixes what the implement option's commit is. Without it the option's name is the only thing
    // saying a commit happens, and an amend takes back the diff and the revert point for which the separate commit
    // exists.
    'The commit is always a new one, never an amend',
  ],
};

const CONSUMERS: ReadonlyArray<{ readonly slug: string; readonly specs: ReadonlyArray<Spec> }> = [
  { slug: 'collaborate', specs: [OPTION_FORMAT] },
  { slug: 'design-and-plan', specs: [OPTION_FORMAT, NEXT_STEPS_AFTER_PLAN, DESIGN_AND_PLAN_REMOTE_ISSUE] },
  { slug: 'implement-plan', specs: [OPTION_FORMAT, IMPLEMENT_PLAN_MENU] },
  { slug: 'merge-pr', specs: [OPTION_FORMAT] },
  { slug: 'plan', specs: [OPTION_FORMAT, NEXT_STEPS_AFTER_PLAN] },
  { slug: 'plan-orchestrable-steps', specs: [OPTION_FORMAT] },
  { slug: 'refine-plan', specs: [OPTION_FORMAT, NEXT_STEPS_AFTER_PLAN] },
  { slug: 'review-branch', specs: [OPTION_FORMAT, NEXT_STEPS_AFTER_REVIEW] },
  { slug: 'save-plan', specs: [OPTION_FORMAT, NEXT_STEPS_AFTER_PLAN] },
  { slug: 'update-jira-ticket', specs: [OPTION_FORMAT] },
  { slug: 'update-project-guidance', specs: [OPTION_FORMAT] },
];

/**
 * The `_data` paths through which the specs were reached before they were inlined. A surviving link is a missed
 * consumer.
 */
const RELOCATED_SPEC_LINKS: ReadonlyArray<string> = [
  '_data/next-steps-after-plan.md',
  '_data/next-steps-after-review.md',
];

/** The sole permitted statement of the diff-audit checklist; every host reaches it through an include. */
const DIFF_AUDIT_PARTIAL = '_partials/diff-audit-checklist.md';

/** Phrases distinctive enough that a file containing one has restated the checklist rather than included it. */
const DIFF_AUDIT_PHRASES: ReadonlyArray<string> = [
  'A green gate is not this audit',
  'the site that you were pointed at is a sample of its class',
  'This audit is bounded by your own edit',
];

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
      const headings = new Set(specs.map((spec) => spec.heading));
      for (const heading of headings) {
        expect(countOccurrences(expanded, heading), `${slug} repeats "${heading}"`).toBe(1);
      }
    });
  });

  it('no skill still links to a relocated spec', async () => {
    const violations: Array<string> = [];
    const entries = await readdir(SKILLS_ROOT, { withFileTypes: true });
    for (const entry of entries) {
      // `_`-prefixed entries are support directories; a directory with no `SKILL.md` (e.g. a bundled helper) is not
      // a skill either. Neither can contain a spec link.
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

describe('diff-audit checklist inlining', () => {
  it('is stated in no content file but its partial', async () => {
    const violations: Array<string> = [];
    const files = await listMarkdownFiles(CONTENT_ROOT);
    for (const file of files) {
      const relativePath = path.relative(CONTENT_ROOT, file);
      if (relativePath === DIFF_AUDIT_PARTIAL) {
        continue;
      }
      const content = await readFile(file, 'utf8');
      for (const phrase of DIFF_AUDIT_PHRASES) {
        if (content.includes(phrase)) {
          violations.push(`${relativePath} -> ${phrase}`);
        }
      }
    }
    const message = `The checklist is inlined from one partial; these files restate it instead of including it:\n  ${violations.join('\n  ')}`;
    expect(violations, message).toEqual([]);
  });
});

// region | Helpers

/**
 * Returns a skill's include-expanded `SKILL.md`, the body that the install pipeline goes on to rewrite and write out.
 */
async function expandSkill(slug: string): Promise<string> {
  return expandIncludes(path.join(SKILLS_ROOT, slug, 'SKILL.md'), CONTENT_ROOT);
}

// endregion | Helpers
