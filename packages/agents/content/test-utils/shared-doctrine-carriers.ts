import { listGovernedSubagents } from './list-governed-subagents.ts';

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
  concision: listGovernedSubagents(),
  'file-access': listGovernedSubagents(),
  'live-repo-writes': ['orchestrated-coder'],
  'plain-speech': listGovernedSubagents(),
  'shell-commands': listGovernedSubagents().filter((slug) => slug !== 'savings-analyzer'),
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
