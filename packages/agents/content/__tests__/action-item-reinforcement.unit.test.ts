import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

// The duplication this list guards is deliberate: the convention is also stated globally, and a DRY-driven refactor
// that strips the skill-local copies removes the mechanism by which the global rule takes effect. See the
// `codeassembly-content-specification` rulebook, § "Skill-local reinforcement".
//
// Membership is skills that routinely close a turn awaiting a user response. Skills whose only ask is an exception
// path (`create-pr`'s unknown-platform fallback, `capture-feedback`'s ambiguity confirm) are absent by design; a
// skill that begins asking as a matter of course belongs here.
const REINFORCED_SKILLS: ReadonlyArray<string> = [
  'assess-ticket',
  'brainstorming',
  'collaborate',
  'create-ticket',
  'design-and-plan',
  'kb-add',
  'merge-pr',
  'migrate-feedback-memories',
  'people-report',
  'plan-orchestrable-steps',
  'refine-plan',
  'update-project-guidance',
  'wrap-up',
];

const INCLUDE_DIRECTIVE = '<!-- include: ../_partials/action-items.md / -->';

const SKILLS_ROOT = new URL('../skills/', import.meta.url).pathname;

interface IncludeSites {
  /** Directives that expand into the skill's live instructions. */
  readonly live: number;
  /** 1-based line numbers of directives inside a fenced block. */
  readonly fenced: ReadonlyArray<number>;
}

/**
 * Locates the skill's action-items directives, separating those inside a fenced block from those outside it. The
 * include expander is line-anchored and tracks no fence state, so a directive inside a fence still expands — the
 * partial's own fence then closes the enclosing one and the rest of the template renders as prose.
 */
async function findIncludeSites(slug: string): Promise<IncludeSites> {
  const body = await readFile(path.join(SKILLS_ROOT, slug, 'SKILL.md'), 'utf8');
  const fenced: Array<number> = [];
  let live = 0;
  let inFence = false;

  for (const [index, line] of body.split('\n').entries()) {
    if (line.trimStart().startsWith('```')) {
      inFence = !inFence;
    } else if (line.includes(INCLUDE_DIRECTIVE)) {
      if (inFence) fenced.push(index + 1);
      else live += 1;
    }
  }
  return { live, fenced };
}

describe('action-item reinforcement', () => {
  it.each(REINFORCED_SKILLS)('%s inlines the action-items convention exactly once', async (slug) => {
    const { live } = await findIncludeSites(slug);
    expect(
      live,
      live === 0
        ? `\`${slug}/SKILL.md\` closes turns awaiting a user response but no longer inlines the action-items ` +
            `convention. Restore \`${INCLUDE_DIRECTIVE}\` at the step that produces the ask, or remove the skill ` +
            `from REINFORCED_SKILLS if it no longer asks.`
        : `\`${slug}/SKILL.md\` inlines the action-items convention ${live} times; it must appear exactly once.`,
    ).toBe(1);
  });

  it.each(REINFORCED_SKILLS)('%s places the directive outside every fenced block', async (slug) => {
    const { fenced } = await findIncludeSites(slug);
    expect(
      fenced,
      `\`${slug}/SKILL.md\` puts the action-items directive inside a fenced block (line ${fenced.join(', ')}). ` +
        `It expands anyway, and the partial's own fence closes the enclosing one — presenting the convention's ` +
        `prose as template content and leaving the rest of the template outside its fence. Move the directive ` +
        `below the closing fence.`,
    ).toEqual([]);
  });

  it('the partial the skills include exists', async () => {
    const partial = await readFile(path.join(SKILLS_ROOT, '_partials', 'action-items.md'), 'utf8');
    expect(partial).toContain('**Action items**');
  });
});
