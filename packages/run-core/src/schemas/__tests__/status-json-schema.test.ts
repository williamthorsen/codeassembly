import { describe, expect, it } from 'vitest';

import { v1StatusSchema } from '../status-json-schema.js';

// -- fixtures ----------------------------------------------------------------

function minimalValid(): Record<string, unknown> {
  return {
    runId: 'test-run',
    projectSlug: 'test',
    projectRoot: '/test',
    branch: 'main',
    task: 'test task',
    startedAt: '2026-01-01T00:00:00Z',
    status: 'in_progress',
    phases: {},
  };
}

// -- valid inputs ------------------------------------------------------------

describe('v1StatusSchema', () => {
  describe('valid inputs', () => {
    it('accepts minimal valid v1', () => {
      expect(v1StatusSchema.safeParse(minimalValid()).success).toBe(true);
    });

    it('accepts all optional fields', () => {
      const full = {
        ...minimalValid(),
        ticketId: 'CODY-1',
        completedAt: '2026-01-02T00:00:00Z',
        externalPlan: true,
        mergeBaseSha: 'abc123',
        diffBase: 'origin/main',
        maxReviewRounds: 3,
        fixLowFindings: false,
        phaseDecision: {
          architecture: { run: true, reason: 'Required' },
        },
      };
      expect(v1StatusSchema.safeParse(full).success).toBe(true);
    });

    it('accepts completedAt as string', () => {
      const data = { ...minimalValid(), completedAt: '2026-01-02T00:00:00Z' };
      expect(v1StatusSchema.safeParse(data).success).toBe(true);
    });

    it('accepts completedAt as null', () => {
      const data = { ...minimalValid(), completedAt: null };
      expect(v1StatusSchema.safeParse(data).success).toBe(true);
    });

    it('accepts completedAt as undefined (absent)', () => {
      const data = minimalValid();
      expect(data).not.toHaveProperty('completedAt');
      expect(v1StatusSchema.safeParse(data).success).toBe(true);
    });

    it('accepts phaseDecision with missing reason', () => {
      const data = {
        ...minimalValid(),
        phaseDecision: { architecture: { run: true } },
      };
      expect(v1StatusSchema.safeParse(data).success).toBe(true);
    });

    it('accepts null phase entry', () => {
      const data = {
        ...minimalValid(),
        phases: { architecture: null },
      };
      expect(v1StatusSchema.safeParse(data).success).toBe(true);
    });

    it('accepts phase entry with unknown keys', () => {
      const data = {
        ...minimalValid(),
        phases: {
          architecture: { status: 'completed', impactLevel: 'high', artifact: 'arch.md' },
        },
      };
      expect(v1StatusSchema.safeParse(data).success).toBe(true);
    });
  });

  // -- run status validation -------------------------------------------------

  describe('run status validation', () => {
    it.each(['in_progress', 'completed', 'failed', 'needs_manual_review'])('accepts valid status "%s"', (status) => {
      expect(v1StatusSchema.safeParse({ ...minimalValid(), status }).success).toBe(true);
    });

    it.each(['pending', 'running', 'cancelled', 'COMPLETED', '', 'unknown'])(
      'rejects invalid status "%s"',
      (status) => {
        expect(v1StatusSchema.safeParse({ ...minimalValid(), status }).success).toBe(false);
      },
    );

    it('rejects non-string status', () => {
      expect(v1StatusSchema.safeParse({ ...minimalValid(), status: 42 }).success).toBe(false);
    });
  });

  // -- optional field type validation ----------------------------------------

  describe('optional field type validation', () => {
    it('rejects non-string ticketId', () => {
      expect(v1StatusSchema.safeParse({ ...minimalValid(), ticketId: 123 }).success).toBe(false);
    });

    it('rejects non-string completedAt', () => {
      expect(v1StatusSchema.safeParse({ ...minimalValid(), completedAt: true }).success).toBe(false);
    });

    it('rejects non-boolean externalPlan', () => {
      expect(v1StatusSchema.safeParse({ ...minimalValid(), externalPlan: 'yes' }).success).toBe(false);
    });

    it('rejects non-string mergeBaseSha', () => {
      expect(v1StatusSchema.safeParse({ ...minimalValid(), mergeBaseSha: 42 }).success).toBe(false);
    });

    it('rejects non-string diffBase', () => {
      expect(v1StatusSchema.safeParse({ ...minimalValid(), diffBase: false }).success).toBe(false);
    });

    it('rejects non-number maxReviewRounds', () => {
      expect(v1StatusSchema.safeParse({ ...minimalValid(), maxReviewRounds: '3' }).success).toBe(false);
    });

    it('rejects non-boolean fixLowFindings', () => {
      expect(v1StatusSchema.safeParse({ ...minimalValid(), fixLowFindings: 'true' }).success).toBe(false);
    });
  });

  // -- phases validation -----------------------------------------------------

  describe('phases validation', () => {
    it('rejects null phases', () => {
      expect(v1StatusSchema.safeParse({ ...minimalValid(), phases: null }).success).toBe(false);
    });

    it('rejects array phases', () => {
      expect(v1StatusSchema.safeParse({ ...minimalValid(), phases: [] }).success).toBe(false);
    });

    it('rejects string phases', () => {
      expect(v1StatusSchema.safeParse({ ...minimalValid(), phases: 'phases' }).success).toBe(false);
    });

    it('rejects phase with invalid status', () => {
      const data = {
        ...minimalValid(),
        phases: { architecture: { status: 'invalid_status' } },
      };
      expect(v1StatusSchema.safeParse(data).success).toBe(false);
    });

    it('rejects phase with invalid criticality', () => {
      const data = {
        ...minimalValid(),
        phases: { holisticReview: { status: 'completed', criticality: 'critical' } },
      };
      expect(v1StatusSchema.safeParse(data).success).toBe(false);
    });

    it('rejects phase with invalid finalCriticality', () => {
      const data = {
        ...minimalValid(),
        phases: { review: { status: 'approved', finalCriticality: 'extreme' } },
      };
      expect(v1StatusSchema.safeParse(data).success).toBe(false);
    });

    it('accepts phase with valid criticality values', () => {
      const data = {
        ...minimalValid(),
        phases: {
          holisticReview: { status: 'completed', criticality: 'low' },
          review: { status: 'approved', finalCriticality: 'none' },
        },
      };
      expect(v1StatusSchema.safeParse(data).success).toBe(true);
    });
  });

  // -- phase decisions validation --------------------------------------------

  describe('phaseDecision validation', () => {
    it('accepts undefined phaseDecision', () => {
      expect(v1StatusSchema.safeParse(minimalValid()).success).toBe(true);
    });

    it('rejects non-object phaseDecision', () => {
      const data = { ...minimalValid(), phaseDecision: 'decisions' };
      expect(v1StatusSchema.safeParse(data).success).toBe(false);
    });

    it('rejects phaseDecision entry missing run', () => {
      const data = {
        ...minimalValid(),
        phaseDecision: { architecture: { reason: 'Missing run' } },
      };
      expect(v1StatusSchema.safeParse(data).success).toBe(false);
    });

    it('rejects phaseDecision entry with wrong types', () => {
      const data = {
        ...minimalValid(),
        phaseDecision: { architecture: { run: 'yes', reason: 42 } },
      };
      expect(v1StatusSchema.safeParse(data).success).toBe(false);
    });

    it('rejects phaseDecision entry that is not an object', () => {
      const data = {
        ...minimalValid(),
        phaseDecision: { architecture: 'should run' },
      };
      expect(v1StatusSchema.safeParse(data).success).toBe(false);
    });
  });

  // -- error handling --------------------------------------------------------

  describe('error handling', () => {
    it('rejects non-object input', () => {
      expect(v1StatusSchema.safeParse('not an object').success).toBe(false);
    });

    it('rejects empty object', () => {
      expect(v1StatusSchema.safeParse({}).success).toBe(false);
    });

    it('rejects null', () => {
      expect(v1StatusSchema.safeParse(null).success).toBe(false);
    });

    it('rejects array', () => {
      expect(v1StatusSchema.safeParse([]).success).toBe(false);
    });

    it('produces meaningful error paths', () => {
      const result = v1StatusSchema.safeParse({ ...minimalValid(), status: 'unknown' });
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path.join('.'));
        expect(paths).toContain('status');
      }
    });
  });
});
