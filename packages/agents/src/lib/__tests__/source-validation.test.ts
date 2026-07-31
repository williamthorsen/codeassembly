import { describe, expect, it } from 'vitest';

import { describeSourceNameProblem } from '../source-validation.ts';

describe(describeSourceNameProblem, () => {
  it.each(['org-guidance', '@williamthorsen/nmr', 'a.b_c-1'])('accepts %s', (name) => {
    expect(describeSourceNameProblem(name)).toBeUndefined();
  });

  it.each([
    { name: '', reason: /empty/ },
    { name: '..', reason: /relative path segment/ },
    { name: '../escape', reason: /relative path segment/ },
    { name: 'org/../escape', reason: /relative path segment/ },
    { name: '.', reason: /relative path segment/ },
    { name: '/absolute', reason: /absolute path/ },
    { name: 'org//nested', reason: /empty path segment/ },
    { name: 'org/', reason: /empty path segment/ },
    { name: String.raw`org\win`, reason: /path separator or control character/ },
  ])('rejects $name', ({ name, reason }) => {
    expect(describeSourceNameProblem(name)).toMatch(reason);
  });
});
