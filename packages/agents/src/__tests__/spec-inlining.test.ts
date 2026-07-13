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

// Written as an escape because a literal NBSP is invisible in source. A whitespace indent — non-breaking or ASCII
// alike — is discarded by the terminal renderer, collapsing an option's reasoning to the left margin, so no consumer
// may carry one. Reasoning nests as a list item instead, which is structure the renderer preserves.
const NBSP = '\u00A0';

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
  rules: ['| 3   | 🚀🔍  | Implement directly with follow-up review', '🎶 **Orchestrate** -> `orchestrate-dev`'],
};

const NEXT_STEPS_AFTER_REVIEW: Spec = {
  name: 'next-steps-after-review',
  heading: '## Next-steps options',
  rules: ['### Source divergence sub-block', '### Combined output format'],
};

const CONSUMERS: ReadonlyArray<{ readonly slug: string; readonly specs: ReadonlyArray<Spec> }> = [
  { slug: 'collaborate', specs: [OPTION_FORMAT] },
  { slug: 'design-and-plan', specs: [OPTION_FORMAT, NEXT_STEPS_AFTER_PLAN] },
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

  it.each(CONSUMERS)('$slug carries no whitespace-indented option reasoning', async ({ slug }) => {
    const expanded = await expandSkill(slug);
    expect(
      expanded.includes(NBSP),
      `\`${slug}\` reaches the agent carrying a non-breaking space. A whitespace indent does not survive terminal ` +
        `rendering — the line collapses to the left margin and the reader cannot tell which option it belongs to. ` +
        `Nest the reasoning as a list item instead.`,
    ).toBe(false);
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
