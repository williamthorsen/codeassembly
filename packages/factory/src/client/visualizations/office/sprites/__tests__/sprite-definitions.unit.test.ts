import { describe, expect, it } from 'vitest';

import {
  CHARACTER_FRAME_COLS,
  CHARACTER_FRAME_ROWS,
  CHARACTER_ROLE_MAP,
  CHARACTER_SPRITE_H,
  CHARACTER_SPRITE_W,
  DIR_DOWN,
  DIR_LEFT,
  DIR_RIGHT,
  DIR_UP,
  FURNITURE_MANIFEST,
  resolveCharacterName,
} from '../sprite-definitions.ts';

describe('sprite dimension constants', () => {
  it('defines a 4-column x 1-row character sprite layout', () => {
    expect(CHARACTER_FRAME_COLS).toBe(4);
    expect(CHARACTER_FRAME_ROWS).toBe(1);
  });

  it('defines 32x64 character sprite dimensions (1x2 tiles)', () => {
    expect(CHARACTER_SPRITE_W).toBe(32);
    expect(CHARACTER_SPRITE_H).toBe(64);
  });

  it('defines four directional indices', () => {
    expect(DIR_DOWN).toBe(0);
    expect(DIR_LEFT).toBe(1);
    expect(DIR_RIGHT).toBe(2);
    expect(DIR_UP).toBe(3);
  });
});

describe('FURNITURE_MANIFEST', () => {
  it('contains furniture items', () => {
    expect(FURNITURE_MANIFEST.length).toBeGreaterThan(0);
  });

  it('every item has a label and tile coordinates', () => {
    for (const item of FURNITURE_MANIFEST) {
      expect(item.label).toBeTruthy();
      expect(typeof item.tx).toBe('number');
      expect(typeof item.ty).toBe('number');
    }
  });

  it('every item has either an asset or a region', () => {
    for (const item of FURNITURE_MANIFEST) {
      const hasAsset = item.asset !== undefined;
      const hasRegion = item.region !== undefined;
      expect(hasAsset || hasRegion).toBe(true);
    }
  });
});

describe('CHARACTER_ROLE_MAP', () => {
  it('maps all standard workflow phases', () => {
    expect(CHARACTER_ROLE_MAP.architecture).toBe('Alex');
    expect(CHARACTER_ROLE_MAP.planning).toBe('Amelia');
    expect(CHARACTER_ROLE_MAP.implementation).toBe('Dan');
    expect(CHARACTER_ROLE_MAP.review).toBe('Bob');
    expect(CHARACTER_ROLE_MAP.simplifier).toBe('Ash');
    expect(CHARACTER_ROLE_MAP.holistic).toBe('Rob');
    expect(CHARACTER_ROLE_MAP.orchestrator).toBe('Adam');
  });
});

describe(resolveCharacterName, () => {
  it('returns the mapped character for non-reviewer phases', () => {
    expect(resolveCharacterName('architecture', 'agent-1')).toBe('Alex');
    expect(resolveCharacterName('planning', 'agent-2')).toBe('Amelia');
    expect(resolveCharacterName('implementation', 'agent-3')).toBe('Dan');
  });

  it('returns a reviewer-pool character for reviewer phases', () => {
    const reviewerPool = new Set(['Bob', 'Ash', 'Rob']);

    expect(reviewerPool.has(resolveCharacterName('review', 'test-agent'))).toBe(true);
    expect(reviewerPool.has(resolveCharacterName('simplifier', 'test-agent'))).toBe(true);
    expect(reviewerPool.has(resolveCharacterName('holistic', 'test-agent'))).toBe(true);
  });

  it('returns the same character for the same agent ID (hash stability)', () => {
    const first = resolveCharacterName('review', 'reviewer-abc');
    const second = resolveCharacterName('review', 'reviewer-abc');
    expect(first).toBe(second);
  });

  it('can produce different characters for different agent IDs (hash distribution)', () => {
    // Try enough distinct IDs that at least two different characters appear
    const characters = new Set<string>();
    for (let i = 0; i < 20; i++) {
      characters.add(resolveCharacterName('review', `reviewer-${String(i)}`));
    }
    expect(characters.size).toBeGreaterThan(1);
  });

  it('returns "Adam" for an unknown phase', () => {
    expect(resolveCharacterName('unknown-phase', 'agent-1')).toBe('Adam');
  });
});
