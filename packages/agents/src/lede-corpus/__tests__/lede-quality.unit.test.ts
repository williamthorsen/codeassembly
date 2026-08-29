import { describe, expect, it } from 'vitest';

import { isLedeQuality, LEDE_QUALITY_LEVELS, meetsQualityFloor } from '../lede-quality.ts';

describe('LEDE_QUALITY_LEVELS', () => {
  it('declares the five levels lowest to highest', () => {
    expect(LEDE_QUALITY_LEVELS).toStrictEqual(['poor', 'adequate', 'good', 'strong', 'exemplary']);
  });
});

describe(isLedeQuality, () => {
  it('accepts every declared level', () => {
    for (const level of LEDE_QUALITY_LEVELS) {
      expect(isLedeQuality(level)).toBe(true);
    }
  });

  it('rejects a string outside the scale', () => {
    expect(isLedeQuality('excellent')).toBe(false);
  });

  it('rejects a non-string', () => {
    expect(isLedeQuality(3)).toBe(false);
    expect(isLedeQuality(undefined)).toBe(false);
  });
});

describe(meetsQualityFloor, () => {
  it('admits a rating above the floor', () => {
    expect(meetsQualityFloor({ quality: 'strong', floor: 'good' })).toBe(true);
  });

  it('admits a rating equal to the floor', () => {
    expect(meetsQualityFloor({ quality: 'good', floor: 'good' })).toBe(true);
  });

  it('rejects a rating below the floor', () => {
    expect(meetsQualityFloor({ quality: 'adequate', floor: 'good' })).toBe(false);
  });

  it('admits every level against the lowest floor', () => {
    for (const level of LEDE_QUALITY_LEVELS) {
      expect(meetsQualityFloor({ quality: level, floor: 'poor' })).toBe(true);
    }
  });

  it('admits only the highest level against the highest floor', () => {
    const admitted = LEDE_QUALITY_LEVELS.filter((level) => meetsQualityFloor({ quality: level, floor: 'exemplary' }));

    expect(admitted).toStrictEqual(['exemplary']);
  });
});
