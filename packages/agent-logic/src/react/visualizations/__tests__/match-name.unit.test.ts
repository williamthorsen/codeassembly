import { describe, expect, it } from 'vitest';

import { matchesName } from '../match-name.ts';

describe(matchesName, () => {
  it('matches a name that contains the query, ignoring case and the space around it', () => {
    expect(matchesName('Password reset', '  RESET ')).toBe(true);
    expect(matchesName('Password reset', 'word re')).toBe(true);
  });

  it('matches every name with an empty or blank query', () => {
    expect(matchesName('Password reset', '')).toBe(true);
    expect(matchesName('Password reset', ' '.repeat(3))).toBe(true);
  });

  it('does not match a name that does not contain the query', () => {
    expect(matchesName('Password reset', 'refund')).toBe(false);
  });
});
