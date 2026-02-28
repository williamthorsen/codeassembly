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
    const result = userSettingsSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dismissedRuns['alpha/T-1/run-a']?.status).toBe('completed');
    }
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
