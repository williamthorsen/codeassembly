import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { readInjectedSkills } from '../../src/lib/dependency-frontmatter.ts';
import { expandIncludes } from '../../src/lib/directive-expander.ts';
import { parseFrontmatter } from '../../src/lib/frontmatter-merger.ts';
import type { GuidanceHookFill, GuidanceHookFills } from '../../src/lib/guidance-hooks.ts';
import { assertFilledAnchorsResolve, fillGuidanceHooks, listGuidanceHooks } from '../../src/lib/guidance-hooks.ts';
import { parseRulebookFile } from '../../src/lib/rulebook-schema.ts';

// A guidance hook reaches an agent two ways, and both are checked here: a body declares the directive itself, or a
// subagent preloads a skill that declares it. Each route is one line an edit can drop with no other test failing.
//
// Every hook is a row of one table rather than a file of its own, so a hook added with no row is visible as an absence
// here instead of as a suite nobody wrote.
const CONTENT_ROOT = new URL('../', import.meta.url).pathname;
const RULEBOOKS_ROOT = path.join(CONTENT_ROOT, 'guidance', 'rulebooks');
const SUBAGENTS_ROOT = path.join(CONTENT_ROOT, 'subagents');

/** A rulebook a declaration binds to a hook, with a phrase that would not survive the rulebook being gutted. */
interface BoundRulebook {
  readonly slug: string;
  readonly rule: string;
}

/** A body declaring a hook: the slug naming it in a test title, and its path under the content root. */
interface DeclaringBody {
  readonly label: string;
  readonly relativePath: string;
}

/** One hook, the bodies that declare it, the rulebooks bound to it, and the body its splice is proven against. */
interface HookGuard {
  readonly hook: string;
  readonly role: string;
  readonly declaringBodies: ReadonlyArray<DeclaringBody>;
  readonly boundRulebooks: ReadonlyArray<BoundRulebook>;
  readonly spliceProbe: SpliceProbe;
}

/** The body one hook's splice is asserted against, and injected text a fill must not displace. */
interface SpliceProbe {
  readonly body: DeclaringBody;
  readonly coexisting: ReadonlyArray<string>;
}

// Listed explicitly rather than discovered from the directives: the failure guarded against is a body dropping off,
// and a discovered list would move with the bug.
const HOOK_GUARDS: ReadonlyArray<HookGuard> = [
  {
    hook: 'implementation-preferences',
    role: 'writes or judges code',
    declaringBodies: [
      { label: 'implement-plan', relativePath: 'skills/implement-plan/SKILL.md' },
      { label: 'orchestrated-coder', relativePath: 'subagents/orchestrated-coder.md' },
      { label: 'respond-to-review', relativePath: 'skills/respond-to-review/SKILL.md' },
      { label: 'review-branch', relativePath: 'skills/review-branch/SKILL.md' },
      { label: 'review-criteria', relativePath: 'skills/review-criteria/SKILL.md' },
    ],
    boundRulebooks: [
      {
        slug: 'williamthorsen-code-layout-preferences',
        rule: 'A `__tests__/` directory sits beside the code it covers',
      },
      { slug: 'williamthorsen-typescript-preferences', rule: 'Never use a type assertion' },
    ],
    spliceProbe: {
      body: { label: 'implement-plan', relativePath: 'skills/implement-plan/SKILL.md' },
      coexisting: ['## Comment discipline'],
    },
  },
  {
    hook: 'ticketing-preferences',
    role: 'decides on or creates tickets',
    declaringBodies: [
      { label: 'create-ticket', relativePath: 'skills/create-ticket/SKILL.md' },
      { label: 'design-and-plan', relativePath: 'skills/design-and-plan/SKILL.md' },
      { label: 'respond-to-review', relativePath: 'skills/respond-to-review/SKILL.md' },
    ],
    boundRulebooks: [{ slug: 'williamthorsen-ticketing-preferences', rule: 'give each pull request its own ticket' }],
    spliceProbe: {
      body: { label: 'create-ticket', relativePath: 'skills/create-ticket/SKILL.md' },
      coexisting: ['{Clear statement of what needs to be solved and why}'],
    },
  },
  {
    hook: 'writing-preferences',
    role: 'composes prose',
    declaringBodies: [
      { label: 'aspect-code-reviewer', relativePath: 'subagents/aspect-code-reviewer.md' },
      { label: 'aspect-silent-failure-reviewer', relativePath: 'subagents/aspect-silent-failure-reviewer.md' },
      { label: 'aspect-test-reviewer', relativePath: 'subagents/aspect-test-reviewer.md' },
      { label: 'code-simplification-reviewer', relativePath: 'subagents/code-simplification-reviewer.md' },
      { label: 'orchestrated-architect', relativePath: 'subagents/orchestrated-architect.md' },
      { label: 'orchestrated-coder', relativePath: 'subagents/orchestrated-coder.md' },
      { label: 'orchestrated-planner', relativePath: 'subagents/orchestrated-planner.md' },
      { label: 'orchestrated-reviewer', relativePath: 'subagents/orchestrated-reviewer.md' },
      { label: 'plan-reviewer', relativePath: 'subagents/plan-reviewer.md' },
      { label: 'plan-reviser', relativePath: 'subagents/plan-reviser.md' },
      { label: 'planner', relativePath: 'subagents/planner.md' },
      { label: 'savings-analyzer', relativePath: 'subagents/savings-analyzer.md' },
    ],
    boundRulebooks: [
      {
        slug: 'williamthorsen-writing-preferences',
        rule: 'Capitalize what follows as though the label were absent',
      },
    ],
    spliceProbe: {
      body: { label: 'orchestrated-coder', relativePath: 'subagents/orchestrated-coder.md' },
      coexisting: ['No hard line breaks'],
    },
  },
];

/** The skill every reviewer subagent preloads, and so the one that delivers the hooks it declares to all of them. */
const REVIEWER_CARRIER = 'review-criteria';

const REVIEWER_SUBAGENTS: ReadonlyArray<string> = [
  'aspect-code-reviewer',
  'aspect-silent-failure-reviewer',
  'aspect-test-reviewer',
  'code-simplification-reviewer',
  'orchestrated-reviewer',
];

describe.each(HOOK_GUARDS)('$hook reach', ({ boundRulebooks, declaringBodies, hook, role, spliceProbe }) => {
  it.each(declaringBodies)('$label declares the hook', async ({ label, relativePath }) => {
    const declared = listGuidanceHooks(await expandBody(relativePath), label).map(({ name }) => name);

    const message = `${label} ${role} but declares no ${hook} hook, so a binding cannot reach it`;
    expect(declared, message).toContain(hook);
  });

  it.each(boundRulebooks)('$slug declares hook delivery', async ({ slug }) => {
    const { rulebook } = parseRulebookFile(await readFile(path.join(RULEBOOKS_ROOT, `${slug}.md`), 'utf8'), slug);

    const message = `${slug} is bound to ${hook} but its delivery does not name the route, so sync warns about it`;
    expect(rulebook.delivery, message).toContain('hook');
  });

  it('splices every bound rulebook into a declaring body', async () => {
    const { body, coexisting } = spliceProbe;
    const filled = fillGuidanceHooks(await expandBody(body.relativePath), await buildFills(), body.label);

    for (const { rule } of boundRulebooks) {
      expect(filled.content).toContain(rule);
    }
    for (const text of coexisting) {
      expect(filled.content).toContain(text);
    }
  });

  it.each(declaringBodies)('$label resolves its anchors once filled', async ({ label, relativePath }) => {
    const filled = fillGuidanceHooks(await expandBody(relativePath), await buildFills(), label);

    expect(() => assertFilledAnchorsResolve(filled, label)).not.toThrow();
  });
});

// The reviewer subagents reach a hook through a preloaded skill rather than a directive of their own, a route only
// `implementation-preferences` takes. Kept beside the table rather than in it, so no other hook has an empty field
// for a route it does not use.
describe('reviewer-subagent carrier', () => {
  it.each(REVIEWER_SUBAGENTS)('%s preloads the skill declaring the hook', async (slug) => {
    const content = await readFile(path.join(SUBAGENTS_ROOT, `${slug}.md`), 'utf8');
    const injected = readInjectedSkills(content, `${slug}.md`);

    const message = `${slug} judges code but preloads no ${REVIEWER_CARRIER}; injected: [${injected.join(', ')}]`;
    expect(injected, message).toContain(REVIEWER_CARRIER);
  });
});

// region | Helpers

/**
 * Builds the fills a declaration produces, keyed by hook, spanning every guard rather than one hook at a time: a body
 * can declare more than one, and an anchor collision only shows up once they fill together the way `sync` fills them.
 * Bound bodies stay unrendered: link rewriting and invocation-token resolution belong to `sync` and are covered
 * there, and what these assertions cover is the splice into the real consumer bodies.
 */
async function buildFills(): Promise<GuidanceHookFills> {
  const entries = await Promise.all(
    HOOK_GUARDS.map(async ({ boundRulebooks, hook }): Promise<[string, ReadonlyArray<GuidanceHookFill>]> => {
      const bound = await Promise.all(
        boundRulebooks.map(async ({ slug }) => ({ slug, body: await readRulebookBody(slug) })),
      );
      return [hook, bound];
    }),
  );
  return new Map(entries);
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
