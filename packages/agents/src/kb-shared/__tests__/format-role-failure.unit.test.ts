import { describe, expect, it } from 'vitest';

import { formatRoleFailure } from '../format-role-failure.ts';

describe(formatRoleFailure, () => {
  it.each([
    ['no-default', 'no-default-store', '--store @default was given but kb.yaml does not configure default_kb'],
    ['no-feedback', 'no-feedback-store', '--store @feedback was given but kb.yaml does not configure feedback_kb'],
  ] as const)('names the unset key for %s', (reason, error, message) => {
    expect(formatRoleFailure({ ok: false, reason })).toEqual({ error, message });
  });

  it.each([
    ['no-default', 'no-default-store', 'default'],
    ['no-feedback', 'no-feedback-store', 'feedback'],
  ] as const)('names the registry-load cause for %s', (reason, error, label) => {
    expect(formatRoleFailure({ ok: false, reason, registryError: 'bad yaml' })).toEqual({
      error,
      message: `could not resolve the ${label} event store: bad yaml`,
    });
  });
});
