import { describe, expect, it } from 'vitest';

import { formatBytes, formatDelta } from '../format-bytes.ts';

describe(formatBytes, () => {
  it('renders a sub-kibibyte count in bytes, so that it is distinguishable from nothing', () => {
    expect(formatBytes(45)).toBe('45 B');
  });

  it('renders a count of one kibibyte and above in kibibytes, to one decimal place', () => {
    expect(formatBytes(1_024)).toBe('1.0 KiB');
    expect(formatBytes(12_698)).toBe('12.4 KiB');
  });

  it('renders nothing as zero bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
  });
});

describe(formatDelta, () => {
  it('signs growth, so that a column of deltas states its direction', () => {
    expect(formatDelta(412)).toBe('+412 B');
    expect(formatDelta(1_331)).toBe('+1.3 KiB');
  });

  it('signs a reduction, rendering its magnitude at the same scale', () => {
    expect(formatDelta(-412)).toBe('-412 B');
    expect(formatDelta(-1_331)).toBe('-1.3 KiB');
  });

  it('renders a change of nothing as a signed zero', () => {
    expect(formatDelta(0)).toBe('+0 B');
  });
});
