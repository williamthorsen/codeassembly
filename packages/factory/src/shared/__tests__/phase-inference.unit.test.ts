import type { PhaseDecision, Phases } from 'codeassembly-run-core';
import { describe, expect, it } from 'vitest';

import { createInProgressReviewPhases, emptyPhases } from '../../test-utils/fixtures.js';
import { findCurrentPhase, findPhaseDecision, isPhaseEvaluated, isPhasePresentInData } from '../phase-inference.js';

/** Helper to create a phase decision entry. */
function decision(run: boolean): PhaseDecision {
  return { run, reason: undefined };
}

describe('findCurrentPhase', () => {
  it('returns architecture when phases is empty and phaseDecisions.architecture.run is true', () => {
    const result = findCurrentPhase(emptyPhases(), { architecture: decision(true) }, 'in_progress');
    expect(result).toBe('architecture');
  });

  it('returns planning when architecture has data but planning does not', () => {
    const phases: Phases = {
      ...emptyPhases(),
      architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
    };
    const decisions = {
      architecture: decision(true),
      planning: decision(true),
    };
    const result = findCurrentPhase(phases, decisions, 'in_progress');
    expect(result).toBe('planning');
  });

  it('skips a phase when its phaseDecisions entry has run: false', () => {
    const decisions = {
      architecture: decision(false),
      planning: decision(true),
    };
    const result = findCurrentPhase(emptyPhases(), decisions, 'in_progress');
    expect(result).toBe('planning');
  });

  it('returns the first phase without data when phaseDecisions is undefined', () => {
    const result = findCurrentPhase(emptyPhases(), undefined, 'in_progress');
    expect(result).toBe('architecture');
  });

  it('returns the first phase without data when phaseDecisions is empty', () => {
    const result = findCurrentPhase(emptyPhases(), {}, 'in_progress');
    expect(result).toBe('architecture');
  });

  it('handles the review-cycle key (v2): skips review when review-cycle.run is false', () => {
    const phases: Phases = {
      ...emptyPhases(),
      architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
      planning: { status: 'completed', stepCount: 7, artifacts: ['plan.md'] },
      implementation: { status: 'completed', artifact: 'code.md', qualityGates: undefined },
    };
    const decisions = {
      architecture: decision(true),
      planning: decision(true),
      implementation: decision(true),
      'review-cycle': decision(false),
    };
    const result = findCurrentPhase(phases, decisions, 'in_progress');
    expect(result).toBe('simplifier');
  });

  it('handles the review key (v1 fallback): returns review when review.run is true and review-cycle is absent', () => {
    const phases: Phases = {
      ...emptyPhases(),
      architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
      planning: { status: 'completed', stepCount: 7, artifacts: ['plan.md'] },
      implementation: { status: 'completed', artifact: 'code.md', qualityGates: undefined },
    };
    const decisions = {
      architecture: decision(true),
      planning: decision(true),
      implementation: decision(true),
      review: decision(true),
    };
    const result = findCurrentPhase(phases, decisions, 'in_progress');
    expect(result).toBe('review');
  });

  it('returns undefined for completed runs', () => {
    const result = findCurrentPhase(emptyPhases(), { architecture: decision(true) }, 'completed');
    expect(result).toBeUndefined();
  });

  it('returns undefined for failed runs', () => {
    const result = findCurrentPhase(emptyPhases(), { architecture: decision(true) }, 'failed');
    expect(result).toBeUndefined();
  });

  it('returns undefined for needs_manual_review runs', () => {
    const result = findCurrentPhase(emptyPhases(), { architecture: decision(true) }, 'needs_manual_review');
    expect(result).toBeUndefined();
  });

  it('skips simplifier when codeSimplifier has data with ran: false', () => {
    const phases: Phases = {
      ...emptyPhases(),
      architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
      planning: { status: 'completed', stepCount: 7, artifacts: ['plan.md'] },
      implementation: { status: 'completed', artifact: 'code.md', qualityGates: undefined },
      parallelReview: {
        aggregatedCriticality: 'low',
        reviewRoundsUsed: 1,
        reviewers: {
          'correctness-reviewer': {
            ran: true,
            status: 'completed',
            criticality: 'low',
            reason: undefined,
            reReviewCriticality: undefined,
            reReviewError: undefined,
          },
        },
        coderFixCycleRan: false,
        selectiveReReview: undefined,
      },
      codeSimplifier: { ran: false, actionableFindings: false, coderFixCycleRan: false, artifact: undefined },
    };
    const result = findCurrentPhase(phases, {}, 'in_progress');
    expect(result).toBe('holistic');
  });

  it('does not advance past simplifier when codeSimplifier.status is in_progress', () => {
    const phases: Phases = {
      ...emptyPhases(),
      architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
      planning: { status: 'completed', stepCount: 7, artifacts: ['plan.md'] },
      implementation: { status: 'completed', artifact: 'code.md', qualityGates: undefined },
      parallelReview: {
        status: 'completed',
        aggregatedCriticality: 'low',
        reviewRoundsUsed: 1,
        reviewers: {},
        coderFixCycleRan: false,
        selectiveReReview: undefined,
      },
      codeSimplifier: {
        ran: false,
        actionableFindings: false,
        coderFixCycleRan: false,
        artifact: undefined,
        status: 'in_progress',
        startedAt: '2026-01-01T01:00:00Z',
      },
    };
    const result = findCurrentPhase(phases, {}, 'in_progress');
    expect(result).toBe('simplifier');
  });

  it('does not advance past review when parallelReview.status is in_progress', () => {
    const phases = createInProgressReviewPhases();
    const result = findCurrentPhase(phases, {}, 'in_progress');
    expect(result).toBe('review');
  });

  it('returns undefined when all phases have data', () => {
    const phases: Phases = {
      architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
      planning: { status: 'completed', stepCount: 7, artifacts: ['plan.md'] },
      implementation: { status: 'completed', artifact: 'code.md', qualityGates: undefined },
      parallelReview: {
        aggregatedCriticality: 'low',
        reviewRoundsUsed: 1,
        reviewers: {},
        coderFixCycleRan: false,
        selectiveReReview: undefined,
      },
      review: undefined,
      codeSimplifier: { ran: true, actionableFindings: false, coderFixCycleRan: false, artifact: undefined },
      holisticReview: {
        status: 'completed',
        criticality: 'low',
        reReviewCriticality: undefined,
        coderFixCycleRan: false,
        reviewRoundsUsed: 1,
        artifact: undefined,
      },
    };
    const result = findCurrentPhase(phases, {}, 'in_progress');
    expect(result).toBeUndefined();
  });
});

describe('isPhasePresentInData', () => {
  it('returns false for summary regardless of phases', () => {
    const phases: Phases = {
      architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
      planning: { status: 'completed', stepCount: 7, artifacts: ['plan.md'] },
      implementation: { status: 'completed', artifact: 'code.md', qualityGates: undefined },
      parallelReview: {
        aggregatedCriticality: 'low',
        reviewRoundsUsed: 1,
        reviewers: {},
        coderFixCycleRan: false,
        selectiveReReview: undefined,
      },
      review: undefined,
      codeSimplifier: { ran: true, actionableFindings: false, coderFixCycleRan: false, artifact: undefined },
      holisticReview: {
        status: 'completed',
        criticality: 'low',
        reReviewCriticality: undefined,
        coderFixCycleRan: false,
        reviewRoundsUsed: 1,
        artifact: undefined,
      },
    };
    expect(isPhasePresentInData('summary', phases)).toBe(false);
  });

  it('returns true for simplifier only when codeSimplifier.ran is true', () => {
    expect(
      isPhasePresentInData('simplifier', {
        ...emptyPhases(),
        codeSimplifier: { ran: true, actionableFindings: false, coderFixCycleRan: false, artifact: undefined },
      }),
    ).toBe(true);

    expect(
      isPhasePresentInData('simplifier', {
        ...emptyPhases(),
        codeSimplifier: { ran: false, actionableFindings: false, coderFixCycleRan: false, artifact: undefined },
      }),
    ).toBe(false);

    expect(isPhasePresentInData('simplifier', emptyPhases())).toBe(false);
  });

  it('returns true for simplifier when codeSimplifier.status is in_progress', () => {
    expect(
      isPhasePresentInData('simplifier', {
        ...emptyPhases(),
        codeSimplifier: {
          ran: false,
          actionableFindings: false,
          coderFixCycleRan: false,
          artifact: undefined,
          status: 'in_progress',
        },
      }),
    ).toBe(true);
  });

  it('returns true for review when parallelReview is defined', () => {
    expect(
      isPhasePresentInData('review', {
        ...emptyPhases(),
        parallelReview: {
          aggregatedCriticality: 'low',
          reviewRoundsUsed: 1,
          reviewers: {},
          coderFixCycleRan: false,
          selectiveReReview: undefined,
        },
      }),
    ).toBe(true);
  });

  it('returns true for review when legacy review is defined and parallelReview is undefined', () => {
    expect(
      isPhasePresentInData('review', {
        ...emptyPhases(),
        review: { status: 'approved', iterations: 2, finalCriticality: 'low' },
      }),
    ).toBe(true);
  });

  it('returns true for review when parallelReview.status is in_progress', () => {
    const phases = createInProgressReviewPhases();
    expect(isPhasePresentInData('review', phases)).toBe(true);
  });
});

describe('isPhaseEvaluated', () => {
  it('returns true for simplifier when codeSimplifier has data with ran: false', () => {
    expect(
      isPhaseEvaluated('simplifier', {
        ...emptyPhases(),
        codeSimplifier: { ran: false, actionableFindings: false, coderFixCycleRan: false, artifact: undefined },
      }),
    ).toBe(true);
  });

  it('returns true for simplifier when codeSimplifier has data with ran: true', () => {
    expect(
      isPhaseEvaluated('simplifier', {
        ...emptyPhases(),
        codeSimplifier: { ran: true, actionableFindings: false, coderFixCycleRan: false, artifact: undefined },
      }),
    ).toBe(true);
  });

  it('returns false for simplifier when codeSimplifier is undefined', () => {
    expect(isPhaseEvaluated('simplifier', emptyPhases())).toBe(false);
  });

  it('returns false for simplifier when codeSimplifier.status is in_progress', () => {
    expect(
      isPhaseEvaluated('simplifier', {
        ...emptyPhases(),
        codeSimplifier: {
          ran: false,
          actionableFindings: false,
          coderFixCycleRan: false,
          artifact: undefined,
          status: 'in_progress',
        },
      }),
    ).toBe(false);
  });

  it('returns true for simplifier when codeSimplifier.status is completed', () => {
    expect(
      isPhaseEvaluated('simplifier', {
        ...emptyPhases(),
        codeSimplifier: {
          ran: true,
          actionableFindings: false,
          coderFixCycleRan: false,
          artifact: undefined,
          status: 'completed',
        },
      }),
    ).toBe(true);
  });

  it('returns false for summary regardless of phases', () => {
    const phases: Phases = {
      architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
      planning: { status: 'completed', stepCount: 7, artifacts: ['plan.md'] },
      implementation: { status: 'completed', artifact: 'code.md', qualityGates: undefined },
      parallelReview: {
        aggregatedCriticality: 'low',
        reviewRoundsUsed: 1,
        reviewers: {},
        coderFixCycleRan: false,
        selectiveReReview: undefined,
      },
      review: undefined,
      codeSimplifier: { ran: true, actionableFindings: false, coderFixCycleRan: false, artifact: undefined },
      holisticReview: {
        status: 'completed',
        criticality: 'low',
        reReviewCriticality: undefined,
        coderFixCycleRan: false,
        reviewRoundsUsed: 1,
        artifact: undefined,
      },
    };
    expect(isPhaseEvaluated('summary', phases)).toBe(false);
  });

  it('returns true for non-simplifier completed phases', () => {
    const phases: Phases = {
      ...emptyPhases(),
      architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
    };
    expect(isPhaseEvaluated('architecture', phases)).toBe(true);
    expect(isPhaseEvaluated('planning', phases)).toBe(false);
  });

  describe('in_progress status handling', () => {
    it('returns false for review when parallelReview.status is in_progress', () => {
      const phases = createInProgressReviewPhases();
      expect(isPhaseEvaluated('review', phases)).toBe(false);
    });

    it('returns true for review when parallelReview.status is undefined (backward compat)', () => {
      const phases: Phases = {
        ...emptyPhases(),
        parallelReview: {
          aggregatedCriticality: 'low',
          reviewRoundsUsed: 1,
          reviewers: {},
          coderFixCycleRan: false,
          selectiveReReview: undefined,
        },
      };
      expect(isPhaseEvaluated('review', phases)).toBe(true);
    });

    it('returns true for review when parallelReview.status is completed', () => {
      const phases: Phases = {
        ...emptyPhases(),
        parallelReview: {
          status: 'completed',
          aggregatedCriticality: 'low',
          reviewRoundsUsed: 1,
          reviewers: {},
          coderFixCycleRan: false,
          selectiveReReview: undefined,
        },
      };
      expect(isPhaseEvaluated('review', phases)).toBe(true);
    });

    it('returns false for architecture when status is in_progress', () => {
      const phases: Phases = {
        ...emptyPhases(),
        architecture: { status: 'in_progress', impactLevel: undefined, artifact: undefined },
      };
      expect(isPhaseEvaluated('architecture', phases)).toBe(false);
    });

    it('returns false for planning when status is in_progress', () => {
      const phases: Phases = {
        ...emptyPhases(),
        planning: { status: 'in_progress', stepCount: undefined, artifacts: undefined },
      };
      expect(isPhaseEvaluated('planning', phases)).toBe(false);
    });

    it('returns false for implementation when status is in_progress', () => {
      const phases: Phases = {
        ...emptyPhases(),
        implementation: { status: 'in_progress', artifact: undefined, qualityGates: undefined },
      };
      expect(isPhaseEvaluated('implementation', phases)).toBe(false);
    });

    it('returns false for holistic when status is in_progress', () => {
      const phases: Phases = {
        ...emptyPhases(),
        holisticReview: {
          status: 'in_progress',
          criticality: undefined,
          reReviewCriticality: undefined,
          coderFixCycleRan: false,
          reviewRoundsUsed: 0,
          artifact: undefined,
        },
      };
      expect(isPhaseEvaluated('holistic', phases)).toBe(false);
    });
  });
});

describe('findPhaseDecision', () => {
  it('tries review-cycle before review for the review phase', () => {
    const decisions = {
      'review-cycle': { run: false, reason: 'v2 skip' },
      review: { run: true, reason: 'v1 run' },
    };
    const result = findPhaseDecision('review', decisions);
    expect(result).toEqual({ run: false, reason: 'v2 skip' });
  });

  it('falls back to review key when review-cycle is absent', () => {
    const decisions = {
      review: { run: true, reason: 'v1 run' },
    };
    const result = findPhaseDecision('review', decisions);
    expect(result).toEqual({ run: true, reason: 'v1 run' });
  });

  it('returns undefined when phaseDecisions is undefined', () => {
    const result = findPhaseDecision('architecture', undefined);
    expect(result).toBeUndefined();
  });

  it('returns undefined when key is not present in phaseDecisions', () => {
    const result = findPhaseDecision('architecture', {});
    expect(result).toBeUndefined();
  });

  it('uses PhaseName directly as key for non-review phases', () => {
    const decisions = { architecture: { run: true, reason: 'proceed' } };
    const result = findPhaseDecision('architecture', decisions);
    expect(result).toEqual({ run: true, reason: 'proceed' });
  });
});
