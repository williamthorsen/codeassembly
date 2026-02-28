import { describe, expect, it } from 'vitest';

import { formatRunId } from '../format-run-id.js';

describe('formatRunId', () => {
  it('strips the -orchestrated suffix', () => {
    expect(formatRunId('20260228-035020Z-orchestrated')).toBe('20260228-035020Z');
  });

  it('preserves unknown suffixes', () => {
    expect(formatRunId('20260228-035020Z-custom')).toBe('20260228-035020Z-custom');
  });

  it('preserves IDs with no suffix', () => {
    expect(formatRunId('20260228-035020Z')).toBe('20260228-035020Z');
  });

  it('preserves short test-style IDs', () => {
    expect(formatRunId('run-a')).toBe('run-a');
  });
});
