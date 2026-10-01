import { listCatalog } from 'codeassembly/api';
import { describe, expect, it } from 'vitest';

import { COMMENT_AUTHORING_SUBAGENTS } from '../test-utils/comment-authoring-subagents.ts';
import { CONTENT_ROOT } from '../test-utils/content-root.ts';
import { listGovernedSubagents } from '../test-utils/list-governed-subagents.ts';
import { readContentFile } from '../test-utils/read-content-file.ts';
import { readFrontmatterList } from '../test-utils/read-frontmatter-list.ts';
import { renderLibrary } from '../test-utils/rendered-library.ts';

// A guidance hook reaches an agent two ways, and both are checked here: A body declares the directive itself, or a
// subagent preloads a skill that declares it. Each route is one line that an edit can drop without any other test
// failing.
//
// Every hook is a row of one table rather than a file of its own, so a hook added without a row is visible as an
// absence here instead of as a suite that nobody wrote.

/** Matches a guidance-hook directive on its own line, capturing the hook's name. */
const HOOK_DIRECTIVE_PATTERN = /^[ \t]*<!--[ \t]*guidance-hook:[ \t]*(.*?)[ \t]*-->[ \t]*$/gm;

/** A rulebook that a declaration binds to a hook, with a phrase that would not survive the rulebook being gutted. */
interface BoundRulebook {
  readonly slug: string;
  readonly rule: string;
}

/** One reason a skill's hook declaration overlaps an ambient route: the hook, and the ambient rulebooks bound to it. */
interface AmbientHookBinding {
  readonly ambientSlugs: ReadonlyArray<string>;
  readonly hook: string;
}

/** A body declaring a hook: the slug naming it in a test title, and its path under the content root. */
interface DeclaringBody {
  readonly label: string;
  readonly relativePath: string;
}

/** One hook, the bodies that declare it, the rulebooks bound to it, and the body against which its splice is proven. */
interface HookGuard {
  readonly hook: string;
  readonly role: string;
  readonly declaringBodies: ReadonlyArray<DeclaringBody>;
  readonly boundRulebooks: ReadonlyArray<BoundRulebook>;
  readonly spliceProbe: SpliceProbe;
}

/** The body against which one hook's splice is asserted, and injected text that a fill must not displace. */
interface SpliceProbe {
  readonly body: DeclaringBody;
  readonly coexisting: ReadonlyArray<string>;
}

/**
 * Subagents whose output is rewritten by the dispatching session into its own artifacts, in house style. The user does
 * not read the subagent's output directly, so a writing-preferences fill in the subagent only adds tokens to every
 * dispatch.
 */
const HOUSE_STYLE_EXEMPT_SUBAGENTS: ReadonlySet<string> = new Set(['handoff-reviewer']);

// Listed explicitly rather than discovered from the directives: The failure guarded against is a body dropping off,
// and a discovered list would move with the bug.
const HOOK_GUARDS: ReadonlyArray<HookGuard> = [
  {
    hook: 'comment-preferences',
    role: 'writes or judges source comments',
    // The prose sweep judges comment register but does not write any comment, which is why its two bodies are listed
    // here rather than in COMMENT_AUTHORING_SUBAGENTS, whose members must also inject the comment-discipline doctrine.
    declaringBodies: [
      ...COMMENT_AUTHORING_SUBAGENTS.map(toSubagentBody),
      { label: 'prose-reviser', relativePath: 'subagents/prose-reviser.md' },
      { label: 'revise-prose', relativePath: 'skills/revise-prose/SKILL.md' },
    ],
    boundRulebooks: [
      {
        slug: 'williamthorsen-comment-preferences',
        rule: 'third-person indicative with the subject understood',
      },
    ],
    spliceProbe: {
      body: { label: 'code-simplification-reviewer', relativePath: 'subagents/code-simplification-reviewer.md' },
      coexisting: ['Comment-discipline violations'],
    },
  },
  {
    hook: 'implementation-preferences',
    role: 'writes, plans, or judges code',
    declaringBodies: [
      { label: 'implement-plan', relativePath: 'skills/implement-plan/SKILL.md' },
      { label: 'orchestrated-architect', relativePath: 'subagents/orchestrated-architect.md' },
      { label: 'orchestrated-coder', relativePath: 'subagents/orchestrated-coder.md' },
      { label: 'orchestrated-planner', relativePath: 'subagents/orchestrated-planner.md' },
      { label: 'plan-reviewer', relativePath: 'subagents/plan-reviewer.md' },
      { label: 'plan-reviser', relativePath: 'subagents/plan-reviser.md' },
      { label: 'planner', relativePath: 'subagents/planner.md' },
      { label: 'respond-to-review', relativePath: 'skills/respond-to-review/SKILL.md' },
      { label: 'review-branch', relativePath: 'skills/review-branch/SKILL.md' },
      { label: 'review-criteria', relativePath: 'skills/review-criteria/SKILL.md' },
    ],
    boundRulebooks: [
      {
        slug: 'williamthorsen-code-layout-preferences',
        rule: 'A `__tests__/` directory is next to the code that it covers',
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
      { label: 'planner', relativePath: 'subagents/planner.md' },
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
    // Every subagent composes prose, so this population is read from the directory rather than written out: a
    // subagent added later fails here until it declares the hook or joins the exemption. `revise-prose` joins them
    // as the one skill that reads its own fill; see AMBIENT_FILL_READERS.
    declaringBodies: [
      ...listGovernedSubagents()
        .filter((slug) => !HOUSE_STYLE_EXEMPT_SUBAGENTS.has(slug))
        .map(toSubagentBody),
      { label: 'revise-prose', relativePath: 'skills/revise-prose/SKILL.md' },
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

/** Maps each hook to the rulebooks bound to it, spanning every guard, as a declaration binds them all at once. */
const BINDINGS: Readonly<Record<string, ReadonlyArray<string>>> = Object.fromEntries(
  HOOK_GUARDS.map(({ boundRulebooks, hook }) => [hook, boundRulebooks.map(({ slug }) => slug)]),
);

/**
 * Skills permitted to declare a hook whose bound rulebooks deliver `ambient`, each with the reason it is permitted.
 * A session running such a skill reads the rulebook twice, once from the harness guidance file and once from the
 * fill, so the pairing is only worth its cost when the skill reads the fill rather than only carrying it.
 *
 * Nothing else reports this. `sync` used to warn on every pairing and could not tell these apart from an accident.
 * This list records which ones are deliberate.
 */
const AMBIENT_FILL_READERS: ReadonlyMap<string, string> = new Map([
  ['revise-prose', 'resolves its units, their versions, and its rule ids from the fills in its own body'],
]);

/**
 * The skill preloaded by every reviewer subagent, and so the one that delivers the hooks that it declares to all of
 * them.
 */
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
    const declared = listDeclaredHooks(await readContentFile(relativePath));

    const message = `${label} ${role} but does not declare the ${hook} hook, so a binding cannot reach it`;
    expect(declared, message).toContain(hook);
  });

  it.each(boundRulebooks)('$slug declares hook delivery', async ({ slug }) => {
    const delivery = await readFrontmatterList('rulebook', slug, 'delivery');

    const message = `${slug} is bound to ${hook} but its delivery does not name the route, so sync warns about it`;
    expect(delivery, message).toContain('hook');
  });

  it('splices every bound rulebook into a declaring body', async () => {
    const { body, coexisting } = spliceProbe;
    const filled = await readBoundBody(body.relativePath);

    for (const { rule } of boundRulebooks) {
      expect(filled).toContain(rule);
    }
    for (const text of coexisting) {
      expect(filled).toContain(text);
    }
  });

  // The bound render throws on an anchor that a fill leaves unresolvable, so a body that is present here resolved.
  it.each(declaringBodies)('$label resolves its anchors once filled', async ({ relativePath }) => {
    expect(await readBoundBody(relativePath)).toContain(openHookMarker(hook));
  });
});

// The reviewer subagents reach a hook through a preloaded skill rather than a directive of their own, a route that
// only `implementation-preferences` takes. Kept beside the table rather than in it, so that the other hooks do not
// have an empty field for a route that they do not use.
describe('reviewer-subagent carrier', () => {
  it.each(REVIEWER_SUBAGENTS)('%s preloads the skill declaring the hook', async (slug) => {
    const injected = await readFrontmatterList('subagent', slug, 'skills');

    const message = `${slug} judges code but does not preload ${REVIEWER_CARRIER}; injected: [${injected.join(', ')}]`;
    expect(injected, message).toContain(REVIEWER_CARRIER);
  });
});

// The rows above are hand-listed because they guard a body dropping off, which a discovered population cannot catch.
// This one guards the opposite failure, a skill being added, which only a discovered population catches.
describe('ambient-bound hook declarations', () => {
  it('does not permit an unrecorded skill to declare a hook bound to an ambient rulebook', async () => {
    const declarers = await listAmbientFillDeclarers();
    const offenders = declarers
      .entries()
      .filter(([slug]) => !AMBIENT_FILL_READERS.has(slug))
      .map(([slug, bindings]) => `${slug} declares ${bindings.map(describeAmbientBinding).join(' and ')}`)
      .toArray();

    const message =
      `A session running these skills reads the rulebook twice, once from the ambient region and once from the ` +
      `fill: ${offenders.join('; ')}. Drop the directive, or record the skill in AMBIENT_FILL_READERS with the ` +
      'reason it reads its fill.';
    expect(offenders, message).toEqual([]);
  });

  // The inverse of the assertion above, over the same population: An exemption naming a skill that no longer
  // declares an ambient-bound hook silences nothing and would outlive the reason it was granted for.
  it.each(AMBIENT_FILL_READERS.entries().toArray())('%s still declares an ambient-bound hook', async (slug, reason) => {
    const declarers = await listAmbientFillDeclarers();

    const message =
      `${slug} is exempt because it ${reason}, but it does not declare any hook bound to an ambient rulebook, ` +
      'so the exemption is stale';
    expect(declarers.has(slug), message).toBe(true);
  });
});

// region | Helpers

/**
 * Renders one ambient binding for a failure message: the hook, and the ambient rulebooks that a fill would duplicate.
 */
function describeAmbientBinding({ ambientSlugs, hook }: AmbientHookBinding): string {
  return `"${hook}", bound to ambient-delivering ${ambientSlugs.join(', ')}`;
}

/** Returns the slugs among `boundRulebooks` whose delivery names `ambient`, so a fill duplicates the ambient copy. */
async function filterAmbientRulebooks(boundRulebooks: ReadonlyArray<BoundRulebook>): Promise<ReadonlyArray<string>> {
  const ambient: Array<string> = [];
  for (const { slug } of boundRulebooks) {
    if ((await readFrontmatterList('rulebook', slug, 'delivery')).includes('ambient')) {
      ambient.push(slug);
    }
  }
  return ambient;
}

/**
 * Maps each skill declaring a hook whose bound rulebooks deliver `ambient` to the bindings that make it one. Both
 * assertions above read this one population, so neither can drift from the other's notion of declaring.
 */
async function listAmbientFillDeclarers(): Promise<ReadonlyMap<string, ReadonlyArray<AmbientHookBinding>>> {
  const declarers = new Map<string, Array<AmbientHookBinding>>();

  for (const { boundRulebooks, hook } of HOOK_GUARDS) {
    const ambientSlugs = await filterAmbientRulebooks(boundRulebooks);
    if (ambientSlugs.length === 0) {
      continue;
    }
    const declaringSkills = await listSkillSlugsFilling(hook);
    for (const slug of declaringSkills) {
      const bindings = declarers.get(slug);
      if (bindings === undefined) {
        declarers.set(slug, [{ ambientSlugs, hook }]);
      } else {
        bindings.push({ ambientSlugs, hook });
      }
    }
  }

  return declarers;
}

/** Lists the hooks declared by a source body's guidance-hook directives. */
function listDeclaredHooks(body: string): ReadonlyArray<string> {
  return body
    .matchAll(HOOK_DIRECTIVE_PATTERN)
    .map((match) => match[1] ?? '')
    .toArray();
}

/**
 * Returns every skill slug whose deployed files fill `hook` in the bound render. The render walks a skill as `sync`
 * does, so a directive in a skill-local partial counts here only when a deployed body inlines it, and a support entry
 * never fills a hook.
 */
async function listSkillSlugsFilling(hook: string): Promise<ReadonlyArray<string>> {
  const skills = new Set((await listCatalog(CONTENT_ROOT)).skill);
  const tree = await renderLibrary('claude', BINDINGS);
  const slugs = new Set<string>();
  for (const [deployedPath, { content }] of Object.entries(tree)) {
    const slug = /^skills\/([^/]+)\//.exec(deployedPath)?.[1];
    if (slug !== undefined && skills.has(slug) && content.includes(openHookMarker(hook))) {
      slugs.add(slug);
    }
  }
  return slugs.values().toArray();
}

/** Returns the opening marker of a filled hook's region. */
function openHookMarker(hook: string): string {
  return `<!-- codeassembly-guidance-hook:${hook}:start -->`;
}

/**
 * Returns a skill or subagent body as the Claude render delivers it with every guard's rulebooks bound. Bound bodies
 * are rendered, so their link targets and invocation tokens are already resolved.
 */
async function readBoundBody(relativePath: string): Promise<string> {
  const deployedPath = relativePath.replace(/^subagents\//, 'agents/');
  const entry = (await renderLibrary('claude', BINDINGS))[deployedPath];
  if (entry === undefined) {
    throw new Error(`The bound Claude render does not contain ${deployedPath}`);
  }
  return entry.content;
}

/** Returns the declaring-body entry for a subagent named by its slug. */
function toSubagentBody(slug: string): DeclaringBody {
  return { label: slug, relativePath: `subagents/${slug}.md` };
}

// endregion | Helpers
