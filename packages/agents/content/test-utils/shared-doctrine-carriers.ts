import { listGovernedSubagents } from './list-governed-subagents.ts';

/** Subagents whose tool grant names no shell, so guidance on writing a command is weight paid for no benefit. */
const SHELL_LESS_SUBAGENTS: ReadonlySet<string> = new Set(['prose-reviser', 'savings-analyzer']);

/**
 * Subagents whose genre is served by dropping true facts, which the shared concision rule forbids: it tells a writer
 * to keep every decision, constraint, and actionable fact and to compose tight rather than trim. A lede is selected
 * from a change whose facts are nearly all accurate and nearly all beneath the reader's notice, so the rule reaches
 * these two as a licence to keep them. Each states its own rule instead: the drafter in "What to leave out", and the
 * cutter in the assignment that admits a candidate only where the reader acts on it.
 */
const CUTTING_SUBAGENTS: ReadonlySet<string> = new Set(['lede-cutter', 'lede-drafter']);

/**
 * Which subagents each shared-guidance section must reach, keyed by the partial that carries it. A section
 * `guidance/shared/AGENTS.md` keeps inline reaches no subagent and so appears here under no key.
 *
 * A role's population is read from the `subagents/` directory wherever the section governs every subagent, so one
 * added later is covered the day it appears. Where the section is role-scoped the population is written out: the
 * failure guarded against is a subagent dropping off, and a list discovered from the bodies would move with the bug.
 */
export const SHARED_DOCTRINE_CARRIERS: Readonly<Record<string, ReadonlyArray<string>>> = {
  'code-descriptions': listCodeFacingSubagents(),
  'code-style': listCodeFacingSubagents(),
  concision: listGovernedSubagents().filter((slug) => !CUTTING_SUBAGENTS.has(slug)),
  'file-access': listGovernedSubagents(),
  'live-repo-writes': ['orchestrated-coder'],
  'plain-speech': listGovernedSubagents(),
  'shell-commands': listGovernedSubagents().filter((slug) => !SHELL_LESS_SUBAGENTS.has(slug)),
  'technical-recommendations': listApproachChoosingSubagents(),
};

// region | Helpers

/** Returns the subagents that originate or validate a technical approach. */
function listApproachChoosingSubagents(): ReadonlyArray<string> {
  return [
    'orchestrated-architect',
    'orchestrated-coder',
    'orchestrated-planner',
    'plan-reviewer',
    'plan-reviser',
    'planner',
  ];
}

/**
 * Returns the subagents that write code or judge it against a standard. The population coincides with
 * `COMMENT_AUTHORING_SUBAGENTS`, which selects on whether a subagent authors or judges comments; the two lists are
 * independent, and either may take a member the other does not.
 */
function listCodeFacingSubagents(): ReadonlyArray<string> {
  return [
    'aspect-code-reviewer',
    'aspect-silent-failure-reviewer',
    'aspect-test-reviewer',
    'code-simplification-reviewer',
    'orchestrated-coder',
    'orchestrated-reviewer',
  ];
}

// endregion | Helpers
