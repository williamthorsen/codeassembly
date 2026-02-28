import { describe, expect, it } from 'vitest';

import {
  artifactEntrySchema,
  criticalitySchema,
  phaseDecisionMapSchema,
  phaseDecisionSchema,
  phaseEntrySchema,
  phasesSchema,
  phaseStatusSchema,
  runStatusSchema,
  v2ConfigSchema,
  v2ContextSchema,
  v2RunIndexSchema,
} from '../run-index-schema.js';

// -- fixtures ----------------------------------------------------------------

function minimalContext(): Record<string, unknown> {
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

function minimalV2(): Record<string, unknown> {
  return {
    version: 2,
    context: minimalContext(),
    config: {},
  };
}

function fullArtifact(): Record<string, unknown> {
  return {
    filename: 'architecture.md',
    role: 'Architecture document',
    roleType: 'architecture',
    agent: 'architect',
    type: 'markdown',
    phase: 'architecture',
    createdAt: '2026-01-01T00:00:00Z',
  };
}

// -- enum schemas ------------------------------------------------------------

describe('runStatusSchema', () => {
  it.each(['in_progress', 'completed', 'failed', 'needs_manual_review'])('accepts "%s"', (value) => {
    expect(runStatusSchema.safeParse(value).success).toBe(true);
  });

  it.each(['pending', 'running', 'cancelled', 'COMPLETED', '', 'unknown'])('rejects "%s"', (value) => {
    expect(runStatusSchema.safeParse(value).success).toBe(false);
  });
});

describe('phaseStatusSchema', () => {
  it.each(['completed', 'skipped', 'failed', 'in_progress', 'approved'])('accepts "%s"', (value) => {
    expect(phaseStatusSchema.safeParse(value).success).toBe(true);
  });

  it.each(['pending', 'running', 'cancelled', 'COMPLETED', ''])('rejects "%s"', (value) => {
    expect(phaseStatusSchema.safeParse(value).success).toBe(false);
  });
});

describe('criticalitySchema', () => {
  it.each(['none', 'low', 'medium', 'high'])('accepts "%s"', (value) => {
    expect(criticalitySchema.safeParse(value).success).toBe(true);
  });

  it.each(['critical', 'extreme', 'NONE', ''])('rejects "%s"', (value) => {
    expect(criticalitySchema.safeParse(value).success).toBe(false);
  });
});

// -- phase entry -------------------------------------------------------------

describe('phaseEntrySchema', () => {
  it('accepts empty object', () => {
    expect(phaseEntrySchema.safeParse({}).success).toBe(true);
  });

  it('accepts valid status', () => {
    expect(phaseEntrySchema.safeParse({ status: 'completed' }).success).toBe(true);
  });

  it('rejects invalid status', () => {
    expect(phaseEntrySchema.safeParse({ status: 'bad' }).success).toBe(false);
  });

  it('accepts null status', () => {
    expect(phaseEntrySchema.safeParse({ status: null }).success).toBe(true);
  });

  it.each(['status', 'criticality', 'finalCriticality', 'aggregatedCriticality'])('accepts null for %s', (field) => {
    expect(phaseEntrySchema.safeParse({ [field]: null }).success).toBe(true);
  });

  it.each(['status', 'criticality', 'finalCriticality', 'aggregatedCriticality'])(
    'accepts undefined (absent) for %s',
    (field) => {
      const data: Record<string, unknown> = { otherField: 'value' };
      // Field is absent, which .partial() + .nullish() should allow.
      expect(data).not.toHaveProperty(field);
      expect(phaseEntrySchema.safeParse(data).success).toBe(true);
    },
  );

  it('accepts valid criticality', () => {
    expect(phaseEntrySchema.safeParse({ criticality: 'high' }).success).toBe(true);
  });

  it('rejects invalid criticality', () => {
    expect(phaseEntrySchema.safeParse({ criticality: 'extreme' }).success).toBe(false);
  });

  it('accepts valid finalCriticality', () => {
    expect(phaseEntrySchema.safeParse({ finalCriticality: 'low' }).success).toBe(true);
  });

  it('rejects invalid finalCriticality', () => {
    expect(phaseEntrySchema.safeParse({ finalCriticality: 'extreme' }).success).toBe(false);
  });

  it('accepts valid aggregatedCriticality', () => {
    expect(phaseEntrySchema.safeParse({ aggregatedCriticality: 'medium' }).success).toBe(true);
  });

  it('rejects invalid aggregatedCriticality', () => {
    expect(phaseEntrySchema.safeParse({ aggregatedCriticality: 'extreme' }).success).toBe(false);
  });

  it('passes through unknown keys', () => {
    const result = phaseEntrySchema.safeParse({
      status: 'completed',
      impactLevel: 'high',
      artifact: 'architecture.md',
      stepCount: 7,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveProperty('impactLevel', 'high');
      expect(result.data).toHaveProperty('artifact', 'architecture.md');
      expect(result.data).toHaveProperty('stepCount', 7);
    }
  });
});

// -- phases record -----------------------------------------------------------

describe('phasesSchema', () => {
  it('accepts empty object', () => {
    expect(phasesSchema.safeParse({}).success).toBe(true);
  });

  it('accepts null phase entry (phase not yet reached)', () => {
    expect(phasesSchema.safeParse({ architecture: null }).success).toBe(true);
  });

  it('accepts valid phase entry', () => {
    expect(phasesSchema.safeParse({ architecture: { status: 'completed' } }).success).toBe(true);
  });

  it('rejects string phase entry', () => {
    expect(phasesSchema.safeParse({ architecture: 'completed' }).success).toBe(false);
  });

  it('rejects non-object phases', () => {
    expect(phasesSchema.safeParse('phases').success).toBe(false);
  });

  it('accepts unknown phase names', () => {
    expect(phasesSchema.safeParse({ customPhase: { status: 'in_progress' } }).success).toBe(true);
  });
});

// -- phase decisions ---------------------------------------------------------

describe('phaseDecisionSchema', () => {
  it('accepts entry with run and reason', () => {
    expect(phaseDecisionSchema.safeParse({ run: true, reason: 'Required' }).success).toBe(true);
  });

  it('accepts entry with run only', () => {
    expect(phaseDecisionSchema.safeParse({ run: true }).success).toBe(true);
  });

  it('rejects entry missing run', () => {
    expect(phaseDecisionSchema.safeParse({ reason: 'Missing run' }).success).toBe(false);
  });

  it('rejects entry with non-boolean run', () => {
    expect(phaseDecisionSchema.safeParse({ run: 'yes' }).success).toBe(false);
  });

  it('rejects entry with non-string reason', () => {
    expect(phaseDecisionSchema.safeParse({ run: true, reason: 42 }).success).toBe(false);
  });

  it('passes through unknown keys like disposition', () => {
    const result = phaseDecisionSchema.safeParse({
      run: true,
      disposition: 'executed',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveProperty('disposition', 'executed');
    }
  });
});

describe('phaseDecisionMapSchema', () => {
  it('accepts undefined', () => {
    expect(phaseDecisionMapSchema.safeParse(undefined).success).toBe(true);
  });

  it('accepts valid map', () => {
    const map = { architecture: { run: true, reason: 'Test' } };
    expect(phaseDecisionMapSchema.safeParse(map).success).toBe(true);
  });

  it('rejects non-object value', () => {
    expect(phaseDecisionMapSchema.safeParse('decisions').success).toBe(false);
  });

  it('rejects entry that is not an object', () => {
    expect(phaseDecisionMapSchema.safeParse({ architecture: 'should run' }).success).toBe(false);
  });
});

// -- artifact entry ----------------------------------------------------------

describe('artifactEntrySchema', () => {
  it('accepts entry with all required fields', () => {
    expect(artifactEntrySchema.safeParse(fullArtifact()).success).toBe(true);
  });

  it('accepts entry with optional iteration and note', () => {
    const entry = { ...fullArtifact(), iteration: 1, note: 'Initial' };
    expect(artifactEntrySchema.safeParse(entry).success).toBe(true);
  });

  it('accepts iteration: 0', () => {
    const entry = { ...fullArtifact(), iteration: 0 };
    expect(artifactEntrySchema.safeParse(entry).success).toBe(true);
  });

  it('rejects entry missing required field', () => {
    const { filename: _, ...rest } = fullArtifact();
    expect(artifactEntrySchema.safeParse(rest).success).toBe(false);
  });

  it('rejects entry with non-number iteration', () => {
    const entry = { ...fullArtifact(), iteration: 'one' };
    expect(artifactEntrySchema.safeParse(entry).success).toBe(false);
  });

  it('rejects entry with non-string note', () => {
    const entry = { ...fullArtifact(), note: 42 };
    expect(artifactEntrySchema.safeParse(entry).success).toBe(false);
  });

  it('rejects entry that is not an object', () => {
    expect(artifactEntrySchema.safeParse('not an object').success).toBe(false);
  });
});

// -- v2 context --------------------------------------------------------------

describe('v2ContextSchema', () => {
  it('accepts minimal valid context', () => {
    expect(v2ContextSchema.safeParse(minimalContext()).success).toBe(true);
  });

  it('accepts context with optional ticketId', () => {
    const ctx = { ...minimalContext(), ticketId: 'CODY-35' };
    const result = v2ContextSchema.safeParse(ctx);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ticketId).toBe('CODY-35');
    }
  });

  it('accepts completedAt as string', () => {
    const ctx = { ...minimalContext(), completedAt: '2026-01-01T12:00:00Z' };
    expect(v2ContextSchema.safeParse(ctx).success).toBe(true);
  });

  it('accepts completedAt as null', () => {
    const ctx = { ...minimalContext(), completedAt: null };
    expect(v2ContextSchema.safeParse(ctx).success).toBe(true);
  });

  it('accepts completedAt as undefined (absent)', () => {
    const ctx = minimalContext();
    expect(v2ContextSchema.safeParse(ctx).success).toBe(true);
    expect(ctx).not.toHaveProperty('completedAt');
  });

  it('rejects missing required field', () => {
    const { runId: _, ...ctx } = minimalContext();
    const result = v2ContextSchema.safeParse(ctx);
    expect(result.success).toBe(false);
  });

  it('rejects invalid status', () => {
    const ctx = { ...minimalContext(), status: 'invalid' };
    const result = v2ContextSchema.safeParse(ctx);
    expect(result.success).toBe(false);
  });

  it('produces meaningful error paths', () => {
    const ctx = { ...minimalContext(), status: 'unknown' };
    const result = v2ContextSchema.safeParse(ctx);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('status');
    }
  });
});

// -- v2 config ---------------------------------------------------------------

describe('v2ConfigSchema', () => {
  it('accepts empty config', () => {
    expect(v2ConfigSchema.safeParse({}).success).toBe(true);
  });

  it('accepts all optional fields', () => {
    const config = {
      externalPlan: true,
      mergeBaseSha: 'abc',
      diffBase: 'origin/main',
      maxReviewRounds: 3,
      fixLowFindings: false,
      mode: 'orchestrated',
      model: 'claude-opus-4-6',
    };
    expect(v2ConfigSchema.safeParse(config).success).toBe(true);
  });

  it('rejects non-boolean externalPlan', () => {
    expect(v2ConfigSchema.safeParse({ externalPlan: 'yes' }).success).toBe(false);
  });

  it('rejects non-number maxReviewRounds', () => {
    expect(v2ConfigSchema.safeParse({ maxReviewRounds: '3' }).success).toBe(false);
  });

  it('passes through unknown keys like pipeline and models', () => {
    const config = {
      mode: 'orchestrated',
      pipeline: ['architecture', 'planning', 'implementation'],
      models: { default: 'sonnet', coder: 'opus' },
    };
    const result = v2ConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveProperty('pipeline');
      expect(result.data).toHaveProperty('models');
    }
  });
});

// -- v2 run-index ------------------------------------------------------------

describe('v2RunIndexSchema', () => {
  it('accepts minimal valid v2', () => {
    expect(v2RunIndexSchema.safeParse(minimalV2()).success).toBe(true);
  });

  it('enforces version: 2 literal', () => {
    const v1 = { ...minimalV2(), version: 1 };
    expect(v2RunIndexSchema.safeParse(v1).success).toBe(false);
  });

  it('rejects missing context', () => {
    expect(v2RunIndexSchema.safeParse({ version: 2, config: {} }).success).toBe(false);
  });

  it('rejects missing config', () => {
    expect(v2RunIndexSchema.safeParse({ version: 2, context: minimalContext() }).success).toBe(false);
  });

  it('accepts with artifacts array', () => {
    const v2 = { ...minimalV2(), artifacts: [fullArtifact()] };
    expect(v2RunIndexSchema.safeParse(v2).success).toBe(true);
  });

  it('accepts without artifacts field', () => {
    expect(v2RunIndexSchema.safeParse(minimalV2()).success).toBe(true);
  });

  it('accepts empty artifacts array', () => {
    const v2 = { ...minimalV2(), artifacts: [] };
    expect(v2RunIndexSchema.safeParse(v2).success).toBe(true);
  });

  it('rejects non-array artifacts', () => {
    const v2 = { ...minimalV2(), artifacts: 'not-an-array' };
    expect(v2RunIndexSchema.safeParse(v2).success).toBe(false);
  });

  it('rejects artifact with missing required fields', () => {
    const v2 = { ...minimalV2(), artifacts: [{ filename: 'test.md' }] };
    expect(v2RunIndexSchema.safeParse(v2).success).toBe(false);
  });

  it('rejects mixed array with one valid and one invalid artifact', () => {
    const v2 = {
      ...minimalV2(),
      artifacts: [fullArtifact(), { filename: 'incomplete.md' }],
    };
    const result = v2RunIndexSchema.safeParse(v2);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths.some((p) => p.startsWith('artifacts.1'))).toBe(true);
    }
  });

  it('produces meaningful error paths for nested failures', () => {
    const v2 = {
      ...minimalV2(),
      context: { ...minimalContext(), status: 'unknown' },
    };
    const result = v2RunIndexSchema.safeParse(v2);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('context.status');
    }
  });
});
