import { listGovernedSubagents } from './list-governed-subagents.ts';

/**
 * Subagents whose tool grant does not name a shell, so guidance on writing a command adds length without any benefit.
 */
const SHELL_LESS_SUBAGENTS: ReadonlySet<string> = new Set(['prose-reviser']);

/**
 * Subagents whose genre requires dropping true facts, which the shared concision rule forbids: It tells a writer
 * to keep every decision, constraint, and actionable fact and to compose tight rather than trim. Because an entry list
 * reports a change whose facts are nearly all accurate and nearly all beneath the reader's notice, the drafter would
 * read the rule as a license to keep them. It states its own rule instead, in "What to leave out".
 */
const CUTTING_SUBAGENTS: ReadonlySet<string> = new Set(['entry-drafter']);

/**
 * Subagents whose return is lists of items that the dispatching session folds into artifacts of its own, so the
 * composition rule does not govern any text that a reader keeps, and every dispatch spends tokens on each line of it.
 */
const LIST_RETURNING_SUBAGENTS: ReadonlySet<string> = new Set(['handoff-reviewer']);

/**
 * The subagents to which each shared-guidance section must be delivered, keyed by the partial that contains it. A
 * section that `guidance/shared/AGENTS.md` keeps inline is not delivered to any subagent and so does not appear here
 * under any key.
 *
 * A role's population is read from the `subagents/` directory wherever the section governs every subagent. The tests
 * cover one added later as soon as its file exists. When the section is role-scoped, the population is written out:
 * The failure guarded against is a subagent dropping off, and a list discovered from the bodies would change along
 * with the bug.
 */
export const SHARED_DOCTRINE_CARRIERS: Readonly<Record<string, ReadonlyArray<string>>> = {
  concision: listGovernedSubagents().filter(
    (slug) => !CUTTING_SUBAGENTS.has(slug) && !LIST_RETURNING_SUBAGENTS.has(slug),
  ),
  'file-access': listGovernedSubagents(),
  'plain-speech': listGovernedSubagents(),
  'shell-commands': listGovernedSubagents().filter((slug) => !SHELL_LESS_SUBAGENTS.has(slug)),
  'technical-recommendations': listApproachChoosingSubagents(),
};

// region | Helpers

/** Returns the subagents that originate or validate a technical approach. */
function listApproachChoosingSubagents(): ReadonlyArray<string> {
  return ['plan-reviewer', 'plan-reviser', 'ticket-assessor'];
}

// endregion | Helpers
