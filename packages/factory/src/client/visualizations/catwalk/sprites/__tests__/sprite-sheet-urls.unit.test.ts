import { describe, expect, it } from 'vitest';

import { SPRITE_SHEET_URLS } from '../sprite-sheet-urls.ts';

describe('SPRITE_SHEET_URLS', () => {
  it('exports a subagent URL string', () => {
    expect(typeof SPRITE_SHEET_URLS.subagent).toBe('string');
    expect(SPRITE_SHEET_URLS.subagent.length).toBeGreaterThan(0);
  });

  it('exports an orchestrator URL string', () => {
    expect(typeof SPRITE_SHEET_URLS.orchestrator).toBe('string');
    expect(SPRITE_SHEET_URLS.orchestrator.length).toBeGreaterThan(0);
  });

  it('exports distinct URLs for subagent and orchestrator', () => {
    expect(SPRITE_SHEET_URLS.subagent).not.toBe(SPRITE_SHEET_URLS.orchestrator);
  });
});
