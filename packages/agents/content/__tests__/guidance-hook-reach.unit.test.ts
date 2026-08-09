import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { readInjectedSkills } from '../../src/lib/dependency-frontmatter.ts';
import { expandIncludes } from '../../src/lib/directive-expander.ts';
import { parseFrontmatter } from '../../src/lib/frontmatter-merger.ts';
import { parseRulebookFile } from '../../src/lib/rulebook-schema.ts';
import type { GuidanceHookFills } from '../../src/lib/guidance-hooks.ts';
import { assertFilledAnchorsResolve, fillGuidanceHooks, listGuidanceHooks } from '../../src/lib/guidance-hooks.ts';

// A guidance hook reaches an agent two ways, and both are checked here: a body declares the directive itself, or a
// subagent preloads a skill that declares it. Each route is one line an edit can drop with no other test failing.
const CONTENT_ROOT = new URL('../', import.meta.url).pathname;
const RULEBOOKS_ROOT = path.join(CONTENT_ROOT, 'guidance', 'rulebooks');
const SUBAGENTS_ROOT = path.join(CONTENT_ROOT, 'subagents');

const HOOK = 'implementation-preferences';

/** A body declaring the hook: the slug naming it in a test title, and its path under the content root. */
interface DeclaringBody {
  readonly label: string;
  readonly relativePath: string;
}

/** A rulebook a declaration binds to the hook, with a phrase that would not survive the rulebook being gutted. */
interface BoundRulebook {
  readonly slug: string;
  readonly rule: string;
}

// Listed explicitly rather than discovered from the directives: the failure guarded against is a body dropping off,
// and a discovered list would move with the bug.
const DECLARING_BODIES: ReadonlyArray<DeclaringBody> = [
  { label: 'implement-plan', relativePath: 'skills/implement-plan/SKILL.md' },
  { label: 'orchestrated-coder', relativePath: 'subagents/orchestrated-coder.md' },
  { label: 'respond-to-review', relativePath: 'skills/respond-to-review/SKILL.md' },
  { label: 'review-branch', relativePath: 'skills/review-branch/SKILL.md' },
  { label: 'review-criteria', relativePath: 'skills/review-criteria/SKILL.md' },
];

const BOUND_RULEBOOKS: ReadonlyArray<BoundRulebook> = [
  { slug: 'williamthorsen-code-layout-preferences', rule: 'A `__tests__/` directory sits beside the code it covers' },
  { slug: 'williamthorsen-typescript-preferences', rule: 'Never use a type assertion' },
];

/** The skill every reviewer subagent preloads, and so the one that carries the hook to all of them. */
const REVIEWER_CARRIER = 'review-criteria';

const REVIEWER_SUBAGENTS: ReadonlyArray<string> = [
  'aspect-code-reviewer',
  'aspect-silent-failure-reviewer',
  'aspect-test-reviewer',
  'code-simplification-reviewer',
  'orchestrated-reviewer',
];

describe('guidance-hook reach', () => {
  it.each(DECLARING_BODIES)('$label declares the hook', async ({ label, relativePath }) => {
    const declared = listGuidanceHooks(await expandBody(relativePath), label).map(({ name }) => name);

    const message = `${label} writes or judges code but declares no ${HOOK} hook, so a binding cannot reach it`;
    expect(declared, message).toContain(HOOK);
  });

  it.each(BOUND_RULEBOOKS)('$slug declares hook delivery', async ({ slug }) => {
    const { rulebook } = parseRulebookFile(await readFile(path.join(RULEBOOKS_ROOT, `${slug}.md`), 'utf8'), slug);

    const message = `${slug} is bound to ${HOOK} but its delivery does not name the route, so sync warns about it`;
    expect(rulebook.delivery, message).toContain('hook');
  });

  it.each(REVIEWER_SUBAGENTS)('%s preloads the skill declaring the hook', async (slug) => {
    const content = await readFile(path.join(SUBAGENTS_ROOT, `${slug}.md`), 'utf8');
    const injected = readInjectedSkills(content, `${slug}.md`);

    const message = `${slug} judges code but preloads no ${REVIEWER_CARRIER}; injected: [${injected.join(', ')}]`;
    expect(injected, message).toContain(REVIEWER_CARRIER);
  });

  it('splices every bound rulebook into a declaring body', async () => {
    const label = 'implement-plan';
    const filled = fillGuidanceHooks(await expandBody(`skills/${label}/SKILL.md`), await buildFills(), label);

    for (const { rule } of BOUND_RULEBOOKS) {
      expect(filled.content).toContain(rule);
    }
    expect(filled.content).toContain('## Comment discipline');
  });

  it.each(DECLARING_BODIES)('$label resolves its anchors once filled', async ({ label, relativePath }) => {
    const filled = fillGuidanceHooks(await expandBody(relativePath), await buildFills(), label);

    expect(() => assertFilledAnchorsResolve(filled, label)).not.toThrow();
  });
});

// region | Helpers

/**
 * Builds the fills a declaration produces, keyed by hook. Bound bodies arrive unrendered: link rewriting and
 * invocation-token resolution belong to `sync` and are covered there, and what these assertions cover is the splice
 * into the real consumer bodies.
 */
async function buildFills(): Promise<GuidanceHookFills> {
  const bound = await Promise.all(
    BOUND_RULEBOOKS.map(async ({ slug }) => ({ slug, body: await readRulebookBody(slug) })),
  );
  return new Map([[HOOK, bound]]);
}

/** Returns a skill or subagent body with its includes expanded — the body the deploy pipeline goes on to fill. */
async function expandBody(relativePath: string): Promise<string> {
  return expandIncludes(path.join(CONTENT_ROOT, relativePath), CONTENT_ROOT);
}

/** Returns a rulebook's body with its frontmatter stripped, the form a fill splices. */
async function readRulebookBody(slug: string): Promise<string> {
  const content = await readFile(path.join(RULEBOOKS_ROOT, `${slug}.md`), 'utf8');
  return parseFrontmatter(content).body;
}

// endregion | Helpers
