import { SHARED_DOCTRINE_CARRIERS } from './shared-doctrine-carriers.ts';

/** A doctrine that one file states and that other files must deliver to the agent. */
export interface DoctrineReach {
  /** The one content file permitted to state the doctrine. */
  readonly source: string;
  /** The string that each carrier contains exactly once: a whole line when it is a heading. */
  readonly headline: string;
  /** Phrases that a gutted doctrine would lose. */
  readonly phrases: ReadonlyArray<string>;
  /** Content files whose body, as the pipeline delivers it, must contain every phrase. */
  readonly carriers: ReadonlyArray<string>;
}

/** The guidance files that inline `guidance/shared/AGENTS.md`, one per harness. */
export const HARNESS_GUIDANCE: ReadonlyArray<string> = [
  'guidance/_harnesses/claude/CLAUDE.md',
  'guidance/_harnesses/rovo/AGENTS.md',
];

/** The shared guidance file, which states the sections that it does not share with any subagent. */
const SHARED_GUIDANCE = 'guidance/shared/AGENTS.md';

/**
 * Every doctrine whose delivery is guarded, keyed by name. A doctrine binds only when it is already in context as the
 * agent acts, so each carrier inlines it rather than linking to it: A runtime link is an optional read, and the model
 * falls back on its prior instead.
 *
 * Carriers are listed explicitly rather than discovered: The failure guarded against is a carrier dropping off a list,
 * and a discovered list would move with the bug.
 */
export const DOCTRINE_REACH: Readonly<Record<string, DoctrineReach>> = {
  'code-descriptions': {
    source: SHARED_GUIDANCE,
    headline: '## Code descriptions',
    // Pins the rule's universality, so that a restored carve-out fails. `comment-discipline.md` opens with the same
    // words, so the phrase stops at the verb at which the two differ.
    phrases: ['Every function, method, class, and component gets', 'In languages with doc-tag conventions'],
    carriers: HARNESS_GUIDANCE,
  },
  'code-style': {
    source: SHARED_GUIDANCE,
    headline: '## Style',
    phrases: [
      'fill new comments to its `max_line_length`',
      'Use long-form CLI options',
      'Name functions with a leading verb',
    ],
    carriers: HARNESS_GUIDANCE,
  },
  'comment-discipline': {
    source: '_partials/comment-discipline.md',
    headline: '## Comment discipline',
    // A doctrine stripped of its rules could still pass the heading check.
    phrases: [
      "A comment drafted for someone else's file is a source comment",
      '**1. The stranger test',
      '**2. The deletion test',
      '**3. The one-location test',
      '**4. The derivation test',
      '_future readers should note_',
      'never as it was, as it might have been, or as it is not',
    ],
    // Each skill here writes comments, judges them, or proposes their text. A subagent receives the doctrine through
    // the skills named in its `skills:` frontmatter, so it does not need a body include.
    carriers: [
      'skills/implement-plan/SKILL.md',
      'skills/respond-to-review/SKILL.md',
      'skills/review-criteria/SKILL.md',
      'skills/revise-comments/SKILL.md',
      'skills/testing-conventions/SKILL.md',
    ],
  },
  concision: {
    source: '_partials/concision.md',
    headline: '## Concision',
    // `skills/_data/concision.md` states the full principle that this section summarizes, and the two share sentences.
    // These are the summary's own, so the single-statement check would report a duplicate rather than accept the
    // pairing.
    phrases: [
      "then wastes the reader's attention and hides the signal",
      'Lead with the minimal skeleton and add a sentence only when it changes what the reader does',
    ],
    carriers: listSharedCarriers('concision'),
  },
  'file-access': {
    source: '_partials/file-access.md',
    headline: '## File access',
    phrases: ['When given an exact file path', 'STOP and report the missing path'],
    carriers: listSharedCarriers('file-access'),
  },
  // `gh` accepts `--body-file ""` without complaint and publishes its own default body, so a call site that invokes the
  // CLI with an unset path fails silently. The contract binds only when it is in context as the call is composed.
  'gh-body-file': {
    source: 'skills/_partials/gh-body-file.md',
    headline: 'Resolve the scratch directory; never reference it.',
    phrases: [
      'Resolve the scratch directory; never reference it.',
      'Name the file for its consumer.',
      'Assign the path and guard it inside the call that consumes it.',
      'tool does not perform shell expansion',
    ],
    // A file belongs here if it composes a body and hands it to a CLI through a file. The Bitbucket delegates are
    // absent because they submit a body inline through the API.
    carriers: [
      'skills/_data/gh-body-file.md',
      'skills/_data/ticket-source-resolution.md',
      'skills/add-change-record/SKILL.md',
      'skills/condense-branch/SKILL.md',
      'skills/create-commit/SKILL.md',
      'skills/create-gh-pr/SKILL.md',
      'skills/create-ticket/SKILL.md',
      'skills/groom-backlog/SKILL.md',
      'skills/merge-gh-pr/SKILL.md',
      'skills/merge-pr/SKILL.md',
      'skills/wrap-up/SKILL.md',
    ],
  },
  // Jira's Markdown and HTML conversions escape task-list brackets, so a checklist submitted through either persists as
  // bullets reading `\[ \]`. The submitting skills refer to `update-jira-ticket` only through an optional token, which
  // does not deploy it, so each point of Jira submission inlines the rule itself.
  'jira-task-list-flattening': {
    source: 'skills/_partials/jira-task-list-flattening.md',
    headline: '**Flatten task lists for Markdown and HTML clients.**',
    // Phrases from both halves of the rule, so that a partial cut down to either half fails.
    phrases: [
      '**Flatten task lists for Markdown and HTML clients.**',
      'convert task-list syntax (`- [ ]` / `- [x]`) to plain `-` bullets',
      'The `acli` path is the exception and keeps its checkboxes',
    ],
    carriers: [
      'skills/_data/ticket-source-resolution.md',
      'skills/create-ticket/SKILL.md',
      'skills/update-jira-ticket/SKILL.md',
    ],
  },
  'live-repo-writes': {
    source: SHARED_GUIDANCE,
    headline: "## Don't test write operations against a live repo",
    phrases: ['Never exercise destructive or side-effecting operations', 'I can just clean up afterward'],
    carriers: HARNESS_GUIDANCE,
  },
  // Bitbucket Cloud reads a 2-space nested item as a sibling and reports nothing, so the rule binds only when it is in
  // context as a body is composed.
  'nested-list-indent': {
    source: 'skills/_partials/nested-list-indent.md',
    headline: 'Indent a nested list item 4 spaces',
    phrases: [
      'Indent a nested list item 4 spaces',
      'the only way to notice is to view the published text',
      'the formatter in use sets the indent',
      // The example's nesting, which a code fence protects from Prettier's normalization to the parent's column.
      '- parent\n    - child\n        - grandchild\n',
    ],
    // Each step that composes a body rendered by Bitbucket, plus the data entry read by both Bitbucket write delegates.
    // Branch commit bodies are absent by decision: Bitbucket renders a commit message too, but a squash merge discards
    // the branch's own commits, so the commit body that arrives in the default branch is the merge body composed by
    // `merge-pr`. The delegates are absent because they submit a body rather than compose one.
    carriers: ['skills/_data/bitbucket-pr-access.md', 'skills/merge-pr/SKILL.md', 'skills/summarize-change/SKILL.md'],
  },
  'plain-speech': {
    source: '_partials/plain-speech.md',
    // Headingless, because subagents inline it inside `<HARD-GATE>` blocks where a heading would be wrong.
    headline: 'Speak plainly in practical documentation',
    // One phrase per statement that the rule makes operative, plus one of the verb pairs that the rule keeps as
    // illustration.
    phrases: [
      "Write for a reader who does not share the author's first language",
      'The test is about structure, not vocabulary',
      'in code comments, and in chat',
      'The one carve-out is presentational text',
      'This rule takes precedence over the register of the surrounding documents',
      'still be **mannered prose**',
      'A verb that fits any subject and object does not state any relation between them',
      'an imperative there would give the action to the reader',
      'a tool **reports** its findings (not "the findings arrive")',
    ],
    carriers: [...listSharedCarriers('plain-speech'), 'skills/revise-prose/SKILL.md'],
  },
  // The rule applies only when it is already in context at the moment prose is composed.
  'prose-line-breaks': {
    source: '_partials/prose-line-breaks.md',
    headline: 'No hard line breaks',
    phrases: [
      'No hard line breaks',
      'Do not insert newlines to wrap at a column width',
      "the project's formatter decides instead",
    ],
    // Delivery is narrower than application. The partial applies to any generated Markdown, saved artifacts included,
    // but this list contains a body only when it is in context as prose is composed for somewhere outside the
    // repository: a commit body, or a GitHub issue, pull request, or comment. A body that composes only into a local
    // artifact is absent by decision, not by oversight, and one that passes along prose composed by someone else
    // belongs with that composer instead.
    carriers: [
      'guidance/rulebooks/commit-conventions.md',
      'skills/create-commit/SKILL.md',
      'skills/create-ticket/SKILL.md',
      'skills/design-and-plan/SKILL.md',
      'skills/refine-plan/SKILL.md',
      'skills/summarize-change/SKILL.md',
      'skills/wrap-up/SKILL.md',
      'subagents/entry-drafter.md',
    ],
  },
  'shell-commands': {
    source: '_partials/shell-commands.md',
    headline: '## Shell commands',
    phrases: ['Compound `cd &&` commands'],
    carriers: listSharedCarriers('shell-commands'),
  },
  'technical-recommendations': {
    source: '_partials/technical-recommendations.md',
    headline: '## Technical recommendations',
    phrases: [
      'Default to current best practices',
      'name the solutions that current best practice applies',
      'Label an option that departs from all of them as non-standard',
      'rather than an addition that works around the current contract',
      'Prefer CLI tools over web UI instructions',
    ],
    carriers: listSharedCarriers('technical-recommendations'),
  },
  // An agent choosing a work type follows the test only when it is in context at that moment.
  'work-type-choice': {
    source: '_partials/work-type-choice.md',
    headline: 'Whom a change affects decides its type',
    // A gutted test could otherwise still pass on its opening alone.
    phrases: [
      'Whom a change affects decides its type',
      'Never infer a type from how earlier changes were typed',
      '`fix` requires a defect that a consumer meets',
      'Repo-agnostic guidance is source code',
      'Guidance on working in one repository is `ai`',
      'Guidance to agents is never `docs`',
    ],
    carriers: [
      'guidance/rulebooks/commit-conventions.md',
      'skills/create-commit/SKILL.md',
      'skills/create-ticket/SKILL.md',
      'skills/merge-pr/SKILL.md',
      'skills/summarize-change/SKILL.md',
    ],
  },
};

// region | Helpers

/**
 * Returns the carriers of a section that `guidance/shared/AGENTS.md` shares with subagents: the subagents that its
 * role's work needs it in, and the harness guidance files that deliver it to every interactive session.
 */
function listSharedCarriers(name: string): ReadonlyArray<string> {
  const subagents = SHARED_DOCTRINE_CARRIERS[name] ?? [];
  return [...subagents.map((slug) => `subagents/${slug}.md`), ...HARNESS_GUIDANCE];
}

// endregion | Helpers
