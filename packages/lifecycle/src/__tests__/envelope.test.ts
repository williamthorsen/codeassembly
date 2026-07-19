import { describe, expect, it } from 'vitest';

import { EVENT_TYPES, isEventType } from '../envelope.ts';

describe('isEventType', () => {
  it('accepts every declared event type', () => {
    for (const type of EVENT_TYPES) {
      expect(isEventType(type)).toBe(true);
    }
  });

  it('rejects an undeclared type', () => {
    expect(isEventType('input.received')).toBe(false);
  });

  it('rejects the empty string', () => {
    expect(isEventType('')).toBe(false);
  });
});
