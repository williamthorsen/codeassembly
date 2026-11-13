import { describe, expect, it } from 'vitest';

import { DEFAULT_GROWTH_CEILING_BYTES } from '../build-size-report.ts';
import { resolveGrowthCeiling } from '../resolve-growth-ceiling.ts';

const INVALID_VALUES = ['0', '-1', '1.5', '8k', '08', ' 8', 'eight'];

describe(resolveGrowthCeiling, () => {
  it('returns the default when neither the option nor the variable is set', () => {
    expect(resolveGrowthCeiling({ option: undefined, env: {} })).toBe(DEFAULT_GROWTH_CEILING_BYTES);
  });

  it('converts the option from KiB to bytes', () => {
    expect(resolveGrowthCeiling({ option: '8', env: {} })).toBe(8192);
  });

  it('converts the variable from KiB to bytes', () => {
    expect(resolveGrowthCeiling({ option: undefined, env: { CODEASSEMBLY_GROWTH_CEILING_KIB: '12' } })).toBe(12_288);
  });

  it('prefers the option to the variable', () => {
    expect(resolveGrowthCeiling({ option: '8', env: { CODEASSEMBLY_GROWTH_CEILING_KIB: '12' } })).toBe(8192);
  });

  it('does not report an invalid variable that a valid option overrides', () => {
    expect(resolveGrowthCeiling({ option: '8', env: { CODEASSEMBLY_GROWTH_CEILING_KIB: 'eight' } })).toBe(8192);
  });

  it('treats an empty variable as unset', () => {
    expect(resolveGrowthCeiling({ option: undefined, env: { CODEASSEMBLY_GROWTH_CEILING_KIB: '' } })).toBe(
      DEFAULT_GROWTH_CEILING_BYTES,
    );
  });

  it.each(INVALID_VALUES)('rejects the option %j, naming the option', (value) => {
    expect(() => resolveGrowthCeiling({ option: value, env: {} })).toThrow(
      `--growth-ceiling-kib must be a positive integer (KiB); got "${value}"`,
    );
  });

  it.each(INVALID_VALUES)('rejects the variable %j, naming the variable', (value) => {
    expect(() => resolveGrowthCeiling({ option: undefined, env: { CODEASSEMBLY_GROWTH_CEILING_KIB: value } })).toThrow(
      `CODEASSEMBLY_GROWTH_CEILING_KIB must be a positive integer (KiB); got "${value}"`,
    );
  });
});
