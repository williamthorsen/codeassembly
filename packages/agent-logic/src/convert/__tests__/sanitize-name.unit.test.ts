import { describe, expect, it } from 'vitest';

import { sanitizeName } from '../sanitize-name.ts';

describe(sanitizeName, () => {
  it.each([
    ['Refund Request', 'refund-request'],
    ['  Café: refunds / v2!  ', 'caf-refunds-v2'],
    ['../../etc/passwd', 'etc-passwd'],
    ['***', 'prompt'],
    ['a'.repeat(59) + ' b', 'a'.repeat(59)],
  ])('turns %j into %j', (name, expected) => {
    expect(sanitizeName(name)).toBe(expected);
  });
});
