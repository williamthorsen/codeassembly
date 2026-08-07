import { describe, expect, it, vi } from 'vitest';

import { emitReport } from '../emit-report.ts';

describe(emitReport, () => {
  // The console boundary is what this module is, so spying on it here is the assertion rather than a workaround.
  it('routes each line to the stream its level names, in the order given', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      emitReport([
        { level: 'info', text: 'first' },
        { level: 'warn', text: 'caution' },
        { level: 'info', text: 'second' },
      ]);

      expect(info.mock.calls.map((call) => String(call[0]))).toEqual(['first', 'second']);
      expect(warn.mock.calls.map((call) => String(call[0]))).toEqual(['caution']);
    } finally {
      info.mockRestore();
      warn.mockRestore();
    }
  });
});
