import { convertPrompt, type ConvertResult } from '../convert/convert-prompt.ts';
import { checkCoverage } from '../coverage-map/check-coverage.ts';
import type { CoverageMap } from '../coverage-map/coverage-map-schema.ts';
import { formatCoverageResult } from '../coverage-map/format-coverage-result.ts';

/** The number of coverage checks that a session answers. */
export const MAX_COVERAGE_CHECKS = 3;

/** The number of drafts that a session accepts. */
export const MAX_SUBMISSIONS = 5;

/** A step of the conversion that the session reports as it happens. */
export type SessionEvent =
  | {
      readonly type: 'coverage-checked';
      readonly check: number;
      readonly unmapped: number;
      readonly quoteProblems: number;
    }
  | {
      readonly type: 'draft-submitted';
      readonly submission: number;
      readonly outcome: 'config' | 'out-of-scope' | 'problems';
      readonly problems: number;
    };

/** The state of one conversion behind its tools: Each method returns the text that the tool answers the agent with. */
export interface ConversionSession {
  /**
   * Whether the conversion has ended: A config was accepted, the prompt was recorded as out of scope, or the last
   * submission was taken. It stays true through later submissions.
   */
  readonly isFinished: boolean;
  /** The outcome of the last accepted submission, or `undefined` before the first. */
  readonly result: ConvertResult | undefined;
  checkCoverage(map: CoverageMap): string;
  submitDraft(draftText: string): string;
}

/**
 * Creates the session for converting `prompt`, whose file is named `name`. It answers {@link MAX_COVERAGE_CHECKS}
 * coverage checks and accepts {@link MAX_SUBMISSIONS} drafts, and refuses every call after those.
 */
export function createConversionSession({
  prompt,
  name,
  onEvent,
}: {
  prompt: string;
  name: string;
  onEvent: (event: SessionEvent) => void;
}): ConversionSession {
  let checks = 0;
  let submissions = 0;
  let result: ConvertResult | undefined;
  let isFinished = false;

  return {
    checkCoverage(map) {
      if (checks >= MAX_COVERAGE_CHECKS) {
        return 'The coverage checks are used up. Go on to the next check of the draft.';
      }
      checks += 1;
      const coverage = checkCoverage(prompt, map);
      onEvent({
        type: 'coverage-checked',
        check: checks,
        unmapped: coverage.unmapped.length,
        quoteProblems: coverage.quoteProblems.length,
      });
      const lines = formatCoverageResult(prompt, coverage);
      if (lines.length === 0) return 'Every block of the prompt is mapped. Go on to the next check of the draft.';
      const left = MAX_COVERAGE_CHECKS - checks;
      const next =
        left === 0
          ? 'That was the last coverage check. Go on to the next check of the draft.'
          : `Map every listed block, lengthen every listed quote, and check again. ${describeCount(left, 'check')} left.`;
      return [...lines, next].join('\n');
    },

    submitDraft(draftText) {
      if (submissions >= MAX_SUBMISSIONS) return 'No more drafts are accepted. End your turn.';
      submissions += 1;
      result = convertPrompt(prompt, draftText, name);
      isFinished ||= submissions >= MAX_SUBMISSIONS || result.ok || 'outOfScope' in result;
      const problems = 'problems' in result ? result.problems : [];
      onEvent({
        type: 'draft-submitted',
        submission: submissions,
        outcome: result.ok ? 'config' : 'outOfScope' in result ? 'out-of-scope' : 'problems',
        problems: problems.length,
      });
      if (result.ok) return 'The config is accepted. End your turn.';
      if ('outOfScope' in result) return 'The prompt is recorded as out of scope. End your turn.';
      const left = MAX_SUBMISSIONS - submissions;
      const lines = problems.map(({ path, message }) => (path === '' ? message : `${path}: ${message}`));
      const next =
        left === 0
          ? 'That was the last submission: No more drafts are accepted. End your turn.'
          : `Correct every listed entry and submit the draft again. ${describeCount(left, 'submission')} left.`;
      return [...lines, next].join('\n');
    },

    get isFinished() {
      return isFinished;
    },

    get result() {
      return result;
    },
  };
}

// region | Helpers
/** Describes a count of a noun, such as "1 check" or "2 checks". */
function describeCount(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
// endregion | Helpers
