import { describe, expect, it } from 'vitest';

import { userSettingsSchema } from '../settings-schema.js';

describe('userSettingsSchema', () => {
  it('accepts empty dismissedRuns', () => {
    expect(userSettingsSchema.safeParse({ dismissedRuns: {} }).success).toBe(true);
  });

  it('accepts valid dismissed-run entries', () => {
    const data = {
      dismissedRuns: {
        'alpha/T-1/run-a': { status: 'completed' },
        'beta/T-2/run-b': { status: 'in_progress' },
      },
    };
    const parsed = userSettingsSchema.parse(data);
    expect(parsed.dismissedRuns['alpha/T-1/run-a']?.status).toBe('completed');
    expect(parsed.dismissedRuns['beta/T-2/run-b']?.status).toBe('in_progress');
  });

  it('rejects missing dismissedRuns key', () => {
    expect(userSettingsSchema.safeParse({}).success).toBe(false);
  });

  it('rejects entry without status', () => {
    const data = { dismissedRuns: { 'alpha/T-1/run-a': {} } };
    expect(userSettingsSchema.safeParse(data).success).toBe(false);
  });

  it('rejects entry with non-string status', () => {
    const data = { dismissedRuns: { 'alpha/T-1/run-a': { status: 42 } } };
    expect(userSettingsSchema.safeParse(data).success).toBe(false);
  });
});
