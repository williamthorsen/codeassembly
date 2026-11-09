import { describe, expect, it } from 'vitest';

import { formatStateName } from '../format-state-name.ts';

describe(formatStateName, () => {
  it('writes a snake_case key as words in sentence case', () => {
    expect(formatStateName('stage_the_unit')).toBe('Stage the unit');
  });

  it('keeps the case of every character after the first', () => {
    expect(formatStateName('open_the_PR')).toBe('Open the PR');
  });

  it('collapses runs of underscores, hyphens, and whitespace, and trims them', () => {
    expect(formatStateName('__ask -  for_the--order__')).toBe('Ask for the order');
  });

  it('leaves a key that is already words unchanged', () => {
    expect(formatStateName('Report the result')).toBe('Report the result');
  });

  it('returns undefined for a key without words', () => {
    expect(formatStateName('_-_')).toBeUndefined();
  });
});
